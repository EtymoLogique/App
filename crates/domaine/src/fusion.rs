//! Résolution d'une fusion (ADR 0003, ADR 0012) : la proposition ordonnée du
//! joueur est comparée aux recettes des fascicules parus. Ce module ne lit
//! rien et n'écrit rien : le serveur l'appelle dans sa transaction, la PWA en
//! a le miroir pour prévisualiser.

use std::collections::{BTreeMap, HashSet};
use std::hash::BuildHasher;

use serde::{Deserialize, Serialize};

use crate::IdCatalogue;

/// La table de fusion accepte exactement deux briques : on ne fusionne jamais
/// plus de deux éléments à la fois.
pub const TABLE_MIN: usize = 2;
pub const TABLE_MAX: usize = 2;

/// Une recette jouable : pour chaque emplacement, dans l'ordre, les briques acceptées.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecetteJeu {
    pub id: IdCatalogue,
    pub mot_id: IdCatalogue,
    pub emplacements: Vec<Vec<IdCatalogue>>,
}

/// Une combinaison attestée volontairement écartée, avec sa raison.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExclusionJeu {
    pub combinaison: Vec<IdCatalogue>,
    pub raison: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum MotifPresque {
    /// Les bonnes briques, dans un autre ordre.
    Ordre,
    /// Une partie des briques d'une recette : il en manque.
    Incomplet,
}

/// Résultat d'une proposition, avant toute vérification de la réserve.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Issue {
    /// Recette exacte, mot encore inconnu : c'est une découverte.
    Decouverte {
        recette_id: IdCatalogue,
        mot_id: IdCatalogue,
    },
    /// Recette exacte d'un mot déjà découvert : rien n'est consommé.
    Connue {
        recette_id: IdCatalogue,
        mot_id: IdCatalogue,
    },
    /// Combinaison écartée par l'équipe éditoriale, avec sa raison.
    Exclue { raison: String },
    /// Pertinente mais incomplète ou mal ordonnée.
    Presque { motif: MotifPresque },
    /// Aucune correspondance.
    Echec,
}

/// Compare une proposition aux recettes. `decouverts` contient les mots déjà
/// au codex du joueur : un « presque » ne renvoie jamais vers eux.
#[must_use]
pub fn resoudre<S: BuildHasher>(
    proposition: &[IdCatalogue],
    recettes: &[RecetteJeu],
    exclusions: &[ExclusionJeu],
    decouverts: &HashSet<IdCatalogue, S>,
) -> Issue {
    if let Some(recette) = recettes.iter().find(|r| exacte(proposition, r)) {
        let (recette_id, mot_id) = (recette.id.clone(), recette.mot_id.clone());
        return if decouverts.contains(&recette.mot_id) {
            Issue::Connue { recette_id, mot_id }
        } else {
            Issue::Decouverte { recette_id, mot_id }
        };
    }
    if let Some(exclusion) = exclusions.iter().find(|e| e.combinaison == proposition) {
        return Issue::Exclue {
            raison: exclusion.raison.clone(),
        };
    }
    let a_decouvrir = || recettes.iter().filter(|r| !decouverts.contains(&r.mot_id));
    if a_decouvrir().any(|r| r.emplacements.len() == proposition.len() && couvre(proposition, r)) {
        return Issue::Presque {
            motif: MotifPresque::Ordre,
        };
    }
    if a_decouvrir().any(|r| r.emplacements.len() > proposition.len() && couvre(proposition, r)) {
        return Issue::Presque {
            motif: MotifPresque::Incomplet,
        };
    }
    Issue::Echec
}

/// Exemplaires qu'une découverte consomme : un par brique posée.
#[must_use]
pub fn consommation(proposition: &[IdCatalogue]) -> BTreeMap<&IdCatalogue, u8> {
    let mut besoins = BTreeMap::new();
    for brique in proposition {
        *besoins.entry(brique).or_insert(0u8) += 1;
    }
    besoins
}

fn exacte(proposition: &[IdCatalogue], recette: &RecetteJeu) -> bool {
    proposition.len() == recette.emplacements.len()
        && proposition
            .iter()
            .zip(&recette.emplacements)
            .all(|(b, acceptees)| acceptees.contains(b))
}

