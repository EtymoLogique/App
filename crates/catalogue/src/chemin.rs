//! Chemins hachés de l'artefact : `f/<sha256>.json` (manifestes),
//! `r/<sha256>.json` (ressources) et `a/<sha256>.svg` (médias).
//!
//! Un chemin validé ne peut ni remonter l'arborescence ni viser un autre
//! fichier que ceux de l'artefact.

use std::fmt;

use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};

use crate::ErreurCatalogue;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("chemin d'artefact invalide")]
pub struct ErreurChemin;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Genre {
    Manifeste,
    Ressource,
    Media,
}

/// Chemin haché d'un fichier de l'artefact, relatif au préfixe publié.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, utoipa::ToSchema)]
#[serde(transparent)]
#[schema(value_type = String, pattern = "^(f/[0-9a-f]{64}\\.json|r/[0-9a-f]{64}\\.json|a/[0-9a-f]{64}\\.svg)$")]
pub struct Chemin(String);

impl Chemin {
    pub fn nouveau(texte: &str) -> Result<Self, ErreurChemin> {
        let (dossier, fichier) = texte.split_once('/').ok_or(ErreurChemin)?;
        let extension = match dossier {
            "f" | "r" => ".json",
            "a" => ".svg",
            _ => return Err(ErreurChemin),
        };
        let empreinte = fichier.strip_suffix(extension).ok_or(ErreurChemin)?;
        let hexa = |c: char| c.is_ascii_digit() || ('a'..='f').contains(&c);
        if empreinte.len() != 64 || !empreinte.chars().all(hexa) {
            return Err(ErreurChemin);
        }
        Ok(Self(texte.to_owned()))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    #[must_use]
    pub fn genre(&self) -> Genre {
        match &self.0[..1] {
            "f" => Genre::Manifeste,
            "r" => Genre::Ressource,
            _ => Genre::Media,
        }
    }

    #[must_use]
    pub fn empreinte(&self) -> &str {
        &self.0[2..66]
    }

    /// Type MIME exact sous lequel le fichier est servi (ADR 0025).
    #[must_use]
    pub fn type_contenu(&self) -> &'static str {
        match self.genre() {
            Genre::Media => "image/svg+xml",
            Genre::Manifeste | Genre::Ressource => "application/json",
        }
    }

    pub fn verifier(&self, octets: &[u8]) -> Result<(), ErreurCatalogue> {
        if hex::encode(Sha256::digest(octets)) == self.empreinte() {
            Ok(())
        } else {
            Err(ErreurCatalogue::Empreinte(self.0.clone()))
        }
    }
}

impl<'de> Deserialize<'de> for Chemin {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let texte = String::deserialize(deserializer)?;
        Chemin::nouveau(&texte).map_err(serde::de::Error::custom)
    }
}

impl fmt::Display for Chemin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const H: &str = "091591e0049bc013099cf962b46d0522ae2288de01f00abbf8e7d60075f46cbe";

    #[test]
    fn accepte_les_trois_genres() {
        assert_eq!(
            Chemin::nouveau(&format!("f/{H}.json")).unwrap().genre(),
            Genre::Manifeste
        );
        assert_eq!(
            Chemin::nouveau(&format!("r/{H}.json")).unwrap().genre(),
            Genre::Ressource
        );
        let media = Chemin::nouveau(&format!("a/{H}.svg")).unwrap();
        assert_eq!(media.type_contenu(), "image/svg+xml");
        assert_eq!(media.empreinte(), H);
    }

    #[test]
    fn refuse_les_chemins_hors_artefact() {
        for texte in [
            "index.json".to_owned(),
            format!("../{H}.json"),
            format!("f/../{H}.json"),
            format!("a/{H}.json"),
            format!("r/{H}.svg"),
            format!("f/{}.json", H.to_uppercase()),
            format!("f/{}.json", &H[1..]),
            format!("/f/{H}.json"),
        ] {
            assert_eq!(Chemin::nouveau(&texte), Err(ErreurChemin), "{texte}");
        }
    }

    #[test]
    fn verifie_l_empreinte() {
        let octets = b"{}";
        let bon =
            Chemin::nouveau(&format!("r/{}.json", hex::encode(Sha256::digest(octets)))).unwrap();
        assert!(bon.verifier(octets).is_ok());
        assert!(bon.verifier(b"[]").is_err());
    }
}
