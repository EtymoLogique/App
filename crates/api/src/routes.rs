//! Routes de l'API. Des commandes, pas un CRUD (ADR 0024).

use std::sync::Arc;

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use etymo_contrat::{
    DemandeFusion, DemandePli, DemandeSession, Erreur, Etat, IssueFusion, OuverturePli,
    ReponseFusion, ReponsePli, Sante, Session, StatutSante,
};
use etymo_domaine::fusion::{Issue, TABLE_MAX, TABLE_MIN, consommation, resoudre};
use etymo_domaine::pli;

use crate::erreur::ErreurApi;
use crate::extraction::{Adresse, Joueur, JsonStrict};
use crate::{EtatApp, debit, progression, secret};

pub fn routes() -> Router<Arc<EtatApp>> {
    Router::new()
        .route("/sante", get(sante))
        .route("/session", post(session))
        .route("/etat", get(etat))
        .route("/fusion", post(fusion))
        .route("/pli", post(ouvrir_pli))
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
    let etat = progression::etat(&mut tx, joueur, app.recharge).await?;
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
    if let Some(reponse) = commande_rejouee(&mut tx, joueur, demande.commande).await? {
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
        etat: progression::etat(&mut tx, joueur, app.recharge).await?,
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

/// Réponse enregistrée d'une commande déjà traitée : rejouée à l'identique.
async fn commande_rejouee<T: serde::de::DeserializeOwned>(
    tx: &mut sqlx::PgConnection,
    joueur: uuid::Uuid,
    commande: uuid::Uuid,
) -> Result<Option<T>, ErreurApi> {
    sqlx::query_scalar!(
        "SELECT reponse FROM commande WHERE joueur_id = $1 AND id = $2",
        joueur,
        commande
    )
    .fetch_optional(tx)
    .await?
    .map(|r| serde_json::from_value(r).map_err(|e| ErreurApi::Interne(e.to_string())))
    .transpose()
}

/// Décision d'un pli, avant toute écriture.
struct Tirage<'a> {
    brique: &'a pli::BriquePli,
    resultat: pli::Resultat,
    regle: pli::Regle,
    gouttes: u32,
    /// Exemplaires avant et après ; `None` avant : brique inconnue.
    avant: Option<u8>,
    apres: u8,
    compteurs: pli::Compteurs,
}

/// Choisit la règle (tirage, garantie, filet), tire la brique et calcule ses
/// effets : le domaine décide, l'aléa vient du système.
fn tirer_pli<'a>(
    jeu: &etymo_catalogue::Jeu,
    pli_jeu: &'a etymo_catalogue::PliJeu,
    parametres: &pli::Equilibrage,
    mut stock: std::collections::HashMap<etymo_domaine::IdCatalogue, u8>,
    decouverts: &std::collections::HashSet<etymo_domaine::IdCatalogue>,
    compteurs: pli::Compteurs,
) -> Result<Tirage<'a>, ErreurApi> {
    let bloque_avant = !pli::decouverte_possible(&jeu.recettes, &stock, decouverts);
    let connues: std::collections::HashSet<_> = stock.keys().cloned().collect();
    let utiles = pli::briques_utiles(&pli_jeu.briques, &jeu.recettes, &stock, decouverts);
    let (regle, eligibles) = pli::regle(
        &pli_jeu.briques,
        compteurs,
        parametres,
        &connues,
        &utiles,
        bloque_avant,
    );
    let somme = pli::somme_eligible(&pli_jeu.briques, &eligibles, parametres);
    let brique = pli::tirer(&pli_jeu.briques, &eligibles, parametres, alea(somme)?)
        .ok_or_else(|| ErreurApi::Interne("aucune brique tirable".into()))?;
    let avant = stock.get(&brique.id).copied();
    let resultat = pli::resultat(avant);
    let apres = match resultat {
        pli::Resultat::ReservePleine => avant.unwrap_or(0),
        _ => avant.unwrap_or(0) + 1,
    };
    stock.insert(brique.id.clone(), apres);
    let bloque_apres = !pli::decouverte_possible(&jeu.recettes, &stock, decouverts);
    Ok(Tirage {
        brique,
        resultat,
        regle,
        gouttes: pli::encre(resultat, brique.rarete, parametres),
        avant,
        apres,
        compteurs: pli::compteurs_apres(compteurs, resultat, bloque_avant, bloque_apres),
    })
}

