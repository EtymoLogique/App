//! Routes de l'API. Des commandes, pas un CRUD (ADR 0024).

use std::sync::Arc;

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use etymo_contrat::{
    CarteRicochet, DemandeAchatSablier, DemandeCadeau, DemandeCarteDeLecteur, DemandeFusion,
    DemandeIndice, DemandeJalon, DemandePalier, DemandePli, DemandeQueteDuJour,
    DemandeQueteInitiale, DemandeRicochet, DemandeSablier, DemandeSession, Erreur, Etat,
    IssueFusion, OuverturePli, ReponseAchatSablier, ReponseCadeau, ReponseCarteDeLecteur,
    ReponseFusion, ReponseIndice, ReponseJalon, ReponsePalier, ReponsePli, ReponseQueteDuJour,
    ReponseQueteInitiale, ReponseRicochet, ReponseSablier, Sante, SeanceRicochets, Session,
    StatutSante,
};
use etymo_domaine::fusion::{Issue, TABLE_MAX, TABLE_MIN, consommation, resoudre};
use etymo_domaine::{indice, pli, sablier};
use uuid::Uuid;

use crate::erreur::ErreurApi;
use crate::extraction::{Adresse, Joueur, JsonStrict};
use crate::{
    EtatApp, carte_lecteur, debit, progression, quetes_initiales, quetes_jour, ricochets, secret,
};

pub fn routes() -> Router<Arc<EtatApp>> {
    Router::new()
        .route("/sante", get(sante))
        .route("/session", post(session))
        .route("/etat", get(etat))
        .route("/fusion", post(fusion))
        .route("/pli", post(ouvrir_pli))
        .route("/sablier", post(utiliser_sabliers))
        .route("/sablier/achat", post(acheter_sabliers))
        .route("/indice", post(acheter_indice))
        .route("/jalon", post(recuperer_jalon))
        .route("/ricochets/seance", get(seance_ricochets))
        .route("/ricochet", post(repondre_ricochet))
        .route("/palier", post(recuperer_palier))
        .route("/carte-de-lecteur", post(recuperer_carte_de_lecteur))
        .route("/cadeau", post(recuperer_cadeau))
        .route("/quete-initiale", post(recuperer_quete_initiale))
        .route("/quete-du-jour", post(recuperer_quete_du_jour))
}

/// Routes réservées au hors-production, absentes du routeur en production.
pub fn routes_hors_prod() -> Router<Arc<EtatApp>> {
    Router::new().route("/dev/reset", post(reinitialiser))
}

/// Remet le joueur à zéro, pour la recette hors production : codex vide,
/// réserve vide (les graines des fascicules parus ne sont pas rendues),
/// 10 000 gouttes. Route absente (`404`) en production.
#[utoipa::path(post, path = "/dev/reset", tag = "hors-production", security(("session" = [])),
    responses(
        (status = 200, description = "Joueur remis à zéro, état confirmé", body = Etat),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 404, description = "Production : route absente"),
    ))]
