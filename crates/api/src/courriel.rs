//! E-mails de connexion (ADR 0070) : un lien et un code, envoyés par Scaleway
//! Transactional Email, ou écrits dans un dossier en développement.
//!
//! L'adresse, le code et le lien ne vivent que le temps de l'envoi : jamais
//! stockés, jamais journalisés. Une erreur d'envoi se journalise par un code
//! seul (`tem_refus`, `tem_quota`, `tem_reseau`).

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, bail, ensure};
use chrono::Utc;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use uuid::Uuid;

use crate::config::ConfigCourriel;
use crate::erreur::ErreurApi;

/// Point d'envoi de Scaleway Transactional Email.
const TEM: &str = "https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails";
/// Longueur minimale de la clé des empreintes, en octets.
const CLE_MIN: usize = 32;
/// Nom affiché de l'expéditeur.
const NOM: &str = "ÉtymoLogique";

pub enum Expediteur {
    Tem {
        client: reqwest::Client,
        cle: String,
        projet: String,
        adresse: String,
    },
    /// Développement et tests : un fichier `.eml` par e-mail.
    Fichier(PathBuf),
}

pub struct Courriel {
    cle: Vec<u8>,
    url_pwa: String,
    expediteur: Expediteur,
}

impl Courriel {
    pub fn nouveau(cle: &[u8], url_pwa: &str, expediteur: Expediteur) -> anyhow::Result<Self> {
        ensure!(
            cle.len() >= CLE_MIN,
            "ETYMO_CLE_COURRIEL : {CLE_MIN} octets au moins"
        );
        Ok(Self {
            cle: cle.to_vec(),
            url_pwa: url_pwa.trim_end_matches('/').to_owned(),
            expediteur,
        })
    }

    /// `None` sans `ETYMO_COURRIEL` : comptes désactivés. Une configuration
    /// incomplète arrête le démarrage plutôt que d'échouer à chaque demande.
    pub fn depuis_config(config: &ConfigCourriel) -> anyhow::Result<Option<Self>> {
        let Some(mode) = config.courriel.as_deref().filter(|m| !m.is_empty()) else {
            return Ok(None);
        };
        let cle = config
            .cle_courriel
            .as_deref()
            .context("ETYMO_CLE_COURRIEL manquante")?;
        let url_pwa = config
            .url_pwa
            .as_deref()
            .context("ETYMO_URL_PWA manquante")?;
        let expediteur = if let Some(dossier) = mode.strip_prefix("file://") {
            Expediteur::Fichier(PathBuf::from(dossier))
        } else if mode == "tem" {
            Expediteur::Tem {
                client: reqwest::Client::builder()
                    .timeout(Duration::from_secs(5))
                    .build()?,
                cle: config.tem_cle.clone().context("ETYMO_TEM_CLE manquante")?,
                projet: config
                    .tem_projet
                    .clone()
                    .context("ETYMO_TEM_PROJET manquant")?,
                adresse: config
                    .expediteur
                    .clone()
                    .context("ETYMO_COURRIEL_EXPEDITEUR manquant")?,
            }
        } else {
            bail!("ETYMO_COURRIEL : `tem` ou `file:///dossier` attendu");
        };
        Self::nouveau(cle.as_bytes(), url_pwa, expediteur).map(Some)
    }

    fn hmac(&self, domaine: &[u8], parties: &[&[u8]]) -> [u8; 32] {
        let mut mac =
            <Hmac<Sha256> as KeyInit>::new_from_slice(&self.cle).expect("HMAC accepte toute clé");
        mac.update(domaine);
        for partie in parties {
            mac.update(partie);
        }
        mac.finalize().into_bytes().into()
    }

    /// Empreinte de l'adresse normalisée : seule trace gardée du courriel.
    #[must_use]
    pub fn empreinte_adresse(&self, adresse: &str) -> [u8; 32] {
        self.hmac(b"etymo-courriel-v1.", &[adresse.as_bytes()])
    }

    /// Empreinte du code, liée à son défi : un code ne vaut que pour lui.
    #[must_use]
    pub fn empreinte_code(&self, defi: Uuid, code: &str) -> [u8; 32] {
        self.hmac(b"etymo-code-v1.", &[defi.as_bytes(), b".", code.as_bytes()])
    }

    /// Envoie l'e-mail du défi (I-34).
    pub async fn envoyer(
        &self,
        a: &str,
        defi: Uuid,
        jeton: &str,
        code: &str,
    ) -> Result<(), ErreurApi> {
        let lien = format!("{}/#/connexion?defi={defi}&jeton={jeton}", self.url_pwa);
        let (sujet, texte, html) = gabarit(code, &lien);
        self.expedier(a, &sujet, &texte, &html).await
    }

    /// Prévient l'éditeur d'un webhook Ko-fi (ADR 0078). Le HTML arrive déjà échappé.
    pub async fn notifier(
        &self,
        a: &str,
        sujet: &str,
        texte: &str,
        html: &str,
    ) -> Result<(), ErreurApi> {
        self.expedier(a, sujet, texte, html).await
    }

