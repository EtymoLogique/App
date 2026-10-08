//! Résolution d'une fusion (ADR 0003, ADR 0012) : la proposition ordonnée du
//! joueur est comparée aux recettes des fascicules parus. Ce module ne lit
//! rien et n'écrit rien : le serveur l'appelle dans sa transaction, la PWA en
//! a le miroir pour prévisualiser.

use std::collections::{BTreeMap, HashMap, HashSet};
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

/// Une paire de briques qui s'écrit comme un mot sans en venir (ADR 0052).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrompeLOeilJeu {
    pub id: IdCatalogue,
    pub combinaison: Vec<IdCatalogue>,
}

/// Briques de même forme, par brique : les autres briques qui s'écrivent comme elle (ADR 0052).
pub type Homographes = HashMap<IdCatalogue, Vec<IdCatalogue>>;

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
    /// Une brique posée a un homographe qui donnerait une recette : bonne forme,
    /// autre brique. `rang` est l'emplacement (0 ou 1) de la brique à changer.
    Homographe { rang: u8 },
    /// Paire déclarée comme fausse piste : les lettres se suivent, le mot n'en vient pas.
    TrompeLOeil { id: IdCatalogue },
    /// Aucune correspondance.
    Echec,
}

/// Ce que le catalogue sait d'une proposition qui n'est pas une recette.
#[derive(Debug, Clone, Copy, Default)]
pub struct Explications<'a> {
    pub trompes_l_oeil: &'a [TrompeLOeilJeu],
    pub homographes: Option<&'a Homographes>,
}