pub async fn reinitialiser(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
) -> Result<Json<Etat>, ErreurApi> {
    let mut tx = app.base.begin().await?;
    progression::verrouiller(&mut tx, joueur).await?;
    progression::reinitialiser(&mut tx, joueur).await?;
    if let Some(catalogue) = app.catalogue.courant() {
        progression::graines_sans_exemplaire(&mut tx, joueur, &catalogue.jeu).await?;
        sqlx::query!(
            "UPDATE joueur SET version_catalogue = $2 WHERE id = $1",
            joueur,
            catalogue.version(),
        )
        .execute(&mut *tx)
        .await?;
    }
    progression::incrementer_version(&mut tx, joueur).await?;
    let etat = etat_courant(&app, &mut tx, joueur).await?;
    tx.commit().await?;
    Ok(Json(etat))
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
        revision_api: std::env::var("ETYMO_REVISION").unwrap_or_default(),
        reinitialisation: app.reinitialisation,
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
            "UPDATE joueur SET jours_de_jeu = jours_de_jeu + ((derniere_activite AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date)::int,
                 mois_activite_precedente = CASE WHEN date_trunc('month', derniere_activite AT TIME ZONE 'UTC') < date_trunc('month', now() AT TIME ZONE 'UTC')
                     THEN date_trunc('month', derniere_activite AT TIME ZONE 'UTC')::date ELSE mois_activite_precedente END,
                 derniere_activite = now()
             WHERE id = $1 RETURNING empreinte_secret",
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
/// n'a pas encore reçues (ADR 0030), marque les jalons atteints depuis une
/// parution (ADR 0038), dont la récompense attend d'être récupérée
/// (ADR 0042), puis renvoie son état confirmé.
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
        let seme = progression::semer(&mut tx, joueur, &catalogue.jeu).await?;
        let jalons = progression::atteindre_jalons(&mut tx, joueur, &catalogue.jeu).await?;
        let restaurees =
            progression::restaurer_briques_de_mots(&mut tx, joueur, &catalogue.jeu).await?;
        if seme || restaurees || !jalons.is_empty() {
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
    let etat = etat_courant(&app, &mut tx, joueur).await?;
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
    let mut jalons = Vec::new();
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
                let gouttes = jeu.encre_decouverte(&mot_id);
                // Une brique-mot se possède sans s'user : posée, elle ne se consomme pas.
                let consommes: Vec<_> = besoins
                    .iter()
                    .filter(|(b, _)| !jeu.briques_de_mot.values().any(|m| m == *b))
                    .copied()
                    .collect();
                progression::decouvrir(
                    &mut tx,
                    joueur,
                    demande.commande,
                    &consommes,
                    &recette_id,
                    &mot_id,
                    gouttes,
                )
                .await?;
                if let Some(brique) = jeu.briques_de_mot.get(&mot_id) {
                    progression::offrir_brique_du_mot(&mut tx, joueur, demande.commande, brique)
                        .await?;
                }
                jalons = progression::atteindre_jalons(&mut tx, joueur, jeu).await?;
                progression::incrementer_version(&mut tx, joueur).await?;
                IssueFusion::Decouverte {
                    recette_id,
                    mot_id,
                    gouttes,
                }
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
        etat: etat_courant(&app, &mut tx, joueur).await?,
        issue,
        jalons,
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
        compteurs: pli::compteurs_apres(
            compteurs,
            resultat,
            brique.rarete == pli::Rarete::Legendaire,
            bloque_avant,
            bloque_apres,
        ),
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
        etat: etat_courant(&app, &mut tx, joueur).await?,
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

/// Ouvre la transaction d'une commande idempotente : verrouille le joueur,
/// rejoue une commande déjà traitée, refuse un état ou un catalogue périmé.
async fn debuter_commande<T: serde::de::DeserializeOwned>(
    app: &EtatApp,
    joueur: uuid::Uuid,
    commande: uuid::Uuid,
    version_etat: i64,
    version_catalogue: &str,
) -> Result<Result<progression::Tx<'static>, T>, ErreurApi> {
    if commande.get_version_num() != 4 {
        return Err(ErreurApi::RequeteInvalide(
            "commande : UUID v4 attendu".into(),
        ));
    }
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    let mut tx = app.base.begin().await?;
    let actuelle = progression::verrouiller(&mut tx, joueur).await?;
    if let Some(reponse) = commande_rejouee(&mut tx, joueur, commande).await? {
        return Ok(Err(reponse));
    }
    if version_etat != actuelle {
        return Err(ErreurApi::Conflit("version_etat périmée"));
    }
    if version_catalogue != catalogue.version() {
        return Err(ErreurApi::Conflit("version_catalogue périmée"));
    }
    Ok(Ok(tx))
}

/// Enregistre la réponse d'une commande acceptée et valide la transaction.
async fn conclure_commande<T: serde::Serialize>(
    mut tx: progression::Tx<'_>,
    joueur: uuid::Uuid,
    commande: uuid::Uuid,
    genre: &str,
    reponse: &T,
) -> Result<(), ErreurApi> {
    let enregistree =
        serde_json::to_value(reponse).map_err(|e| ErreurApi::Interne(e.to_string()))?;
    sqlx::query!(
        "INSERT INTO commande (joueur_id, id, type, statut, reponse) VALUES ($1, $2, $3, 'acceptee', $4)",
        joueur,
        commande,
        genre,
        enregistree,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

/// Échange de l'encre contre des sabliers (ADR 0039) : 10 gouttes chacun,
/// sans plafond.
#[utoipa::path(post, path = "/sablier/achat", tag = "jeu", security(("session" = [])), request_body = DemandeAchatSablier,
    responses(
        (status = 200, description = "Sabliers achetés et état confirmé", body = ReponseAchatSablier),
        (status = 400, description = "Requête invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Encre insuffisante", body = Erreur),
        (status = 409, description = "État ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn acheter_sabliers(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeAchatSablier>,
) -> Result<Json<ReponseAchatSablier>, ErreurApi> {
    if !(1..=sablier::ECHANGE_MAX).contains(&demande.nombre) {
        return Err(ErreurApi::RequeteInvalide(format!(
            "nombre : de 1 à {} attendu",
            sablier::ECHANGE_MAX
        )));
    }
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    let prix = progression::acheter_sabliers(
        &mut tx,
        joueur,
        demande.commande,
        demande.nombre,
        Utc::now(),
    )
    .await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseAchatSablier {
        prix,
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "sablier", &reponse).await?;
    Ok(Json(reponse))
}

/// Utilise des sabliers détenus (ADR 0018, 0020, 0039) : chacun avance la
/// recharge en cours d'une heure. Le temps au-delà de la capacité est perdu.
#[utoipa::path(post, path = "/sablier", tag = "jeu", security(("session" = [])), request_body = DemandeSablier,
    responses(
        (status = 200, description = "Recharge avancée et état confirmé", body = ReponseSablier),
        (status = 400, description = "Requête invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Énergie pleine ou sabliers insuffisants", body = Erreur),
        (status = 409, description = "État ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn utiliser_sabliers(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeSablier>,
) -> Result<Json<ReponseSablier>, ErreurApi> {
    let maximum = sablier::UTILES_MAX;
    if !(1..=maximum).contains(&demande.nombre) {
        return Err(ErreurApi::RequeteInvalide(format!(
            "nombre : de 1 à {maximum} attendu"
        )));
    }
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    progression::utiliser_sabliers(
        &mut tx,
        joueur,
        demande.commande,
        demande.nombre,
        app.recharge,
        Utc::now(),
    )
    .await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseSablier {
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "sablier", &reponse).await?;
    Ok(Json(reponse))
}

/// Achète un indice (ADR 0051) pour une recette encore à découvrir, dans
/// l'ordre : silhouette (1), définition (3), sens littéral (2). Un indice
/// n'est vendu qu'une fois les précédents obtenus ; une carte sans silhouette
/// commence à la définition. Le contenu se lit dans le
/// catalogue public.
#[utoipa::path(post, path = "/indice", tag = "jeu", security(("session" = [])), request_body = DemandeIndice,
    responses(
        (status = 200, description = "Indice obtenu et état confirmé", body = ReponseIndice),
        (status = 400, description = "Requête invalide, recette inconnue ou secrète, indice hors barème", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Encre insuffisante ou indice précédent pas encore obtenu", body = Erreur),
        (status = 409, description = "Recette déjà découverte, indice déjà obtenu, état ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn acheter_indice(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeIndice>,
) -> Result<Json<ReponseIndice>, ErreurApi> {
    let prix = indice::prix(demande.niveau)
        .ok_or_else(|| ErreurApi::RequeteInvalide("niveau : de 1 à 3 attendu".into()))?;
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    let jeu = &catalogue.jeu;
    // Une légendaire encore inconnue reste secrète, et les mots qui l'exigent avec elle (ADR 0015, 0051).
    let connues = progression::stock(&mut tx, joueur).await?;
    let recette = jeu
        .recettes
        .iter()
        .find(|r| r.id == demande.recette_id)
        .filter(|r| {
            !r.emplacements
                .iter()
                .flatten()
                .any(|b| jeu.legendaires.contains(b) && !connues.contains_key(b))
        })
        .ok_or_else(|| ErreurApi::RequeteInvalide("recette : inconnue".into()))?;
    if progression::mots_decouverts(&mut tx, joueur)
        .await?
        .contains(&recette.mot_id)
    {
        return Err(ErreurApi::Conflit("recette déjà découverte"));
    }
    if progression::indice_obtenu(&mut tx, joueur, &recette.id, demande.niveau).await? {
        return Err(ErreurApi::Conflit("indice déjà obtenu"));
    }
    let sans_silhouette = catalogue
        .fascicules
        .iter()
        .flat_map(|f| &f.manifeste.cartes)
        .find(|c| c.id == recette.mot_id)
        .is_some_and(|c| c.silhouette.is_none());
    // Définition et sens littéral sont toujours là (toute carte résultat en porte) ; seule la silhouette peut manquer.
    let rang = indice::ORDRE
        .iter()
        .position(|&n| n == demande.niveau)
        .unwrap_or(0);
    for &precedent in indice::ORDRE[..rang]
        .iter()
        .filter(|&&n| n != 1 || !sans_silhouette)
    {
        if !progression::indice_obtenu(&mut tx, joueur, &recette.id, precedent).await? {
            return Err(ErreurApi::Interdit("indice précédent pas encore obtenu"));
        }
    }
    progression::acheter_indice(
        &mut tx,
        joueur,
        demande.commande,
        &recette.id,
        demande.niveau,
        prix,
    )
    .await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseIndice {
        prix,
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "indice", &reponse).await?;
    Ok(Json(reponse))
}

/// Récupère la récompense d'un jalon atteint (ADR 0038, 0042) : le pli de
/// jalon, déterministe, et ses sabliers. Rien n'est accordé tant que le joueur
/// ne vient pas la chercher.
#[utoipa::path(post, path = "/jalon", tag = "jeu", security(("session" = [])), request_body = DemandeJalon,
    responses(
        (status = 200, description = "Récompense récupérée et état confirmé", body = ReponseJalon),
        (status = 400, description = "Requête invalide ou jalon inconnu", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Jalon pas encore atteint", body = Erreur),
        (status = 409, description = "Récompense déjà récupérée, état ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn recuperer_jalon(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeJalon>,
) -> Result<Json<ReponseJalon>, ErreurApi> {
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    let jeu = &catalogue.jeu;
    // Un jalon publié depuis la dernière synchronisation peut être déjà atteint.
    progression::atteindre_jalons(&mut tx, joueur, jeu).await?;
    progression::recuperer_jalon(&mut tx, joueur, jeu, demande.commande, &demande.jalon_id).await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseJalon {
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "jalon", &reponse).await?;
    Ok(Json(reponse))
}

/// Tire une séance de ricochets (ADR 0044) : au plus cinq questions, par
/// identifiants. Lecture seule : rien n'est écrit, recharger tire une autre séance.
#[utoipa::path(get, path = "/ricochets/seance", tag = "jeu", security(("session" = [])),
    responses(
        (status = 200, description = "Séance tirée", body = SeanceRicochets),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn seance_ricochets(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
) -> Result<Json<SeanceRicochets>, ErreurApi> {
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    let jeu = &catalogue.jeu;
    let mut conn = app.base.acquire().await?;
    let niveaux = ricochets::lire(&mut conn, joueur).await?;
    let cartes = ricochets::cartes_du_joueur(&mut conn, joueur, jeu)
        .await?
        .into_iter()
        .map(|(id, recence)| {
            let carte = niveaux.get(&id).copied();
            (id, carte, recence)
        })
        .collect();
    let ordre = ricochets::ordonner(cartes, Utc::now().date_naive());
    let questions = ricochets::tirer(jeu, &ordre, &mut ricochets::Hasard::depuis_le_systeme()?);
    Ok(Json(SeanceRicochets { questions }))
}

/// Répond à une question de ricochet (ADR 0044). Le serveur juge sur les
/// identifiants, applique la règle de maîtrise et compte la réponse parmi les
/// cinq du jour. Une carte pas à revoir renvoie son résultat sans changer de niveau.
/// Rien n'est consommé : ni exemplaire, ni énergie, ni encre.
#[utoipa::path(post, path = "/ricochet", tag = "jeu", security(("session" = [])), request_body = DemandeRicochet,
    responses(
        (status = 200, description = "Résultat, carte après la réponse et état confirmé", body = ReponseRicochet),
        (status = 400, description = "Requête invalide : format, identifiant ou réponse mal formés", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Carte inconnue, légendaire ou pas encore trouvée", body = Erreur),
        (status = 409, description = "État ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn repondre_ricochet(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeRicochet>,
) -> Result<Json<ReponseRicochet>, ErreurApi> {
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    let juste = ricochets::juger(
        &catalogue.jeu,
        demande.format,
        &demande.unite_id,
        &demande.reponse,
    )?;
    if !ricochets::est_trouvee(&mut tx, joueur, &demande.unite_id).await? {
        return Err(ErreurApi::Interdit("carte pas encore trouvée"));
    }
    let etait_maitrisee = ricochets::lire(&mut tx, joueur)
        .await?
        .get(&demande.unite_id)
        .is_some_and(|c| c.maitrisee);
    let carte =
        ricochets::enregistrer(&mut tx, joueur, &demande.unite_id, juste, Utc::now()).await?;
    let nouvelle_maitrise = carte.maitrisee && !etait_maitrisee;
    quetes_jour::compter(&mut tx, joueur, demande.format, juste, nouvelle_maitrise).await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseRicochet {
        juste,
        carte: CarteRicochet {
            niveau: carte.niveau,
            maitrisee: carte.maitrisee,
            prochaine_revision: carte.prochaine_revision,
            bonnes_niveau_3: carte.bonnes_niveau_3,
        },
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "ricochet", &reponse).await?;
    Ok(Json(reponse))
}

/// Récupère la récompense d'une quête initiale faite pendant la première
/// semaine (ADR 0046) : plis offerts ou pli de lecteur du fascicule choisi,
/// sabliers, encre. Sans énergie, hors garanties.
#[utoipa::path(post, path = "/quete-initiale", tag = "jeu", security(("session" = [])), request_body = DemandeQueteInitiale,
    responses(
        (status = 200, description = "Récompense récupérée et état confirmé", body = ReponseQueteInitiale),
        (status = 400, description = "Requête invalide, fascicule manquant ou sans pli", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Quête initiale pas faite", body = Erreur),
        (status = 409, description = "Déjà récupérée, état ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn recuperer_quete_initiale(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeQueteInitiale>,
) -> Result<Json<ReponseQueteInitiale>, ErreurApi> {
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    let jeu = &catalogue.jeu;
    let recompense = quetes_initiales::recompense(demande.code);
    let avec_plis = recompense.plis_offerts + recompense.plis_de_lecteur > 0;
    let fascicule = match (&demande.fascicule_id, avec_plis) {
        (Some(f), true) => Some(f),
        (None, true) => {
            return Err(ErreurApi::RequeteInvalide(
                "fascicule_id : requis pour des plis".into(),
            ));
        }
        _ => None,
    };
    let maintenant = Utc::now();
    quetes_initiales::reclamer(&mut tx, joueur, demande.code, maintenant).await?;
    let mut ouvertures = Vec::new();
    if let Some(fascicule) = fascicule {
        let pli_jeu = jeu
            .pli(fascicule)
            .filter(|p| !p.briques.is_empty())
            .ok_or_else(|| ErreurApi::RequeteInvalide("fascicule : aucun pli paru".into()))?;
        let equilibrage = pli_jeu
            .equilibrage
            .as_ref()
            .ok_or_else(|| ErreurApi::RequeteInvalide("fascicule : pli sans équilibrage".into()))?;
        let plis = std::iter::repeat_n(false, recompense.plis_offerts as usize).chain(
            std::iter::repeat_n(true, recompense.plis_de_lecteur as usize),
        );
        for lecteur in plis {
            let brique = tirer_brique(pli_jeu, &equilibrage.parametres, lecteur)?;
            let resultat = pli::resultat(
                progression::stock(&mut tx, joueur)
                    .await?
                    .get(&brique.id)
                    .copied(),
            );
            let gouttes = encre_reserve_pleine(resultat, brique, &equilibrage.parametres);
            progression::accorder_brique_tiree(
                &mut tx,
                joueur,
                &progression::EffetsPli {
                    commande: demande.commande,
                    fascicule,
                    brique: &brique.id,
                    resultat,
                    regle: pli::Regle::Tirage,
                    gouttes,
                    energie: etymo_domaine::energie::Energie::pleine(),
                    compteurs: pli::Compteurs::default(),
                    version_equilibrage: &equilibrage.version,
                    maintenant,
                },
                "quete_initiale",
            )
            .await?;
            ouvertures.push(OuverturePli {
                fascicule_id: fascicule.clone(),
                brique_id: brique.id.clone(),
                resultat,
                regle: pli::Regle::Tirage,
                encre: gouttes,
                ouvert_le: maintenant,
            });
        }
    }
    progression::accorder_sabliers_et_encre(
        &mut tx,
        joueur,
        demande.commande,
        recompense.sabliers,
        recompense.gouttes,
        "quete_initiale",
        maintenant,
    )
    .await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseQueteInitiale {
        ouvertures,
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "quete_initiale", &reponse).await?;
    Ok(Json(reponse))
}

/// Récupère la récompense d'une quête du jour faite (ADR 0063) : encre pour la
/// table, sablier pour la mémoire, un pli de plus en attente (une charge
/// d'énergie) pour l'adresse. Une quête faite attend, même après minuit GMT.
#[utoipa::path(post, path = "/quete-du-jour", tag = "jeu", security(("session" = [])), request_body = DemandeQueteDuJour,
    responses(
        (status = 200, description = "Récompense récupérée et état confirmé", body = ReponseQueteDuJour),
        (status = 400, description = "Requête invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Quête du jour pas faite, ou énergie pleine pour un pli en attente", body = Erreur),
        (status = 409, description = "Déjà récupérée, état ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn recuperer_quete_du_jour(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeQueteDuJour>,
) -> Result<Json<ReponseQueteDuJour>, ErreurApi> {
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    let maintenant = Utc::now();
    let sorte = quetes_jour::reclamer(&mut tx, joueur, demande.jour, demande.rang).await?;
    let recompense = quetes_jour::recompense(sorte);
    for _ in 0..recompense.plis {
        progression::gagner_charge(&mut tx, joueur, app.recharge, maintenant).await?;
    }
    progression::accorder_sabliers_et_encre(
        &mut tx,
        joueur,
        demande.commande,
        recompense.sabliers,
        recompense.gouttes,
        "quete_jour",
        maintenant,
    )
    .await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseQueteDuJour {
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "quete_jour", &reponse).await?;
    Ok(Json(reponse))
}

/// Tire la brique d'un pli sans énergie : tout le pli pour un pli offert,
/// les seules peu communes et rares (et la légendaire à sa chance fixe) pour
/// un pli de lecteur.
fn tirer_brique<'a>(
    pli_jeu: &'a etymo_catalogue::PliJeu,
    parametres: &pli::Equilibrage,
    lecteur: bool,
) -> Result<&'a pli::BriquePli, ErreurApi> {
    let eligibles: Vec<bool> = pli_jeu
        .briques
        .iter()
        .map(|b| pli::tirable(b) && (!lecteur || b.rarete != pli::Rarete::Commune))
        .collect();
    let somme = pli::somme_eligible(&pli_jeu.briques, &eligibles, parametres);
    if somme == 0 {
        return Err(ErreurApi::RequeteInvalide(
            "fascicule : aucune brique pour ce pli".into(),
        ));
    }
    pli::tirer(&pli_jeu.briques, &eligibles, parametres, alea(somme)?)
        .ok_or_else(|| ErreurApi::Interne("aucune brique tirable".into()))
}

/// Comme un pli de jalon : de l'encre seulement si la réserve est pleine.
fn encre_reserve_pleine(
    resultat: pli::Resultat,
    brique: &pli::BriquePli,
    parametres: &pli::Equilibrage,
) -> u32 {
    if resultat == pli::Resultat::ReservePleine {
        parametres
            .encre_reserve_pleine
            .get(&brique.rarete)
            .copied()
            .unwrap_or(0)
    } else {
        0
    }
}

/// Récupère le cadeau de bienvenue (ADR 0046) : une fois par profil, des plis
/// au contenu fixé, des sabliers et de l'encre. Aucun pli n'use d'énergie.
#[utoipa::path(post, path = "/cadeau", tag = "jeu", security(("session" = [])), request_body = DemandeCadeau,
    responses(
        (status = 200, description = "Cadeau récupéré et état confirmé", body = ReponseCadeau),
        (status = 400, description = "Requête invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Aucun cadeau de bienvenue déclaré", body = Erreur),
        (status = 409, description = "Cadeau déjà récupéré, état ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn recuperer_cadeau(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeCadeau>,
) -> Result<Json<ReponseCadeau>, ErreurApi> {
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    progression::recuperer_cadeau(&mut tx, joueur, &catalogue.jeu, demande.commande).await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseCadeau {
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "cadeau", &reponse).await?;
    Ok(Json(reponse))
}

/// Récupère la récompense d'une carte de lecteur pleine (ADR 0045) : de
/// l'encre, un sablier et un pli en attente de plus (une charge d'énergie,
/// refusée tant que l'énergie est pleine).
#[utoipa::path(post, path = "/carte-de-lecteur", tag = "jeu", security(("session" = [])), request_body = DemandeCarteDeLecteur,
    responses(
        (status = 200, description = "Récompense récupérée et état confirmé", body = ReponseCarteDeLecteur),
        (status = 400, description = "Requête invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Aucune carte de lecteur pleine, ou énergie pleine", body = Erreur),
        (status = 409, description = "État ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn recuperer_carte_de_lecteur(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeCarteDeLecteur>,
) -> Result<Json<ReponseCarteDeLecteur>, ErreurApi> {
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    carte_lecteur::reclamer(&mut tx, joueur).await?;
    progression::accorder_carte_de_lecteur(
        &mut tx,
        joueur,
        demande.commande,
        app.recharge,
        Utc::now(),
    )
    .await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponseCarteDeLecteur {
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "carte_lecteur", &reponse).await?;
    Ok(Json(reponse))
}

/// Récupère la récompense d'un palier de quête au long cours (ADR 0045) :
/// de l'encre et des sabliers. Le serveur a mesuré la progression sur le
/// codex ; rien n'est accordé tant que le seuil n'est pas franchi.
#[utoipa::path(post, path = "/palier", tag = "jeu", security(("session" = [])), request_body = DemandePalier,
    responses(
        (status = 200, description = "Récompense récupérée et état confirmé", body = ReponsePalier),
        (status = 400, description = "Requête invalide ou palier inconnu", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Palier pas encore atteint", body = Erreur),
        (status = 409, description = "Récompense déjà récupérée, état ou catalogue périmé : resynchroniser", body = Erreur),
        (status = 429, description = "Trop de requêtes", body = Erreur),
        (status = 503, description = "Aucun catalogue publié", body = Erreur),
    ))]
pub async fn recuperer_palier(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandePalier>,
) -> Result<Json<ReponsePalier>, ErreurApi> {
    let mut tx = match debuter_commande(
        &app,
        joueur,
        demande.commande,
        demande.version_etat,
        &demande.version_catalogue,
    )
    .await?
    {
        Ok(tx) => tx,
        Err(reponse) => return Ok(Json(reponse)),
    };
    let catalogue = app.catalogue.courant().ok_or(ErreurApi::Indisponible)?;
    progression::recuperer_palier(
        &mut tx,
        joueur,
        &catalogue.jeu,
        demande.commande,
        &demande.palier_id,
    )
    .await?;
    progression::incrementer_version(&mut tx, joueur).await?;
    let reponse = ReponsePalier {
        etat: etat_courant(&app, &mut tx, joueur).await?,
    };
    conclure_commande(tx, joueur, demande.commande, "palier", &reponse).await?;
    Ok(Json(reponse))
}

/// État confirmé du joueur, avec la progression de ses quêtes sur le catalogue courant.
async fn etat_courant(
    app: &EtatApp,
    tx: &mut sqlx::PgConnection,
    joueur: Uuid,
) -> Result<Etat, ErreurApi> {
    let catalogue = app.catalogue.courant();
    progression::etat(tx, joueur, app.recharge, catalogue.as_ref().map(|c| &c.jeu)).await
}
