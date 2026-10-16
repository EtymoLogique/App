//! Soutien par abonnement Ko-fi (ADR 0078) : le webhook de Ko-fi marque une
//! adresse comme abonnée, le client ne présente alors plus la modale de
//! soutien. Aucun avantage de jeu : un abonné joue exactement comme les autres.
//!
//! Ko-fi poste `data=<JSON>` en formulaire. Le jeton de vérification se compare
//! à temps constant ; l'adresse n'est lue que pour calculer son empreinte.
//! Le journal ne garde que le type, le montant et l'issue du webhook : jamais
//! le corps, l'adresse, le nom ni le message.

use std::fmt::Write as _;
use std::sync::Arc;

use axum::extract::State;
use axum::extract::rejection::FormRejection;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Form, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

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

/// Seuls champs dont dépend l'enregistrement. Pas de `deny_unknown_fields` : Ko-fi est libre d'en
/// ajouter. Tout champ peut valoir `null` (adresse d'un don anonyme…).
#[derive(Deserialize)]
struct Paiement {
    verification_token: String,
    is_subscription_payment: Option<bool>,
    email: Option<String>,
}

/// Ce que l'éditeur apprend d'un webhook : nom, adresse et message du donateur compris, mais ni
/// livraison ni Discord. Chaque champ est lu sans exiger son type, pour qu'un champ d'affichage inattendu ne
/// fasse jamais refuser un paiement, puis borné à un format connu.
struct Evenement {
    genre: &'static str,
    premier: bool,
    montant: String,
    devise: String,
    palier: Option<String>,
    date: Option<DateTime<Utc>>,
    public: Option<bool>,
    nom: Option<String>,
    courriel: Option<String>,
    message: Option<String>,
    articles: Vec<String>,
    transaction: Option<Uuid>,
    message_id: Option<Uuid>,
    lien: Option<String>,
}

fn chaine<'a>(brut: &'a Value, cle: &str) -> Option<&'a str> {
    brut.get(cle)?.as_str()
}

fn booleen(brut: &Value, cle: &str) -> Option<bool> {
    brut.get(cle)?.as_bool()
}

fn identifiant(brut: &Value, cle: &str) -> Option<Uuid> {
    chaine(brut, cle)?.parse().ok()
}

/// Texte libre choisi sur Ko-fi (palier, variante, code d'article) : sans caractère de contrôle, borné.
fn libre(texte: Option<&str>) -> Option<String> {
    let texte: String = texte?
        .chars()
        .filter(|c| !c.is_control())
        .take(80)
        .collect();
    let texte = texte.trim();
    (!texte.is_empty()).then(|| texte.to_owned())
}

impl Evenement {
    fn lire(brut: &Value) -> Self {
        let abonnement = booleen(brut, "is_subscription_payment") == Some(true);
        let premier = booleen(brut, "is_first_subscription_payment") == Some(true);
        let genre = match chaine(brut, "type").unwrap_or_default() {
            "Donation" if abonnement => "don mensuel",
            "Donation" | "Tip" => "don",
            "Subscription" if premier => "nouvel abonnement",
            "Subscription" => "renouvellement d'abonnement",
            "Shop Order" => "commande boutique",
            "Commission" => "commission",
            _ => "événement",
        };
        let articles = brut
            .get("shop_items")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .take(20)
            .map(|article| {
                let code = libre(chaine(article, "direct_link_code")).unwrap_or_else(|| "?".into());
                let quantite = article.get("quantity").and_then(Value::as_u64).unwrap_or(1);
                match libre(chaine(article, "variation_name")) {
                    Some(variante) => format!("{code} ({variante}) ×\u{a0}{quantite}"),
                    None => format!("{code} ×\u{a0}{quantite}"),
                }
            })
            .collect();
        Self {
            genre,
            premier,
            montant: chaine(brut, "amount")
                .unwrap_or_default()
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.')
                .take(10)
                .collect(),
            devise: chaine(brut, "currency")
                .unwrap_or_default()
                .chars()
                .filter(char::is_ascii_uppercase)
                .take(3)
                .collect(),
            palier: libre(chaine(brut, "tier_name")),
            date: chaine(brut, "timestamp")
                .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
                .map(|d| d.with_timezone(&Utc)),
            public: booleen(brut, "is_public"),
            nom: libre(chaine(brut, "from_name")),
            courriel: chaine(brut, "email")
                .map(str::trim)
                .filter(|a| {
                    !a.is_empty()
                        && a.len() <= 254
                        && !a.chars().any(|c| c.is_control() || c.is_whitespace())
                })
                .map(str::to_owned),
            message: chaine(brut, "message").and_then(|m| {
                let m: String = m
                    .chars()
                    .filter(|c| *c == '\n' || !c.is_control())
                    .take(2000)
                    .collect();
                let m = m.trim();
                (!m.is_empty()).then(|| m.to_owned())
            }),
            articles,
            transaction: identifiant(brut, "kofi_transaction_id"),
            message_id: identifiant(brut, "message_id"),
            lien: chaine(brut, "url")
                .filter(|u| {
                    u.starts_with("https://ko-fi.com/")
                        && u.len() <= 200
                        && u.chars()
                            .all(|c| c.is_ascii_graphic() && !matches!(c, '"' | '\'' | '<' | '>'))
                })
                .map(str::to_owned),
        }
    }

