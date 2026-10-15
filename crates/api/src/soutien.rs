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

/// Un webhook Ko-fi porte un message libre et, pour une commande, une adresse de livraison, le tout
/// encodé en pourcentage : bien au-delà des 8 Kio des commandes de jeu.
pub const CORPS_WEBHOOK_MAX: usize = 64 * 1024;

pub fn routes() -> Router<Arc<EtatApp>> {
    Router::new().route("/soutien/kofi", post(webhook))
}

#[derive(Deserialize)]
struct Formulaire {
    data: String,
}

/// Seuls champs lus. Pas de `deny_unknown_fields` : Ko-fi est libre d'en ajouter. Tout champ peut valoir
/// `null` (message, adresse d'un don anonyme…) : un champ absent ou nul vaut sa valeur vide.
#[derive(Deserialize)]
struct Paiement {
    verification_token: String,
    is_subscription_payment: Option<bool>,
    email: Option<String>,
    #[serde(rename = "type")]
    genre: Option<String>,
    amount: Option<String>,
    currency: Option<String>,
    is_first_subscription_payment: Option<bool>,
}

/// Texte de la notification : ni adresse, ni nom, ni message du donateur. Chaque champ de Ko-fi est
/// borné à un format connu avant d'entrer dans l'e-mail.
fn notification(p: &Paiement) -> (String, String) {
    let abonnement = p.is_subscription_payment == Some(true);
    let genre = match p.genre.as_deref().unwrap_or_default() {
        "Donation" if abonnement => "don mensuel",
        "Donation" | "Tip" => "don",
        "Subscription" if p.is_first_subscription_payment == Some(true) => "nouvel abonnement",
        "Subscription" => "renouvellement d'abonnement",
        "Shop Order" => "commande boutique",
        "Commission" => "commission",
        _ => "événement",
    };
    let montant: String = p
        .amount
        .as_deref()
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .take(10)
        .collect();
    let devise: String = p
        .currency
        .as_deref()
        .unwrap_or_default()
        .chars()
        .filter(char::is_ascii_uppercase)
        .take(3)
        .collect();
    let sujet = format!("Ko-fi : {genre}");
    let texte = format!("Ko-fi a envoyé un webhook : {genre}, {montant} {devise}.");
    (sujet, texte.trim_end().to_owned())
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
    let adresse =
        etymo_domaine::compte::normaliser_courriel(paiement.email.as_deref().unwrap_or_default());
    if let (true, Some(adresse)) = (paiement.is_subscription_payment == Some(true), adresse) {
        sqlx::query!(
            "INSERT INTO soutien (empreinte_courriel, dernier_paiement) VALUES ($1, now())
             ON CONFLICT (empreinte_courriel) DO UPDATE SET dernier_paiement = now()",
            &courriel.empreinte_adresse(&adresse)[..]
        )
        .execute(&app.base)
        .await?;
    }
    // Un échec d'envoi ne fait pas rejouer le webhook par Ko-fi : la ligne est déjà écrite.
    let (sujet, texte) = notification(&paiement);
    let _ = courriel
        .notifier(&app.kofi_notification, &sujet, &texte)
        .await;
    sqlx::query!(
        "DELETE FROM soutien WHERE dernier_paiement < now() - make_interval(days => $1)",
        JOURS_PURGE
    )
    .execute(&app.base)
    .await?;
    Ok(StatusCode::OK)
}
