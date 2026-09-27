//! Routes de l'API. Des commandes, pas un CRUD (ADR 0024).

use std::sync::Arc;

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use etymo_contrat::{
    DemandeFusion, DemandeSession, Erreur, Etat, IssueFusion, ReponseFusion, Sante, Session,
    StatutSante,
};
use etymo_domaine::fusion::{Issue, TABLE_MAX, TABLE_MIN, consommation, resoudre};

use crate::erreur::ErreurApi;
use crate::extraction::{Adresse, Joueur, JsonStrict};
use crate::{EtatApp, debit, progression, secret};

pub fn routes() -> Router<Arc<EtatApp>> {
    Router::new()
        .route("/sante", get(sante))
        .route("/session", post(session))
        .route("/etat", get(etat))
        .route("/fusion", post(fusion))
}

/// État du service. Répond même si la base est au repos (Serverless SQL).
#[utoipa::path(get, path = "/sante", tag = "service",
    responses((status = 200, description = "Service disponible", body = Sante)))]
pub async fn sante(State(app): State<Arc<EtatApp>>) -> Json<Sante> {
    let version_catalogue = app.catalogue.version();
    Json(Sante {
        statut: if version_catalogue.is_some() {
            StatutSante::Ok
        } else {
            StatutSante::Degrade
        },
        version_catalogue,
        version_api: env!("CARGO_PKG_VERSION").to_owned(),
    })
}

/// Ouvre ou renouvelle la session d'un profil invité.
///
/// Au premier appel pour une installation, le profil est créé avec
/// l'empreinte du secret. Ensuite, le même secret doit être présenté.
#[utoipa::path(post, path = "/session", tag = "profil", request_body = DemandeSession,
    responses(
        (status = 200, description = "Session ouverte", body = Session),
        (status = 400, description = "Requête invalide", body = Erreur),
        (status = 401, description = "Secret incorrect", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
    ))]
pub async fn session(
    State(app): State<Arc<EtatApp>>,
    Adresse(adresse): Adresse,
    JsonStrict(demande): JsonStrict<DemandeSession>,
) -> Result<Json<Session>, ErreurApi> {
    debit::verifier(&app.limiteurs.par_adresse, &adresse)?;
    if demande.installation.get_version_num() != 4 {
        return Err(ErreurApi::RequeteInvalide(
            "installation : UUID v4 attendu".into(),
        ));
    }
    let empreinte = secret::empreinte(&demande.secret).ok_or_else(|| {
        ErreurApi::RequeteInvalide("secret : 256 bits en base64url attendus".into())
    })?;

    let cree = sqlx::query_scalar!(
        "INSERT INTO joueur (id, empreinte_secret) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id",
        demande.installation,
        &empreinte[..],
    )
    .fetch_optional(&app.base)
    .await?
    .is_some();

    if !cree {
        let connue = sqlx::query_scalar!(
            "UPDATE joueur SET derniere_activite = now() WHERE id = $1 RETURNING empreinte_secret",
            demande.installation,
        )
        .fetch_optional(&app.base)
        .await?
        .ok_or(ErreurApi::NonAuthentifie)?;
        if !secret::egales(&connue, &empreinte) {
            return Err(ErreurApi::NonAuthentifie);
        }
    }

    let (jeton, expire_le) = app.signataire.emettre(demande.installation, Utc::now());
    Ok(Json(Session {
        jeton,
        expire_le,
        nouveau: cree,
    }))
}

/// Synchronise le joueur : accorde les graines des fascicules parus qu'il
/// n'a pas encore reçues (ADR 0030), puis renvoie son état confirmé.
#[utoipa::path(get, path = "/etat", tag = "profil", security(("session" = [])),
    responses(
        (status = 200, description = "État confirmé", body = Etat),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
    ))]
pub async fn etat(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
) -> Result<Json<Etat>, ErreurApi> {
    let catalogue = app.catalogue.courant();
    let mut tx = app.base.begin().await?;
    progression::verrouiller(&mut tx, joueur).await?;
    if let Some(catalogue) = &catalogue {
        if progression::semer(&mut tx, joueur, &catalogue.jeu).await? {
            progression::incrementer_version(&mut tx, joueur).await?;
        }
        sqlx::query!(
            "UPDATE joueur SET version_catalogue = $2 WHERE id = $1 AND version_catalogue IS DISTINCT FROM $2",
            joueur,
            catalogue.version(),
        )
        .execute(&mut *tx)
        .await?;
    }
    let etat = progression::etat(&mut tx, joueur).await?;
    tx.commit().await?;
    Ok(Json(etat))
}

