//! Formats JSON de l'artefact, format 1 (compilateur du dépôt Content).
//!
//! Les champs inconnus sont tolérés : un artefact plus récent reste lisible
//! tant que son `format` ne change pas.

use std::collections::BTreeSet;

use chrono::{DateTime, FixedOffset};
use etymo_domaine::IdCatalogue;
use serde::{Deserialize, Serialize};

use crate::Chemin;

/// Index global (`public/index.json`) ou calendrier (`staging/parutions.json`) :
/// même forme, seuls les fascicules listés diffèrent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Calendrier {
    pub format: u32,
    pub version: String,
    #[serde(default)]
    pub essai: bool,
    /// Langues, systèmes d'écriture et conventions, recopiés tels quels.
    #[schema(value_type = Value)]
    pub referentiels: serde_json::Value,
    pub fascicules: Vec<EntreeFascicule>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct EntreeFascicule {
    pub numero: u32,
    #[schema(value_type = String, format = DateTime)]
    pub parution: DateTime<FixedOffset>,
    pub manifeste: Chemin,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Manifeste {
    pub format: u32,
    pub numero: u32,
    #[schema(value_type = String, format = DateTime)]
    pub parution: DateTime<FixedOffset>,
    #[serde(default)]
    pub test: bool,
    pub jaquette: Option<Chemin>,
    pub exclusions: Option<Chemin>,
    #[serde(default)]
    pub cartes: Vec<CarteManifeste>,
    #[serde(default)]
    pub langues: Vec<LangueManifeste>,
    #[serde(default)]
    pub recettes: Vec<RecetteManifeste>,
    #[serde(default)]
    #[schema(value_type = Value)]
    pub compteurs: serde_json::Value,
    #[serde(default)]
    #[schema(value_type = Value)]
    pub pli: serde_json::Value,
    #[serde(default)]
    #[schema(value_type = Vec<Value>)]
    pub jalons: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Resultat,
    Ingredient,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CarteManifeste {
    pub id: IdCatalogue,
    pub role: Role,
    pub carte: Chemin,
    pub silhouette: Option<Chemin>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct LangueManifeste {
    pub id: IdCatalogue,
    pub silhouette: Option<Chemin>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct RecetteManifeste {
    pub id: IdCatalogue,
    pub chemin: Chemin,
}

impl Manifeste {
    /// Chemins des ressources citées, triés et sans doublon : la même règle
    /// que `ressources()` dans `compilation.py` du dépôt Content.
    #[must_use]
    pub fn ressources(&self) -> Vec<Chemin> {
        let mut chemins: BTreeSet<&Chemin> = BTreeSet::new();
        chemins.extend(self.jaquette.iter().chain(self.exclusions.iter()));
        for carte in &self.cartes {
            chemins.insert(&carte.carte);
            chemins.extend(carte.silhouette.iter());
        }
        chemins.extend(self.langues.iter().filter_map(|l| l.silhouette.as_ref()));
        chemins.extend(self.recettes.iter().map(|r| &r.chemin));
        chemins.into_iter().cloned().collect()
    }
}
