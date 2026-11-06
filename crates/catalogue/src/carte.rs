//! Ressource « carte » d'une unité (ADR 0027) : ce que la PWA lit pour
//! afficher une brique, la table, la fiche d'une découverte et sa section
//! « En savoir plus » (faits et sources citées). Les champs qu'elle n'utilise
//! pas sont tolérés.

use std::collections::BTreeMap;

use etymo_domaine::IdCatalogue;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Libellés par locale ; `fr` est la locale de référence.
pub type ParLocale<T> = BTreeMap<String, T>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Nature {
    Mot,
    Prefixe,
    Suffixe,
}

/// La rareté est une règle de jeu : elle vit dans le domaine.
pub use etymo_domaine::pli::Rarete;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Carte {
    pub id: IdCatalogue,
    pub nature: Nature,
    pub langue_id: IdCatalogue,
    pub formes: Vec<Forme>,
    pub sens: Vec<Sens>,
    /// Présente si l'unité se pose sur la table.
    #[serde(default)]
    pub brique: Option<BriqueCarte>,
    #[serde(default)]
    pub compositions: Vec<CompositionCarte>,
    #[serde(default)]
    pub relations: Vec<RelationCarte>,
    /// Socle éditorial de l'unité : son niveau de confiance.
    #[serde(default)]
    pub fait: Option<Fait>,
    /// Sources citées par la carte, par identifiant : citées, jamais copiées.
    #[serde(default)]
    pub sources: BTreeMap<IdCatalogue, Source>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Confiance {
    Etablie,
    Probable,
    Discutee,
    NonRetenue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Fait {
    pub confiance: Confiance,
    #[serde(default)]
    pub sources: Vec<SourceCitee>,
}

/// Renvoi d'un fait vers une source de la carte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SourceCitee {
    pub source_id: IdCatalogue,
    /// Page ou entrée dans la source, quand elle est renseignée.
    #[serde(default)]
    pub localisation: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Source {
    pub id: IdCatalogue,
    /// Dictionnaire, ouvrage, article…
    #[serde(rename = "type")]
    pub type_source: String,
    /// `reference` pour une source de référence.
    pub role: String,
    pub reference: String,
    #[serde(default)]
    pub edition: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct BriqueCarte {
    pub id: IdCatalogue,
    pub forme_affichee_id: IdCatalogue,
    pub sens_affiche_id: IdCatalogue,
    pub rarete: Rarete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Forme {
    pub id: IdCatalogue,
    pub texte: String,
    /// `canonique` pour la forme de référence.
    pub role: String,
    pub systeme_ecriture_id: IdCatalogue,
    #[serde(default)]
    pub translitterations: Vec<Translitteration>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Translitteration {
    pub convention_id: IdCatalogue,
    pub texte: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Sens {
    pub id: IdCatalogue,
    pub rang: u32,
    pub libelles: ParLocale<LibellesSens>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct LibellesSens {
    #[serde(default)]
    pub glose: Option<String>,
    #[serde(default)]
    pub definition: Option<String>,
    /// Exemples concrets pour se représenter le mot, montrés au dos de la carte.
    #[serde(default)]
    pub exemples: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CompositionCarte {
    pub id: IdCatalogue,
    #[serde(default)]
    pub preferee: bool,
    pub parties: Vec<Partie>,
    #[serde(default)]
    pub transformations: Vec<Transformation>,
    pub libelles: ParLocale<LibellesComposition>,
    #[serde(default)]
    pub fait: Option<Fait>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Partie {
    pub rang: u32,
    pub unite_id: IdCatalogue,
    pub forme_id: IdCatalogue,
    pub sens_id: IdCatalogue,
    /// Morceau du mot résultat que couvre la partie, en caractères.
    #[serde(default)]
    pub segment_debut: Option<u32>,
    #[serde(default)]
    pub segment_fin: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Transformation {
    pub id: IdCatalogue,
    pub type_code: String,
    pub ordre: u32,
    /// Partie de la composition que la transformation touche.
    #[serde(default)]
    pub rang_partie: Option<u32>,
    pub libelles: ParLocale<LibelleTexte>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct LibelleTexte {
    pub texte: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct LibellesComposition {
    #[serde(default)]
    pub explication_courte: Option<String>,
    #[serde(default)]
    pub sens_litteral: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct RelationCarte {
    pub id: IdCatalogue,
    pub type_code: String,
    /// L'étymon : l'unité d'origine, recopiée dans la carte.
    #[serde(default)]
    pub etymon: Option<Etymon>,
    #[serde(default)]
    pub fait: Option<Fait>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Etymon {
    pub id: IdCatalogue,
    pub langue_id: IdCatalogue,
    pub forme: Forme,
    #[serde(default)]
    pub sens: Vec<Sens>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lit_une_carte_de_brique_et_tolere_les_champs_inconnus() {
        let carte: Carte = serde_json::from_str(
            r#"{
                "id": "unt_k1ktdn0d", "nature": "prefixe", "langue_id": "lng_wa90y54n",
                "fait": { "confiance": "etablie" },
                "formes": [{ "id": "frm_p4s3snyd", "texte": "géo", "role": "canonique",
                             "systeme_ecriture_id": "ecr_ww2jr3g9", "cle_normalisee": "géo" }],
                "sens": [{ "id": "sns_b9rwd12b", "rang": 1, "libelles": { "fr": { "glose": "terre" } } }],
                "brique": { "id": "brq_gjgmxbbz", "forme_affichee_id": "frm_p4s3snyd",
                            "sens_affiche_id": "sns_b9rwd12b", "rarete": "commune" },
                "relations": [{ "id": "rel_psa6j2dj", "type_code": "forme_de_composition",
                                "etymon": { "id": "unt_7mf7499z", "langue_id": "lng_kmf44d76", "nature": "mot",
                                            "forme": { "id": "frm_ytkrja86", "texte": "γῆ", "role": "canonique",
                                                       "systeme_ecriture_id": "ecr_m63cytfk",
                                                       "translitterations": [{ "convention_id": "cnv_570ncjj6", "texte": "gê" }] },
                                            "sens": [] } }]
            }"#,
        )
        .unwrap();
        assert_eq!(carte.nature, Nature::Prefixe);
        assert_eq!(carte.brique.unwrap().rarete, Rarete::Commune);
        assert_eq!(
            carte.relations[0]
                .etymon
                .as_ref()
                .unwrap()
                .forme
                .translitterations[0]
                .texte,
            "gê"
        );
    }

    #[test]
    fn lit_les_faits_et_les_sources_citees() {
        let carte: Carte = serde_json::from_str(
            r#"{
                "id": "unt_28vwxz4h", "nature": "mot", "langue_id": "lng_wa90y54n",
                "fait": { "confiance": "etablie",
                          "sources": [{ "source_id": "src_6zfwd3mp", "localisation": null }] },
                "formes": [], "sens": [],
                "compositions": [{ "id": "cmp_25pks50z", "preferee": true, "parties": [],
                                   "fait": { "confiance": "probable", "sources": [{ "source_id": "src_6zfwd3mp" }] },
                                   "transformations": [{ "id": "trf_xh53ckqh", "type_code": "elision", "ordre": 1,
                                                         "rang_partie": 1,
                                                         "libelles": { "fr": { "texte": "Le e final tombe." } } }],
                                   "libelles": {} }],
                "sources": { "src_6zfwd3mp": { "id": "src_6zfwd3mp", "type": "dictionnaire", "role": "reference",
                                               "reference": "TLFi", "edition": "version en ligne",
                                               "url": "https://www.cnrtl.fr/etymologie/",
                                               "licence": "Consultation seulement" } }
            }"#,
        )
        .unwrap();
        let composition = &carte.compositions[0];
        assert_eq!(
            composition.fait.as_ref().unwrap().confiance,
            Confiance::Probable
        );
        assert_eq!(composition.transformations[0].rang_partie, Some(1));
        assert_eq!(
            carte.fait.unwrap().sources[0].source_id.as_str(),
            "src_6zfwd3mp"
        );
        let source = &carte.sources[&composition.fait.as_ref().unwrap().sources[0].source_id];
        assert_eq!(source.type_source, "dictionnaire");
        assert_eq!(source.reference, "TLFi");
    }
}