    async fn expedier(
        &self,
        a: &str,
        sujet: &str,
        texte: &str,
        html: &str,
    ) -> Result<(), ErreurApi> {
        match &self.expediteur {
            Expediteur::Fichier(dossier) => {
                let nom = format!(
                    "{}-{}.eml",
                    Utc::now().format("%Y%m%d-%H%M%S"),
                    Uuid::new_v4()
                );
                let contenu = format!(
                    "To: {a}\r\nSubject: {sujet}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{texte}"
                );
                let ecrit = async {
                    tokio::fs::create_dir_all(dossier).await?;
                    tokio::fs::write(dossier.join(nom), contenu).await
                };
                ecrit.await.map_err(|_| {
                    tracing::warn!(code = "fichier_refus", "e-mail non écrit");
                    ErreurApi::EnvoiImpossible
                })
            }
            Expediteur::Tem {
                client,
                cle,
                projet,
                adresse,
            } => {
                let corps = serde_json::json!({
                    "from": { "email": adresse, "name": NOM },
                    "to": [{ "email": a }],
                    "subject": sujet,
                    "text": texte,
                    "html": html,
                    "project_id": projet,
                });
                let reponse = client
                    .post(TEM)
                    .header("X-Auth-Token", cle)
                    .json(&corps)
                    .send()
                    .await;
                let code = match reponse {
                    Ok(r) if r.status().is_success() => return Ok(()),
                    Ok(r) if r.status() == reqwest::StatusCode::TOO_MANY_REQUESTS => "tem_quota",
                    Ok(_) => "tem_refus",
                    Err(_) => "tem_reseau",
                };
                tracing::warn!(code, "e-mail non envoyé");
                Err(ErreurApi::EnvoiImpossible)
            }
        }
    }
}

/// Objet, texte et HTML de l'e-mail (maquette m-34). Pas d'image distante ni
/// de lien de suivi ; couleurs en dur, une messagerie n'a pas de variables CSS.
fn gabarit(code: &str, lien: &str) -> (String, String, String) {
    let lisible = format!("{}\u{a0}{}", &code[..3], &code[3..]);
    let sujet = format!("Votre code ÉtymoLogique\u{a0}: {lisible}");
    let texte = format!(
        "Bonjour,\n\n\
         Voici votre code pour ouvrir votre partie\u{a0}: {lisible}\n\n\
         Ou ouvrez ce lien sur l’appareil où vous jouez\u{a0}:\n{lien}\n\n\
         Le code et le lien sont valables 15 minutes et ne servent qu’une fois.\n\n\
         Vous n’avez rien demandé\u{202f}? Ignorez cet e-mail\u{a0}: rien ne se passe sans ce code.\n"
    );
    let href = lien.replace('&', "&amp;");
    let html = format!(
        r#"<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><title>{sujet}</title></head>
<body style="margin:0;padding:24px 12px;background:#f3eee3;color:#0f1f19;font-family:Georgia,'Times New Roman',serif">
<div style="max-width:600px;margin:0 auto;background:#f3eee3;border:2px solid #0f1f19;padding:28px 24px">
<p style="margin:0 0 24px"><span style="display:inline-block;border:2px solid #0f1f19;padding:4px 8px;font-weight:bold;letter-spacing:1px">ÉL</span></p>
<p style="margin:0 0 12px;font-size:17px">Bonjour,</p>
<p style="margin:0 0 8px;font-size:17px">Voici votre code pour ouvrir votre partie&nbsp;:</p>
<p style="margin:0 0 24px;font-size:36px;font-weight:bold;letter-spacing:4px;font-family:'Courier New',monospace">{lisible}</p>
<p style="margin:0 0 12px;font-size:17px">Ou ouvrez ce lien sur l’appareil où vous jouez&nbsp;:</p>
<p style="margin:0 0 24px"><a href="{href}" style="display:inline-block;background:#ff6b4a;color:#0f1f19;border:2px solid #0f1f19;padding:12px 20px;font-weight:bold;text-decoration:none">Ouvrir ÉtymoLogique</a></p>
<p style="margin:0 0 12px;font-size:15px;color:#44564d">Le code et le lien sont valables 15 minutes et ne servent qu’une fois.</p>
<p style="margin:0;font-size:15px;color:#44564d">Vous n’avez rien demandé&#8239;? Ignorez cet e-mail&nbsp;: rien ne se passe sans ce code.</p>
</div></body></html>
"#
    );
    (sujet, texte, html)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gabarit_porte_le_code_et_le_lien() {
        let (sujet, texte, html) = gabarit("482913", "https://pwa.test/#/connexion?defi=d&jeton=j");
        assert_eq!(sujet, "Votre code ÉtymoLogique\u{a0}: 482\u{a0}913");
        assert!(texte.contains("482\u{a0}913"));
        assert!(texte.contains("https://pwa.test/#/connexion?defi=d&jeton=j"));
        assert!(html.contains("defi=d&amp;jeton=j"));
        assert!(!html.contains("<img"));
    }

    #[test]
    fn empreintes_separees_par_domaine() {
        let courriel = Courriel::nouveau(
            &[1; 32],
            "https://pwa.test/",
            Expediteur::Fichier(".".into()),
        )
        .unwrap();
        let defi = Uuid::new_v4();
        assert_ne!(
            courriel.empreinte_adresse("123456"),
            courriel.empreinte_code(defi, "123456")
        );
        assert_ne!(
            courriel.empreinte_code(defi, "123456"),
            courriel.empreinte_code(Uuid::new_v4(), "123456")
        );
        assert!(Courriel::nouveau(&[1; 31], "x", Expediteur::Fichier(".".into())).is_err());
    }
}