/// Vrai si chaque brique de la proposition occupe un emplacement distinct de
/// la recette, quel que soit l'ordre (appariement par retour arrière : la
/// table compte au plus quatre briques).
fn couvre(proposition: &[IdCatalogue], recette: &RecetteJeu) -> bool {
    fn apparier(
        reste: &[IdCatalogue],
        emplacements: &[Vec<IdCatalogue>],
        pris: &mut Vec<bool>,
    ) -> bool {
        let Some((brique, suite)) = reste.split_first() else {
            return true;
        };
        for (i, acceptees) in emplacements.iter().enumerate() {
            if !pris[i] && acceptees.contains(brique) {
                pris[i] = true;
                if apparier(suite, emplacements, pris) {
                    return true;
                }
                pris[i] = false;
            }
        }
        false
    }
    proposition.len() <= recette.emplacements.len()
        && apparier(
            proposition,
            &recette.emplacements,
            &mut vec![false; recette.emplacements.len()],
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(texte: &str) -> IdCatalogue {
        texte.parse().unwrap()
    }

    fn recettes() -> Vec<RecetteJeu> {
        vec![
            RecetteJeu {
                id: id("rct_0000000g"),
                mot_id: id("unt_0000000g"),
                emplacements: vec![vec![id("brq_0000ge00")], vec![id("brq_000109e0")]],
            },
            RecetteJeu {
                id: id("rct_0000000b"),
                mot_id: id("unt_0000000b"),
                emplacements: vec![
                    vec![id("brq_0000b100")],
                    vec![id("brq_000109e0")],
                    vec![id("brq_00000s7e")],
                ],
            },
        ]
    }

    fn briques(ids: &[&str]) -> Vec<IdCatalogue> {
        ids.iter().map(|t| id(t)).collect()
    }

    #[test]
    fn recette_exacte_nouvelle_ou_connue() {
        let proposition = briques(&["brq_0000ge00", "brq_000109e0"]);
        let attendu = (id("rct_0000000g"), id("unt_0000000g"));
        assert_eq!(
            resoudre(&proposition, &recettes(), &[], &HashSet::new()),
            Issue::Decouverte {
                recette_id: attendu.0.clone(),
                mot_id: attendu.1.clone()
            }
        );
        let connus = HashSet::from([id("unt_0000000g")]);
        assert_eq!(
            resoudre(&proposition, &recettes(), &[], &connus),
            Issue::Connue {
                recette_id: attendu.0,
                mot_id: attendu.1
            }
        );
    }

    #[test]
    fn presque_quand_l_ordre_est_faux() {
        let proposition = briques(&["brq_000109e0", "brq_0000ge00"]);
        assert_eq!(
            resoudre(&proposition, &recettes(), &[], &HashSet::new()),
            Issue::Presque {
                motif: MotifPresque::Ordre
            }
        );
    }

    #[test]
    fn presque_quand_il_manque_une_brique() {
        let proposition = briques(&["brq_00000s7e", "brq_0000b100"]);
        assert_eq!(
            resoudre(&proposition, &recettes(), &[], &HashSet::new()),
            Issue::Presque {
                motif: MotifPresque::Incomplet
            }
        );
    }

    #[test]
    fn jamais_de_presque_vers_un_mot_deja_decouvert() {
        let proposition = briques(&["brq_000109e0", "brq_0000ge00"]);
        let connus = HashSet::from([id("unt_0000000g")]);
        assert_eq!(
            resoudre(&proposition, &recettes(), &[], &connus),
            Issue::Echec
        );
    }

    #[test]
    fn une_exclusion_donne_sa_raison() {
        let proposition = briques(&["brq_0000ge00", "brq_00000s7e"]);
        let exclusions = vec![ExclusionJeu {
            combinaison: proposition.clone(),
            raison: "rare".into(),
        }];
        assert_eq!(
            resoudre(&proposition, &recettes(), &exclusions, &HashSet::new()),
            Issue::Exclue {
                raison: "rare".into()
            }
        );
    }

    #[test]
    fn echec_sans_correspondance() {
        let proposition = briques(&["brq_0000ge00", "brq_0000b100"]);
        assert_eq!(
            resoudre(&proposition, &recettes(), &[], &HashSet::new()),
            Issue::Echec
        );
    }

    #[test]
    fn une_brique_ne_couvre_qu_un_emplacement() {
        let proposition = briques(&["brq_000109e0", "brq_000109e0"]);
        assert_eq!(
            resoudre(&proposition, &recettes(), &[], &HashSet::new()),
            Issue::Echec
        );
    }

    #[test]
    fn compte_les_exemplaires_a_consommer() {
        let proposition = briques(&["brq_000109e0", "brq_0000ge00", "brq_000109e0"]);
        let besoins = consommation(&proposition);
        assert_eq!(besoins[&id("brq_000109e0")], 2);
        assert_eq!(besoins[&id("brq_0000ge00")], 1);
    }
}
