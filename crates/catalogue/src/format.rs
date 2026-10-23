//! Formats JSON de l'artefact, format 1 (compilateur du dépôt Content).
//!
//! Les champs inconnus sont tolérés : un artefact plus récent reste lisible
//! tant que son `format` ne change pas.

use std::collections::BTreeSet;

use chrono::{DateTime, FixedOffset, Utc};
use etymo_domaine::IdCatalogue;
use etymo_domaine::cadeau::CadeauDeBienvenue;
use etymo_domaine::jalon::Jalon;
use etymo_domaine::pli::{Equilibrage, NaturePli, Rarete};
use etymo_domaine::quete::{Collection, QueteLongCours};
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
    /// Quêtes au long cours, communes à tous les fascicules (ADR 0045) ;
    /// absentes d'un index antérieur.
    #[serde(default)]
    pub quetes: Vec<QueteLongCours>,
    /// Cadeau de bienvenue, unique par profil (ADR 0046) ; absent d'un index antérieur.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cadeau_de_bienvenue: Option<CadeauDeBienvenue>,
    /// Date de parution du prochain fascicule du calendrier, en UTC, rien d'autre
    /// de ce fascicule (ADR 0049) ; absente s'il n'y en a plus.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<String>, format = DateTime)]
    pub prochaine_parution: Option<DateTime<Utc>>,
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
    /// De quoi juger un ricochet sans lire un texte (ADR 0044).
    #[serde(default)]
    pub ricochets: RicochetsManifeste,
    /// Quêtes de collection du fascicule (App#90), membres hors légendaires.
    #[serde(default)]
    pub collections: Vec<Collection>,
}

/// Données de jugement des ricochets d'un fascicule : des identifiants, jamais de texte.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct RicochetsManifeste {
    #[serde(default)]
    pub briques: Vec<BriqueRicochet>,
    #[serde(default)]
    pub mots: Vec<MotRicochet>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct BriqueRicochet {
    pub id: IdCatalogue,
    /// Sens affiché de la brique : la bonne réponse de « sens d'une brique ».
    pub sens_id: IdCatalogue,
    /// Commune à deux briques de même glose : jamais deux leurres de même classe.
    pub classe_sens: IdCatalogue,
    /// Colonne de la brique dans « assembler » (ADR 0067) ; absente : jamais proposée.
    #[serde(default)]
    pub position: Option<PositionBrique>,
}

/// Place d'une brique dans un mot de deux briques : devant (« géo- ») ou derrière (« -graphie »).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum PositionBrique {
    Prefixe,
    Suffixe,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct MotRicochet {
    pub id: IdCatalogue,
    /// Commune à deux mots de même sens littéral ; absente si le mot n'en a pas.
    #[serde(default)]
    pub classe_litteral: Option<IdCatalogue>,
    /// Positions de coupe de la composition préférée ; vide : le mot ne se découpe pas.
    #[serde(default)]
    pub coupes: Vec<u32>,
    /// Les deux briques de la composition préférée, préfixe puis suffixe ;
    /// vide : le mot ne s'assemble pas (ADR 0067).
    #[serde(default)]
    pub assemblage: Vec<IdCatalogue>,
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

/// Difficulté de déduction d'un mot (ADR 0047) : réglage d'équilibrage, jamais affiché au joueur.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Difficulte {
    Facile,
    Moyen,
    Difficile,
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
    /// Résultats seulement ; absente d'un manifeste antérieur à l'ADR 0047.
    #[serde(default)]
    pub difficulte: Option<Difficulte>,
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