/// Tente une fusion. Le serveur fait foi (ADR 0007, ADR 0027) : il valide la
/// recette, vérifie la réserve, consomme les exemplaires et ajoute le mot au
/// codex dans une seule transaction. Seule une découverte modifie l'état ;
/// elle seule est enregistrée pour l'idempotence, et elle seule exige que
/// `version_etat` et `version_catalogue` soient à jour (sinon `409`).
#[utoipa::path(post, path = "/fusion", tag = "jeu", security(("session" = [])), request_body = DemandeFusion,
    responses(
        (status = 200, description = "Issue de la fusion et état confirmé", body = ReponseFusion),
        (status = 400, description = "Requête invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 409, description = "État ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn fusion(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeFusion>,
) -> Result<Json<ReponseFusion>, ErreurApi> {
    if !(TABLE_MIN..=TABLE_MAX).contains(&demande.briques.len()) {
        return Err(ErreurApi::RequeteInvalide(format!(
            "briques : de {TABLE_MIN} à {TABLE_MAX} attendues"
        )));
    }
    if demande.commande.get_version_num() != 4 {
        return Err(ErreurApi::RequeteInvalide(
            "commande : UUID v4 attendu".into(),
        ));
    }
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;

    let mut tx = app.base.begin().await?;
    let version_etat = progression::verrouiller(&mut tx, joueur).await?;
    let deja = sqlx::query_scalar!(
        "SELECT reponse FROM commande WHERE joueur_id = $1 AND id = $2",
        joueur,
        demande.commande
    )
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(reponse) = deja {
        let reponse =
            serde_json::from_value(reponse).map_err(|e| ErreurApi::Interne(e.to_string()))?;
        return Ok(Json(reponse));
    }

    let decouverts = progression::mots_decouverts(&mut tx, joueur).await?;
    let jeu = &catalogue.jeu;
    let issue = match resoudre(
        &demande.briques,
        &jeu.recettes,
        &jeu.exclusions,
        &decouverts,
    ) {
        Issue::Decouverte { recette_id, mot_id } => {
            if demande.version_etat != version_etat {
                return Err(ErreurApi::Conflit("version_etat périmée"));
            }
            if demande.version_catalogue != catalogue.version() {
                return Err(ErreurApi::Conflit("version_catalogue périmée"));
            }
            let besoins: Vec<_> = consommation(&demande.briques).into_iter().collect();
            let manquantes = progression::manquantes(&mut tx, joueur, &besoins).await?;
            if manquantes.is_empty() {
                progression::decouvrir(
                    &mut tx,
                    joueur,
                    demande.commande,
                    &besoins,
                    &recette_id,
                    &mot_id,
                )
                .await?;
                progression::incrementer_version(&mut tx, joueur).await?;
                IssueFusion::Decouverte { recette_id, mot_id }
            } else {
                IssueFusion::ReserveInsuffisante {
                    briques: manquantes,
                }
            }
        }
        Issue::Connue { recette_id, mot_id } => IssueFusion::Connue { recette_id, mot_id },
        Issue::Exclue { raison } => IssueFusion::Exclue { raison },
        Issue::Presque { motif } => IssueFusion::Presque { motif },
        Issue::Echec => IssueFusion::Echec,
    };
    let reponse = ReponseFusion {
        etat: progression::etat(&mut tx, joueur).await?,
        issue,
    };
    if matches!(reponse.issue, IssueFusion::Decouverte { .. }) {
        let enregistree =
            serde_json::to_value(&reponse).map_err(|e| ErreurApi::Interne(e.to_string()))?;
        sqlx::query!(
            "INSERT INTO commande (joueur_id, id, type, statut, reponse) VALUES ($1, $2, 'fusion', 'acceptee', $3)",
            joueur,
            demande.commande,
            enregistree,
        )
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
    } else {
        // Une proposition qui ne modifie rien ne laisse aucune ligne (modèle de données §7).
        tx.rollback().await?;
    }
    Ok(Json(reponse))
}