/// Aléa cryptographique uniforme dans `[0, somme)`, sans biais (rejet).
fn alea(somme: u64) -> Result<u64, ErreurApi> {
    let borne = pli::borne_sans_biais(somme);
    loop {
        let tire = getrandom::u64().map_err(|e| ErreurApi::Interne(e.to_string()))?;
        if tire <= borne {
            return Ok(tire % somme.max(1));
        }
    }
}

/// Ouvre le pli d'un fascicule paru (ADR 0011, 0012, 0016, 0019, 0020). Le
/// serveur fait foi : il consomme une charge, tire la brique avec un aléa
/// cryptographique, applique la garantie de nouveauté ou le filet d'utilité,
/// crédite l'exemplaire et l'encre, dans une seule transaction idempotente.
#[utoipa::path(post, path = "/pli", tag = "jeu", security(("session" = [])), request_body = DemandePli,
    responses(
        (status = 200, description = "Brique tirée et état confirmé", body = ReponsePli),
        (status = 400, description = "Requête invalide ou fascicule sans pli", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Aucune charge d'énergie", body = Erreur),
        (status = 409, description = "État ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn ouvrir_pli(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandePli>,
) -> Result<Json<ReponsePli>, ErreurApi> {
    if demande.commande.get_version_num() != 4 {
        return Err(ErreurApi::RequeteInvalide(
            "commande : UUID v4 attendu".into(),
        ));
    }
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    let jeu = &catalogue.jeu;
    let pli_jeu = jeu
        .pli(&demande.fascicule_id)
        .filter(|p| !p.briques.is_empty())
        .ok_or_else(|| ErreurApi::RequeteInvalide("fascicule : aucun pli paru".into()))?;
    let equilibrage = pli_jeu
        .equilibrage
        .as_ref()
        .ok_or_else(|| ErreurApi::RequeteInvalide("fascicule : pli sans équilibrage".into()))?;

    let mut tx = app.base.begin().await?;
    let version_etat = progression::verrouiller(&mut tx, joueur).await?;
    if let Some(reponse) = commande_rejouee(&mut tx, joueur, demande.commande).await? {
        return Ok(Json(reponse));
    }
    if demande.version_etat != version_etat {
        return Err(ErreurApi::Conflit("version_etat périmée"));
    }
    if demande.version_catalogue != catalogue.version() {
        return Err(ErreurApi::Conflit("version_catalogue périmée"));
    }

    let maintenant = Utc::now();
    let energie = progression::lire_energie(&mut tx, joueur)
        .await?
        .consommer(maintenant, app.recharge)
        .ok_or(ErreurApi::Interdit("aucune charge d'énergie"))?;

    let stock = progression::stock(&mut tx, joueur).await?;
    let decouverts = progression::mots_decouverts(&mut tx, joueur).await?;
    let compteurs = progression::compteurs(&mut tx, joueur, &demande.fascicule_id).await?;
    let tirage = tirer_pli(
        jeu,
        pli_jeu,
        &equilibrage.parametres,
        stock,
        &decouverts,
        compteurs,
    )?;

    progression::ouvrir_pli(
        &mut tx,
        joueur,
        &progression::EffetsPli {
            commande: demande.commande,
            fascicule: &demande.fascicule_id,
            brique: &tirage.brique.id,
            resultat: tirage.resultat,
            regle: tirage.regle,
            gouttes: tirage.gouttes,
            energie,
            compteurs: tirage.compteurs,
            version_equilibrage: &equilibrage.version,
            maintenant,
        },
    )
    .await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponsePli {
        ouverture: OuverturePli {
            fascicule_id: demande.fascicule_id.clone(),
            brique_id: tirage.brique.id.clone(),
            resultat: tirage.resultat,
            regle: tirage.regle,
            encre: tirage.gouttes,
            ouvert_le: maintenant,
        },
        exemplaires: tirage.apres,
        etait_epuisee: tirage.avant == Some(0),
        etat: progression::etat(&mut tx, joueur, app.recharge).await?,
    };
    let enregistree =
        serde_json::to_value(&reponse).map_err(|e| ErreurApi::Interne(e.to_string()))?;
    sqlx::query!(
        "INSERT INTO commande (joueur_id, id, type, statut, reponse) VALUES ($1, $2, 'ouvrir_pli', 'acceptee', $3)",
        joueur,
        demande.commande,
        enregistree,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(reponse))
}
