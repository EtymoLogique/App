//! Formats JSON de l'artefact, format 1 (compilateur du dépôt Content).
//!
//! Les champs inconnus sont tolérés : un artefact plus récent reste lisible
//! tant que son `format` ne change pas.

use std::collections::BTreeSet;

use chrono::{DateTime, FixedOffset};
use etymo_domaine::IdCatalogue;
use etymo_domaine::jalon::Jalon;
use etymo_domaine::pli::{Equilibrage, NaturePli, Rarete};
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
    /// Identifiant opaque du fascicule : les données du joueur le désignent par lui.
    pub id: IdCatalogue,
    pub numero: u32,
    /// Nom du fascicule, celui de sa jaquette (ADR 0016) ; absent des manifestes plus anciens.
    #[serde(default)]
    pub nom: Option<String>,
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
    /// Briques tirables et paramètres d'équilibrage du pli (ADR 0009, 0011).
    #[serde(default)]
    pub pli: PliManifeste,
    /// Jalons du fascicule, récompenses affichées à l'avance (ADR 0038).
    #[serde(default)]
    pub jalons: Vec<Jalon>,
    /// Réserve de départ du fascicule (ADR 0030).
    #[serde(default)]
    pub graines: Vec<Graine>,
    /// Mots posables comme briques : leur découverte en offre un exemplaire.
    #[serde(default)]
    pub mots_briques: Vec<MotBrique>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct MotBrique {
    pub mot_id: IdCatalogue,
    pub brique_id: IdCatalogue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Graine {
    pub brique_id: IdCatalogue,
    #[schema(minimum = 1, maximum = 5)]
    pub exemplaires: u8,
}

/// Ressource « recette » : la composition jouée et ses emplacements ordonnés.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Recette {
    pub id: IdCatalogue,
    pub composition_id: IdCatalogue,
    pub resultat_id: IdCatalogue,
    pub emplacements: Vec<Emplacement>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Emplacement {
    pub rang: u32,
    pub briques_acceptees: Vec<IdCatalogue>,
}

/// Ressource « exclusions » d'un fascicule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Exclusions {
    pub exclusions: Vec<Exclusion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Exclusion {
    pub id: IdCatalogue,
    pub combinaison: Vec<IdCatalogue>,
    pub raison: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Resultat,
    Ingredient,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct PliManifeste {
    #[serde(default)]
    pub briques: Vec<BriquePliManifeste>,
    /// Absent d'un manifeste antérieur à l'équilibrage : son pli ne s'ouvre pas.
    #[serde(default)]
    pub equilibrage: Option<EquilibrageManifeste>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct BriquePliManifeste {
    pub id: IdCatalogue,
    pub unite_id: IdCatalogue,
    /// Absente d'un manifeste antérieur à l'équilibrage : son pli ne s'ouvre pas.
    #[serde(default)]
    pub nature: Option<NaturePli>,
    pub rarete: Rarete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct EquilibrageManifeste {
    /// Version des paramètres, inscrite dans l'historique de chaque pli.
    pub version: String,
    #[serde(flatten)]
    pub parametres: Equilibrage,
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
