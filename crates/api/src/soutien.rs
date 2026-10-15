//! Soutien par abonnement Ko-fi (ADR 0078) : le webhook de Ko-fi marque une
//! adresse comme abonnée, le client ne présente alors plus la modale de
//! soutien. Aucun avantage de jeu : un abonné joue exactement comme les autres.
//!
//! Ko-fi poste `data=<JSON>` en formulaire. Le jeton de vérification se compare
//! à temps constant ; l'adresse n'est lue que pour calculer son empreinte.

use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Form, Router};
use serde::Deserialize;

use crate::erreur::ErreurApi;
use crate::{EtatApp, secret};

/// Un abonnement mensuel reste actif ce nombre de jours après son dernier paiement.
pub const JOURS_ACTIF: i32 = 45;
/// Les lignes plus vieilles que cela sont purgées à chaque webhook.
const JOURS_PURGE: i32 = 90;

pub fn routes() -> Router<Arc<EtatApp>> {
    Router::new().route("/soutien/kofi", post(webhook))
}

#[derive(Deserialize)]
struct Formulaire {
    data: String,
}

/// Seuls champs lus. Pas de `deny_unknown_fields` : Ko-fi est libre d'en ajouter.
#[derive(Deserialize)]
struct Paiement {
    verification_token: String,
    #[serde(default)]
    is_subscription_payment: bool,
    #[serde(default)]
    email: String,
}

/// Webhook Ko-fi : toujours `200` pour un jeton valide, même si l'événement
/// n'est pas un abonnement, pour que Ko-fi ne le rejoue pas.
async fn webhook(
    State(app): State<Arc<EtatApp>>,
    Form(formulaire): Form<Formulaire>,
) -> Result<StatusCode, ErreurApi> {
    let (Some(attendu), Some(courriel)) = (app.kofi_token.as_deref(), app.courriel.as_ref()) else {
        return Err(ErreurApi::Indisponible);
    };
    let paiement: Paiement = serde_json::from_str(&formulaire.data)
        .map_err(|_| ErreurApi::RequeteInvalide("data : JSON Ko-fi attendu".into()))?;
    if !secret::egales(paiement.verification_token.as_bytes(), attendu.as_bytes()) {
        return Err(ErreurApi::NonAuthentifie);
    }
    let adresse = etymo_domaine::compte::normaliser_courriel(&paiement.email);
    if let (true, Some(adresse)) = (paiement.is_subscription_payment, adresse) {
        sqlx::query!(
            "INSERT INTO soutien (empreinte_courriel, dernier_paiement) VALUES ($1, now())
             ON CONFLICT (empreinte_courriel) DO UPDATE SET dernier_paiement = now()",
            &courriel.empreinte_adresse(&adresse)[..]
        )
        .execute(&app.base)
        .await?;
    }
    sqlx::query!(
        "DELETE FROM soutien WHERE dernier_paiement < now() - make_interval(days => $1)",
        JOURS_PURGE
    )
    .execute(&app.base)
    .await?;
    Ok(StatusCode::OK)
}
