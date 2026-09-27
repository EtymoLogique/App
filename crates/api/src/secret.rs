//! Secret du profil invité : 256 bits aléatoires générés par le client, en
//! base64url sans remplissage. Le serveur n'en garde que l'empreinte SHA-256 :
//! vu l'entropie du secret, un hachage lent n'apporterait rien.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use etymo_contrat::LONGUEUR_SECRET;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

/// Décode le secret et renvoie son empreinte, ou `None` s'il est mal formé.
#[must_use]
pub fn empreinte(secret: &str) -> Option<[u8; 32]> {
    if secret.len() != LONGUEUR_SECRET {
        return None;
    }
    let octets = URL_SAFE_NO_PAD.decode(secret).ok()?;
    if octets.len() != 32 {
        return None;
    }
    Some(Sha256::digest(&octets).into())
}

/// Compare deux empreintes à temps constant.
#[must_use]
pub fn egales(a: &[u8], b: &[u8]) -> bool {
    a.ct_eq(b).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepte_256_bits_en_base64url() {
        let secret = URL_SAFE_NO_PAD.encode([42u8; 32]);
        assert_eq!(secret.len(), LONGUEUR_SECRET);
        assert!(empreinte(&secret).is_some());
    }

    #[test]
    fn refuse_les_secrets_mal_formes() {
        assert!(empreinte("court").is_none());
        assert!(empreinte(&"=".repeat(43)).is_none());
        assert!(empreinte(&URL_SAFE_NO_PAD.encode([1u8; 33])).is_none());
    }

    #[test]
    fn compare_les_empreintes() {
        assert!(egales(&[1, 2], &[1, 2]));
        assert!(!egales(&[1, 2], &[1, 3]));
    }
}
