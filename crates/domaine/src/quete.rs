//! Quêtes au long cours (ADR 0045) : des objectifs qui traversent les
//! fascicules, à paliers, mesurés sur le codex du joueur. Les conditions
//! forment une liste fermée ; le serveur calcule la progression.

use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::IdCatalogue;

/// Ce qu'une quête compte : la liste fermée de l'ADR 0045.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(tag = "sorte", rename_all = "snake_case")]
pub enum Sorte {
    /// Formes trouvées d'une langue, comme sa carte les compte.
    Langue { langue_id: IdCatalogue },
    /// Familles (mots formés sur une même brique) d'au moins `mots_par_famille` mots trouvés.
    Famille { mots_par_famille: u32 },
    /// Mots trouvés qui portent une transformation de ce type.
    Transformation { type_code: String },
    /// Cartes maîtrisées par les ricochets (ADR 0044).
    Ricochets,
    /// Cartes de lecteur remplies (ADR 0045).
    Lecteur,
    /// Exception de l'ADR 0045 : trouver sa première légendaire.
    PremiereLegendaire,
}

/// Types de transformation que compte une quête de transformations.
pub const TYPES_TRANSFORMATION: [&str; 4] = [
    "elision",
    "voyelle_de_liaison",
    "allomorphie",
    "adaptation_graphie",
];

/// Un palier : sa récompense est affichée d'avance et se récupère comme un jalon.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Palier {
    pub id: IdCatalogue,
    /// Valeur de la progression qui atteint le palier.
    #[schema(minimum = 1)]
    pub seuil: u32,
    #[serde(default)]
    pub encre: u32,
    #[serde(default)]
    pub sabliers: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LibellesQuete {
    pub titre: String,
    pub consigne: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct QueteLongCours {
    pub id: IdCatalogue,
    #[serde(flatten)]
    pub sorte: Sorte,
    /// Paliers par seuil croissant.
    pub paliers: Vec<Palier>,
    /// Libellés par locale ; `fr` est la locale de référence.
    pub libelles: BTreeMap<String, LibellesQuete>,
}

/// Une carte du catalogue, réduite à ce que les quêtes comptent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CarteQuete {
    pub id: IdCatalogue,
    /// Brique de la carte, si elle se pose sur la table.
    pub brique: Option<IdCatalogue>,
    /// Langue de chaque forme de la carte, une entrée par forme.
    pub langues: Vec<IdCatalogue>,
    /// Types des transformations de sa composition préférée.
    pub transformations: Vec<String>,
}

/// Mots formés sur une même brique, légendaires exclus.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Famille {
    pub brique: IdCatalogue,
    pub mots: Vec<IdCatalogue>,
}

/// Ce que le catalogue publié donne à mesurer. Un mot légendaire n'y figure
/// jamais : il n'entre dans aucun décompte (ADR 0045).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Mesures {
    pub cartes: Vec<CarteQuete>,
    pub familles: Vec<Famille>,
    /// Mots légendaires, pour la seule quête « première légendaire ».
    pub legendaires: HashSet<IdCatalogue>,
}

/// Le codex du joueur : mots découverts et briques connues.
#[derive(Debug, Clone, Copy)]
pub struct Codex<'a, S: std::hash::BuildHasher = std::hash::RandomState> {
    pub mots: &'a HashSet<IdCatalogue, S>,
    pub briques: &'a HashSet<IdCatalogue, S>,
}

impl Mesures {
    /// Progression d'une quête, à la valeur du codex.
    #[must_use]
    pub fn progression<S: std::hash::BuildHasher>(
        &self,
        sorte: &Sorte,
        codex: &Codex<'_, S>,
    ) -> u32 {
        let trouvee = |c: &&CarteQuete| {
            codex.mots.contains(&c.id)
                || c.brique.as_ref().is_some_and(|b| codex.briques.contains(b))
        };
        let nombre = match sorte {
            Sorte::Langue { langue_id } => self
                .cartes
                .iter()
                .filter(trouvee)
                .map(|c| c.langues.iter().filter(|l| *l == langue_id).count())
                .sum(),
            Sorte::Famille { mots_par_famille } => {
                let minimum = usize::try_from(*mots_par_famille).unwrap_or(usize::MAX);
                self.familles
                    .iter()
                    .filter(|f| {
                        f.mots.iter().filter(|m| codex.mots.contains(*m)).count() >= minimum
                    })
                    .count()
            }
            Sorte::Transformation { type_code } => self
                .cartes
                .iter()
                .filter(trouvee)
                .filter(|c| c.transformations.contains(type_code))
                .count(),
            Sorte::PremiereLegendaire => {
                usize::from(self.legendaires.iter().any(|m| codex.mots.contains(m)))
            }
            // Les ricochets (ADR 0044) et la carte de lecteur n'existent pas encore.
            Sorte::Ricochets | Sorte::Lecteur => 0,
        };
        u32::try_from(nombre).unwrap_or(u32::MAX)
    }
}