    /// « 3,00 USD », ou rien si Ko-fi n'a pas donné de montant.
    fn somme(&self) -> Option<String> {
        (!self.montant.is_empty())
            .then(|| format!("{}\u{a0}{}", self.montant.replace('.', ","), self.devise))
    }
}

fn echapper(texte: &str) -> String {
    texte
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Objet, texte et HTML de la notification (palette de l'e-mail de connexion). `abonne` dit, pour un
/// paiement d'abonnement, si l'empreinte a été enregistrée.
fn notification(e: &Evenement, abonne: Option<&str>) -> (String, String, String) {
    let somme = e.somme();
    let sujet = match &somme {
        Some(somme) => format!("Ko-fi : {}, {somme}", e.genre),
        None => format!("Ko-fi : {}", e.genre),
    };
    let mut lignes: Vec<(&str, String)> = vec![("Événement", e.genre.to_owned())];
    lignes.extend(somme.map(|s| ("Montant", s)));
    lignes.extend(e.nom.clone().map(|n| ("Donateur", n)));
    lignes.extend(e.courriel.clone().map(|a| ("Adresse", a)));
    lignes.extend(e.message.clone().map(|m| ("Message", m)));
    lignes.extend(e.palier.clone().map(|p| ("Palier", p)));
    lignes.extend(
        e.date
            .map(|d| ("Date", d.format("%d/%m/%Y à %H:%M UTC").to_string())),
    );
    lignes.extend(
        e.public
            .map(|p| ("Visibilité", if p { "public" } else { "privé" }.into())),
    );
    lignes.extend(abonne.map(|a| ("Modale masquée", a.to_owned())));
    lignes.extend(e.articles.iter().map(|a| ("Article", a.clone())));
    lignes.extend(e.transaction.map(|t| ("Transaction", t.to_string())));
    lignes.extend(e.message_id.map(|m| ("Webhook", m.to_string())));

    let pied = "Ni livraison ni Discord dans cet e-mail\u{a0}: ils restent sur Ko-fi.";
    let mut texte = String::from("Ko-fi a envoyé un webhook.\n\n");
    let mut rangees = String::new();
    for (cle, valeur) in &lignes {
        let _ = writeln!(texte, "{cle}\u{a0}: {valeur}");
        let _ = write!(
            rangees,
            r#"<tr><td style="padding:6px 16px 6px 0;color:#44564d;white-space:nowrap;vertical-align:top">{cle}</td><td style="padding:6px 0;font-weight:bold">{}</td></tr>"#,
            echapper(valeur).replace('\n', "<br>")
        );
    }
    if let Some(lien) = &e.lien {
        let _ = writeln!(texte, "\nVoir sur Ko-fi\u{a0}: {lien}");
    }
    let _ = writeln!(texte, "\n{pied}");

    let bouton = e.lien.as_deref().map_or_else(String::new, |lien| {
        format!(
            r#"<p style="margin:24px 0 0"><a href="{}" style="display:inline-block;background:#ff6b4a;color:#0f1f19;border:2px solid #0f1f19;padding:12px 20px;font-weight:bold;text-decoration:none">Voir sur Ko-fi</a></p>"#,
            echapper(lien)
        )
    });
    let titre = echapper(&sujet);
    let genre = echapper(e.genre);
    let html = format!(
        r#"<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><title>{titre}</title></head>
<body style="margin:0;padding:24px 12px;background:#f3eee3;color:#0f1f19;font-family:Georgia,'Times New Roman',serif">
<div style="max-width:600px;margin:0 auto;background:#f3eee3;border:2px solid #0f1f19;padding:28px 24px">
<p style="margin:0 0 24px"><span style="display:inline-block;border:2px solid #0f1f19;padding:4px 8px;font-weight:bold;letter-spacing:1px">ÉL</span></p>
<p style="margin:0 0 16px;font-size:24px;font-weight:bold">Ko-fi&nbsp;: {genre}</p>
<table style="border-collapse:collapse;font-size:16px">{rangees}</table>{bouton}
<p style="margin:24px 0 0;font-size:14px;color:#44564d">{}</p>
</div></body></html>
"#,
        echapper(pied)
    );
    (sujet, texte, html)
}

/// Rejet journalisé par un code seul : ni corps, ni jeton, ni adresse.
fn refuser(code: &'static str, erreur: ErreurApi) -> ErreurApi {
    tracing::warn!(code, "webhook Ko-fi refusé");
    erreur
}

/// Webhook Ko-fi : toujours `200` pour un jeton valide, même si l'événement
/// n'est pas un abonnement, pour que Ko-fi ne le rejoue pas.
async fn webhook(
    State(app): State<Arc<EtatApp>>,
    formulaire: Result<Form<Formulaire>, FormRejection>,
) -> Result<StatusCode, ErreurApi> {
    let (Some(attendu), Some(courriel)) = (app.kofi_token.as_deref(), app.courriel.as_ref()) else {
        return Err(refuser("kofi_non_configure", ErreurApi::Indisponible));
    };
    let invalide = || ErreurApi::RequeteInvalide("data : JSON Ko-fi attendu".into());
    let Form(formulaire) = formulaire.map_err(|e| match e.status() {
        StatusCode::PAYLOAD_TOO_LARGE => refuser("kofi_trop_gros", ErreurApi::TropGros),
        _ => refuser("kofi_formulaire", invalide()),
    })?;
    // Ni `%erreur` : serde_json cite des valeurs du corps dans ses messages.
    let brut: Value = serde_json::from_str(&formulaire.data).map_err(|e| {
        tracing::warn!(code = "kofi_json", categorie = ?e.classify(), ligne = e.line(), colonne = e.column(), "webhook Ko-fi refusé");
        invalide()
    })?;
    let paiement = Paiement::deserialize(&brut).map_err(|_| refuser("kofi_champs", invalide()))?;
    if !secret::egales(paiement.verification_token.as_bytes(), attendu.as_bytes()) {
        return Err(refuser("kofi_jeton", ErreurApi::NonAuthentifie));
    }
    let evenement = Evenement::lire(&brut);
    let abonnement = paiement.is_subscription_payment == Some(true);
    let adresse =
        etymo_domaine::compte::normaliser_courriel(paiement.email.as_deref().unwrap_or_default());
    let adresse_presente = adresse.is_some();
    let enregistre = match (abonnement, adresse) {
        (true, Some(adresse)) => {
            sqlx::query!(
                "INSERT INTO soutien (empreinte_courriel, dernier_paiement) VALUES ($1, now())
             ON CONFLICT (empreinte_courriel) DO UPDATE SET dernier_paiement = now()",
                &courriel.empreinte_adresse(&adresse)[..]
            )
            .execute(&app.base)
            .await?;
            true
        }
        _ => false,
    };
    // Purge avant l'e-mail : un échec fait rejouer le webhook par Ko-fi sans doubler la notification.
    let purgees = sqlx::query!(
        "DELETE FROM soutien WHERE dernier_paiement < now() - make_interval(days => $1)",
        JOURS_PURGE
    )
    .execute(&app.base)
    .await?
    .rows_affected();
    tracing::info!(
        code = "kofi_recu",
        genre = evenement.genre,
        montant = %evenement.montant,
        devise = %evenement.devise,
        abonnement,
        premier = evenement.premier,
        adresse_presente,
        enregistre,
        purgees,
        message_id = evenement.message_id.map(tracing::field::display),
        "webhook Ko-fi reçu"
    );
    let abonne = abonnement.then(|| {
        if enregistre {
            format!("oui, pendant {JOURS_ACTIF} jours, si l'adresse Ko-fi est celle d'un compte")
        } else {
            "non : adresse absente ou invalide".to_owned()
        }
    });
    // Un échec d'envoi ne fait pas rejouer le webhook par Ko-fi : la ligne est déjà écrite.
    let (sujet, texte, html) = notification(&evenement, abonne.as_deref());
    let _ = courriel
        .notifier(&app.kofi_notification, &sujet, &texte, &html)
        .await;
    Ok(StatusCode::OK)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commande() -> Value {
        serde_json::json!({
            "verification_token": "secret", "message_id": "577cd5f3-1408-4894-92e7-2bdd9589961b",
            "timestamp": "2026-10-16T14:14:47Z", "type": "Shop Order", "is_public": false,
            "from_name": "Jo Example", "message": "Bonne chance\u{a0}!\nÀ <bientôt>\u{7}", "amount": "27.95",
            "url": "https://ko-fi.com/Home/CoffeeShop?txid=00000000-1111-2222-3333-444444444444&x=1",
            "email": "jo.example@example.com", "currency": "USD", "is_subscription_payment": false,
            "is_first_subscription_payment": false, "kofi_transaction_id": "00000000-1111-2222-3333-444444444444",
            "shop_items": [
                { "direct_link_code": "1a2b3c4d5e", "variation_name": "<b>Blue</b>", "quantity": 1 },
                { "direct_link_code": "a1b2c3d4e5", "variation_name": null, "quantity": "cinq" }
            ],
            "tier_name": "Or & <script>", "shipping": { "full_name": "Ko-fi Mail Room", "city": "Bigville" },
            "discord_username": "Jo#4105", "discord_userid": "012345678901234567"
        })
    }

    #[test]
    fn la_notification_detaille_sans_livraison_ni_discord() {
        let (sujet, texte, html) = notification(&Evenement::lire(&commande()), None);
        assert_eq!(sujet, "Ko-fi : commande boutique, 27,95\u{a0}USD");
        for attendu in [
            "Palier\u{a0}: Or & <script>",
            "Date\u{a0}: 16/10/2026 à 14:14 UTC",
            "Visibilité\u{a0}: privé",
            "Donateur\u{a0}: Jo Example",
            "Adresse\u{a0}: jo.example@example.com",
            "Message\u{a0}: Bonne chance\u{a0}!\nÀ <bientôt>",
            "Article\u{a0}: 1a2b3c4d5e (<b>Blue</b>) ×\u{a0}1",
            "Article\u{a0}: a1b2c3d4e5 ×\u{a0}1",
            "Transaction\u{a0}: 00000000-1111-2222-3333-444444444444",
            "Webhook\u{a0}: 577cd5f3-1408-4894-92e7-2bdd9589961b",
            "txid=00000000-1111-2222-3333-444444444444&x=1",
        ] {
            assert!(texte.contains(attendu), "{attendu} absent de {texte}");
        }
        assert!(html.contains("Or &amp; &lt;script&gt;"));
        assert!(html.contains("&lt;b&gt;Blue&lt;/b&gt;"));
        assert!(html.contains("Bonne chance\u{a0}!<br>À &lt;bientôt&gt;</td>"));
        assert!(html.contains("txid=00000000-1111-2222-3333-444444444444&amp;x=1"));
        assert!(!html.contains("<script>") && !html.contains("<b>"));
        for interdit in ["Bigville", "Mail Room", "4105", "secret"] {
            assert!(
                !texte.contains(interdit) && !html.contains(interdit),
                "{interdit}"
            );
        }
    }

    #[test]
    fn un_champ_inattendu_ne_casse_rien() {
        let brut = serde_json::json!({
            "verification_token": "secret", "type": "Subscription", "is_subscription_payment": true,
            "amount": 3, "tier_name": ["?"], "timestamp": "hier", "url": "https://exemple.test/\"x",
            "shop_items": "aucun", "message_id": "pas-un-uuid"
        });
        assert!(Paiement::deserialize(&brut).is_ok());
        let (sujet, texte, html) = notification(
            &Evenement::lire(&brut),
            Some("non : adresse absente ou invalide"),
        );
        assert_eq!(sujet, "Ko-fi : renouvellement d'abonnement");
        assert!(texte.contains("Modale masquée\u{a0}: non : adresse absente ou invalide"));
        assert!(
            !texte.contains("Montant") && !texte.contains("Date") && !texte.contains("Voir sur")
        );
        assert!(!html.contains("exemple.test"));
    }
}
