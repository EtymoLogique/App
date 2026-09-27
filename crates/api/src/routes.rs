//! Routes de l'API. Des commandes, pas un CRUD (ADR 0024).

use std::sync::Arc;

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use etymo_contrat::{DemandeSession, Erreur, Etat, Sante, Session, StatutSante};

use crate::erreur::ErreurApi;
use crate::extraction::{Adresse, Joueur, JsonStrict};
use crate::{EtatApp, debit, secret};

pub fn routes() -> Router<Arc<EtatApp>> {
    Router::new()
        .route("/sante", get(sante))
        .route("/session", post(session))
        .route("/etat", get(etat))
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

/// Projection de l'état confirmé du joueur.
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
    let ligne = sqlx::query!(
        "SELECT version_etat, version_catalogue FROM joueur WHERE id = $1",
        joueur
    )
    .fetch_optional(&app.base)
    .await?
    .ok_or(ErreurApi::NonAuthentifie)?;
    Ok(Json(Etat {
        version_etat: ligne.version_etat,
        version_catalogue: ligne.version_catalogue.or_else(|| app.catalogue.version()),
    }))
}
