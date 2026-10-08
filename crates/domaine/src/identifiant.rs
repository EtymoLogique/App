//! Identifiants opaques et stables du catalogue (ADR 0005) : un préfixe de
//! trois lettres, un trait bas, puis 8 caractères du base32 de Crockford en
//! minuscules. Ils ne contiennent jamais de graphie.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize};

const ALPHABET: &str = "0123456789abcdefghjkmnpqrstvwxyz";
const LONGUEUR: usize = 8;
const PREFIXES: [&str; 19] = [
    "lng", "ecr", "cnv", "src", "unt", "frm", "sns", "cmp", "trf", "rel", "brq", "rct", "fsc",
    "exc", "med", "jal", "qlc", "pal", "tpl",
];

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ErreurIdentifiant {
    #[error("identifiant mal formé")]
    Forme,
    #[error("préfixe inconnu")]
    Prefixe,
}

/// Identifiant opaque du catalogue : `<préfixe>_<8 caractères base32>`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, utoipa::ToSchema)]
#[serde(transparent)]
#[schema(value_type = String, pattern = "^[a-z]{3}_[0-9a-hjkmnp-tv-z]{8}$", example = "brq_2e9chtta")]
pub struct IdCatalogue(String);

impl IdCatalogue {
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    #[must_use]
    pub fn prefixe(&self) -> &str {
        &self.0[..3]
    }
}

impl FromStr for IdCatalogue {
    type Err = ErreurIdentifiant;

    fn from_str(texte: &str) -> Result<Self, Self::Err> {
        let (prefixe, corps) = texte.split_once('_').ok_or(ErreurIdentifiant::Forme)?;
        if corps.len() != LONGUEUR || !corps.chars().all(|c| ALPHABET.contains(c)) {
            return Err(ErreurIdentifiant::Forme);
        }
        if !PREFIXES.contains(&prefixe) {
            return Err(ErreurIdentifiant::Prefixe);
        }
        Ok(Self(texte.to_owned()))
    }
}

impl<'de> Deserialize<'de> for IdCatalogue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let texte = String::deserialize(deserializer)?;
        texte.parse().map_err(serde::de::Error::custom)
    }
}

impl fmt::Display for IdCatalogue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepte_un_identifiant_valide() {
        let id: IdCatalogue = "brq_2e9chtta".parse().unwrap();
        assert_eq!(id.prefixe(), "brq");
    }

    #[test]
    fn refuse_les_formes_invalides() {
        for texte in [
            "brq2e9chtta",
            "brq_2e9chtt",
            "brq_2e9chttA",
            "brq_2e9chtti",
            "../../x",
        ] {
            assert_eq!(
                texte.parse::<IdCatalogue>(),
                Err(ErreurIdentifiant::Forme),
                "{texte}"
            );
        }
        assert_eq!(
            "zzz_2e9chtta".parse::<IdCatalogue>(),
            Err(ErreurIdentifiant::Prefixe)
        );
    }
}