/// Compare une proposition aux recettes. `decouverts` contient les mots déjà
/// au codex du joueur : un « presque » ne renvoie jamais vers eux.
///
/// Ordre (ADR 0003, 0052) : recette exacte, exclusion, trompe-l'œil, « presque »
/// d'ordre, mauvais homographe, échec neutre.
#[must_use]
pub fn resoudre<S: BuildHasher>(
    proposition: &[IdCatalogue],
    recettes: &[RecetteJeu],
    exclusions: &[ExclusionJeu],
    explications: Explications<'_>,
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
    if let Some(piege) = explications
        .trompes_l_oeil
        .iter()
        .find(|t| t.combinaison == proposition)
    {
        return Issue::TrompeLOeil {
            id: piege.id.clone(),
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
    if let Some(rang) =
        mauvais_homographe(proposition, recettes, explications.homographes, decouverts)
    {
        return Issue::Homographe { rang };
    }
    Issue::Echec
}

/// Rang de la brique qu'il suffirait de remplacer par un homographe pour obtenir
/// la recette exacte d'un mot encore à découvrir. Un seul remplacement : le jeu
/// ne dit « autre brique » que s'il peut le justifier.
fn mauvais_homographe<S: BuildHasher>(
    proposition: &[IdCatalogue],
    recettes: &[RecetteJeu],
    homographes: Option<&Homographes>,
    decouverts: &HashSet<IdCatalogue, S>,
) -> Option<u8> {
    let homographes = homographes?;
    let mut essai = proposition.to_vec();
    for (rang, brique) in proposition.iter().enumerate() {
        for autre in homographes.get(brique).into_iter().flatten() {
            essai[rang] = autre.clone();
            let trouvee = recettes
                .iter()
                .any(|r| !decouverts.contains(&r.mot_id) && exacte(&essai, r));
            if trouvee {
                return u8::try_from(rang).ok();
            }
        }
        essai[rang] = brique.clone();
    }
    None
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
            resoudre(
                &proposition,
                &recettes(),
                &[],
                Explications::default(),
                &HashSet::new()
            ),
            Issue::Decouverte {
                recette_id: attendu.0.clone(),
                mot_id: attendu.1.clone()
            }
        );
        let connus = HashSet::from([id("unt_0000000g")]);
        assert_eq!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                Explications::default(),
                &connus
            ),
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
            resoudre(
                &proposition,
                &recettes(),
                &[],
                Explications::default(),
                &HashSet::new()
            ),
            Issue::Presque {
                motif: MotifPresque::Ordre
            }
        );
    }

    #[test]
    fn presque_quand_il_manque_une_brique() {
        let proposition = briques(&["brq_00000s7e", "brq_0000b100"]);
        assert_eq!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                Explications::default(),
                &HashSet::new()
            ),
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
            resoudre(
                &proposition,
                &recettes(),
                &[],
                Explications::default(),
                &connus
            ),
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
            resoudre(
                &proposition,
                &recettes(),
                &exclusions,
                Explications::default(),
                &HashSet::new()
            ),
            Issue::Exclue {
                raison: "rare".into()
            }
        );
    }

    #[test]
    fn echec_sans_correspondance() {
        let proposition = briques(&["brq_0000ge00", "brq_0000b100"]);
        assert_eq!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                Explications::default(),
                &HashSet::new()
            ),
            Issue::Echec
        );
    }

    #[test]
    fn une_brique_ne_couvre_qu_un_emplacement() {
        let proposition = briques(&["brq_000109e0", "brq_000109e0"]);
        assert_eq!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                Explications::default(),
                &HashSet::new()
            ),
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

    fn homographes() -> Homographes {
        HashMap::from([(id("brq_0000ge99"), vec![id("brq_0000ge00")])])
    }

    fn avec_homographes(h: &Homographes) -> Explications<'_> {
        Explications {
            trompes_l_oeil: &[],
            homographes: Some(h),
        }
    }

    #[test]
    fn mauvais_homographe_quand_une_autre_brique_de_meme_forme_donnerait_la_recette() {
        let h = homographes();
        let proposition = briques(&["brq_0000ge99", "brq_000109e0"]);
        assert_eq!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                avec_homographes(&h),
                &HashSet::new()
            ),
            Issue::Homographe { rang: 0 }
        );
    }

    #[test]
    fn pas_de_homographe_sans_recette_au_bout() {
        let h = homographes();
        let proposition = briques(&["brq_0000ge99", "brq_0000b100"]);
        assert_eq!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                avec_homographes(&h),
                &HashSet::new()
            ),
            Issue::Echec
        );
    }

    #[test]
    fn pas_de_homographe_vers_un_mot_deja_decouvert() {
        let h = homographes();
        let proposition = briques(&["brq_0000ge99", "brq_000109e0"]);
        let connus = HashSet::from([id("unt_0000000g")]);
        assert_eq!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                avec_homographes(&h),
                &connus
            ),
            Issue::Echec
        );
    }

    #[test]
    fn la_recette_exacte_l_emporte_sur_un_homographe() {
        let h = homographes();
        let proposition = briques(&["brq_0000ge00", "brq_000109e0"]);
        assert!(matches!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                avec_homographes(&h),
                &HashSet::new()
            ),
            Issue::Decouverte { .. }
        ));
    }

    #[test]
    fn un_trompe_l_oeil_ne_vise_que_sa_paire_ordonnee() {
        let pieges = [TrompeLOeilJeu {
            id: id("tpl_0000000a"),
            combinaison: briques(&["brq_0000ge99", "brq_000109e0"]),
        }];
        let explications = Explications {
            trompes_l_oeil: &pieges,
            homographes: None,
        };
        let piege = briques(&["brq_0000ge99", "brq_000109e0"]);
        assert_eq!(
            resoudre(&piege, &recettes(), &[], explications, &HashSet::new()),
            Issue::TrompeLOeil {
                id: id("tpl_0000000a")
            }
        );
        // Le même mot avec l'autre brique reste une découverte normale.
        let bonne = briques(&["brq_0000ge00", "brq_000109e0"]);
        assert!(matches!(
            resoudre(&bonne, &recettes(), &[], explications, &HashSet::new()),
            Issue::Decouverte { .. }
        ));
    }

    #[test]
    fn un_trompe_l_oeil_passe_avant_le_homographe_et_apres_l_exclusion() {
        let h = homographes();
        let pieges = [TrompeLOeilJeu {
            id: id("tpl_0000000a"),
            combinaison: briques(&["brq_0000ge99", "brq_000109e0"]),
        }];
        let explications = Explications {
            trompes_l_oeil: &pieges,
            homographes: Some(&h),
        };
        let proposition = briques(&["brq_0000ge99", "brq_000109e0"]);
        assert!(matches!(
            resoudre(
                &proposition,
                &recettes(),
                &[],
                explications,
                &HashSet::new()
            ),
            Issue::TrompeLOeil { .. }
        ));
        let exclusions = vec![ExclusionJeu {
            combinaison: proposition.clone(),
            raison: "rare".into(),
        }];
        assert!(matches!(
            resoudre(
                &proposition,
                &recettes(),
                &exclusions,
                explications,
                &HashSet::new()
            ),
            Issue::Exclue { .. }
        ));
    }
}
