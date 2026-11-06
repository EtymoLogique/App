//! Cadeau de bienvenue (ADR 0046) : une récompense unique par profil, déclarée
//! par le catalogue. Ses plis ont un contenu fixé, comme un pli de jalon :
//! ils ne consomment pas d'énergie et ne comptent pour aucune garantie.

use serde::{Deserialize, Serialize};

use crate::IdCatalogue;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CadeauDeBienvenue {
    /// Une brique par pli de bienvenue, choisie pour ouvrir des recettes ; jamais une légendaire.
    pub plis: Vec<IdCatalogue>,
    #[serde(default)]
    pub sabliers: u32,
    /// Gouttes d'encre.
    #[serde(default)]
    pub encre: u32,
}