/// Palier atteint à cette progression.
#[must_use]
pub fn atteint(palier: &Palier, progression: u32) -> bool {
    progression >= palier.seuil
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(texte: &str) -> IdCatalogue {
        texte.parse().unwrap()
    }

    fn mesures() -> Mesures {
        let grec = id("lng_00000001");
        Mesures {
            cartes: vec![
                CarteQuete {
                    id: id("unt_0000000a"),
                    brique: Some(id("brq_0000000a")),
                    langues: vec![grec.clone(), grec.clone(), id("lng_00000002")],
                    transformations: vec!["elision".into()],
                },
                CarteQuete {
                    id: id("unt_0000000b"),
                    brique: None,
                    langues: vec![grec],
                    transformations: vec![],
                },
            ],
            familles: vec![Famille {
                brique: id("brq_0000000a"),
                mots: vec![id("unt_0000000b"), id("unt_0000000c")],
            }],
            legendaires: HashSet::from([id("unt_0000000d")]),
        }
    }

    #[test]
    fn compte_les_formes_des_seules_cartes_trouvees() {
        let m = mesures();
        let sorte = Sorte::Langue {
            langue_id: id("lng_00000001"),
        };
        let (mots, briques) = (HashSet::new(), HashSet::new());
        assert_eq!(
            m.progression(
                &sorte,
                &Codex {
                    mots: &mots,
                    briques: &briques
                }
            ),
            0
        );
        // Une brique connue montre sa carte ; un mot découvert, la sienne.
        let briques = HashSet::from([id("brq_0000000a")]);
        assert_eq!(
            m.progression(
                &sorte,
                &Codex {
                    mots: &mots,
                    briques: &briques
                }
            ),
            2
        );
        let mots = HashSet::from([id("unt_0000000b")]);
        assert_eq!(
            m.progression(
                &sorte,
                &Codex {
                    mots: &mots,
                    briques: &briques
                }
            ),
            3
        );
    }

    #[test]
    fn une_famille_compte_ses_mots_trouves() {
        let m = mesures();
        let (mots, briques) = (HashSet::from([id("unt_0000000b")]), HashSet::new());
        let codex = Codex {
            mots: &mots,
            briques: &briques,
        };
        assert_eq!(
            m.progression(
                &Sorte::Famille {
                    mots_par_famille: 1
                },
                &codex
            ),
            1
        );
        assert_eq!(
            m.progression(
                &Sorte::Famille {
                    mots_par_famille: 2
                },
                &codex
            ),
            0
        );
    }

    #[test]
    fn transformations_legendaire_et_sortes_a_venir() {
        let m = mesures();
        let (mots, briques) = (HashSet::from([id("unt_0000000a")]), HashSet::new());
        let codex = Codex {
            mots: &mots,
            briques: &briques,
        };
        let elision = Sorte::Transformation {
            type_code: "elision".into(),
        };
        assert_eq!(m.progression(&elision, &codex), 1);
        assert_eq!(m.progression(&Sorte::PremiereLegendaire, &codex), 0);
        assert_eq!(m.progression(&Sorte::Ricochets, &codex), 0);
        assert_eq!(m.progression(&Sorte::Lecteur, &codex), 0);
        let mots = HashSet::from([id("unt_0000000d")]);
        let codex = Codex {
            mots: &mots,
            briques: &briques,
        };
        assert_eq!(m.progression(&Sorte::PremiereLegendaire, &codex), 1);
    }

    #[test]
    fn un_palier_est_atteint_au_seuil() {
        let palier = Palier {
            id: id("pal_0000000a"),
            seuil: 3,
            encre: 0,
            sabliers: 1,
        };
        assert!(!atteint(&palier, 2));
        assert!(atteint(&palier, 3));
    }
}
