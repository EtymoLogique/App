//! Jetons de session du profil invité (ADR 0024) : valables 15 minutes,
//! signés par HMAC-SHA256 avec la clé rangée dans Secret Manager.
//!
//! Format : `base64url(charge) "." base64url(hmac)`, où la charge est
//! `{"sub": <uuid>, "exp": <secondes Unix>}`. Un seul algorithme, sans en-tête :
//! aucune confusion d'algorithme possible.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use uuid::Uuid;

/// Durée de validité d'un jeton.
pub const DUREE: Duration = Duration::minutes(15);
/// Longueur minimale de la clé de signature, en octets.
pub const CLE_MIN: usize = 32;
/// Séparation de domaine : un jeton d'un autre usage ne se rejoue pas ici.
const DOMAINE: &[u8] = b"etymo-session-v1.";
/// Borne la taille d'un jeton lu, avant tout décodage.
const JETON_MAX: usize = 256;

#[derive(Debug, thiserror::Error)]
#[error("la clé de signature doit faire au moins {CLE_MIN} octets")]
pub struct CleTropCourte;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Charge {
    sub: Uuid,
    exp: i64,
}

pub struct Signataire {
    cle: Vec<u8>,
}

impl Signataire {
    pub fn nouveau(cle: &[u8]) -> Result<Self, CleTropCourte> {
        if cle.len() < CLE_MIN {
            return Err(CleTropCourte);
        }
        Ok(Self { cle: cle.to_vec() })
    }

    fn mac(&self, charge: &str) -> Hmac<Sha256> {
        let mut mac =
            <Hmac<Sha256> as KeyInit>::new_from_slice(&self.cle).expect("HMAC accepte toute clé");
        mac.update(DOMAINE);
        mac.update(charge.as_bytes());
        mac
    }

    #[must_use]
    pub fn emettre(&self, joueur: Uuid, maintenant: DateTime<Utc>) -> (String, DateTime<Utc>) {
        let expire_le = maintenant + DUREE;
        let charge = serde_json::to_vec(&Charge {
            sub: joueur,
            exp: expire_le.timestamp(),
        })
        .expect("charge");
        let charge = URL_SAFE_NO_PAD.encode(charge);
        let signature = URL_SAFE_NO_PAD.encode(self.mac(&charge).finalize().into_bytes());
        (format!("{charge}.{signature}"), expire_le)
    }

    /// Renvoie le joueur si le jeton est intact et encore valide.
    #[must_use]
    pub fn verifier(&self, jeton: &str, maintenant: DateTime<Utc>) -> Option<Uuid> {
        if jeton.len() > JETON_MAX {
            return None;
        }
        let (charge, signature) = jeton.split_once('.')?;
        let signature = URL_SAFE_NO_PAD.decode(signature).ok()?;
        // Comparaison à temps constant.
        self.mac(charge).verify_slice(&signature).ok()?;
        let charge: Charge = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(charge).ok()?).ok()?;
        (charge.exp > maintenant.timestamp()).then_some(charge.sub)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signataire() -> Signataire {
        Signataire::nouveau(&[7; 32]).unwrap()
    }

    #[test]
    fn refuse_une_cle_courte() {
        assert!(Signataire::nouveau(&[0; 31]).is_err());
    }

    #[test]
    fn un_jeton_emis_se_verifie() {
        let joueur = Uuid::new_v4();
        let maintenant = Utc::now();
        let (jeton, expire_le) = signataire().emettre(joueur, maintenant);
        assert_eq!(expire_le - maintenant, DUREE);
        assert_eq!(signataire().verifier(&jeton, maintenant), Some(joueur));
    }

    #[test]
    fn un_jeton_expire_est_refuse() {
        let maintenant = Utc::now();
        let (jeton, _) = signataire().emettre(Uuid::new_v4(), maintenant);
        assert_eq!(signataire().verifier(&jeton, maintenant + DUREE), None);
    }

    #[test]
    fn un_jeton_modifie_ou_d_une_autre_cle_est_refuse() {
        let maintenant = Utc::now();
        let (jeton, _) = signataire().emettre(Uuid::new_v4(), maintenant);
        let autre = Signataire::nouveau(&[8; 32]).unwrap();
        assert_eq!(autre.verifier(&jeton, maintenant), None);

        let (_, signature) = jeton.split_once('.').unwrap();
        let usurpe = URL_SAFE_NO_PAD.encode(format!(
            r#"{{"sub":"{}","exp":9999999999}}"#,
            Uuid::new_v4()
        ));
        assert_eq!(
            signataire().verifier(&format!("{usurpe}.{signature}"), maintenant),
            None
        );
        assert_eq!(signataire().verifier("n'importe quoi", maintenant), None);
        assert_eq!(signataire().verifier(&"a".repeat(1000), maintenant), None);
    }
}
