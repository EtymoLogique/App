//! Déblocage progressif des fascicules (ADR 0068) : le premier fascicule paru
//! est ouvert d'emblée ; atteindre le 2ᵉ jalon d'un fascicule débloqué ouvre
//! le fascicule paru suivant. Un fascicule débloqué ne se reverrouille jamais.

use std::collections::HashSet;
use std::hash::BuildHasher;

use crate::IdCatalogue;

/// Rang, dans la liste des jalons d'un fascicule, du jalon qui ouvre le suivant.
pub const RANG_JALON: usize = 1;

/// Un fascicule paru, dans l'ordre des numéros, et le jalon qui ouvre le suivant.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Maillon {
    pub fascicule_id: IdCatalogue,
    pub jalon: Option<IdCatalogue>,
}

/// Fascicules à débloquer, dans l'ordre : le premier paru s'il ne l'est pas
/// encore, puis chaque fascicule dont le prédécesseur est débloqué et a son
/// jalon atteint. Un seul passage suffit : la chaîne se lit dans l'ordre.
#[must_use]
pub fn a_debloquer<S1: BuildHasher, S2: BuildHasher>(
    chaine: &[Maillon],
    debloques: &HashSet<IdCatalogue, S1>,
    atteints: &HashSet<IdCatalogue, S2>,
) -> Vec<IdCatalogue> {
    let mut nouveaux = Vec::new();
    let mut precedent: Option<(&Maillon, bool)> = None;
    for maillon in chaine {
        let deja = debloques.contains(&maillon.fascicule_id);
        let ouvert = deja
            || match precedent {
                None => true,
                Some((p, ouvert)) => {
                    ouvert && p.jalon.as_ref().is_some_and(|j| atteints.contains(j))
                }
            };
        if ouvert && !deja {
            nouveaux.push(maillon.fascicule_id.clone());
        }
        precedent = Some((maillon, ouvert));
    }
    nouveaux
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(texte: &str) -> IdCatalogue {
        texte.parse().unwrap()
    }

    fn chaine() -> Vec<Maillon> {
        (1..=3)
            .map(|n| Maillon {
                fascicule_id: id(&format!("fsc_0000000{n}")),
                jalon: Some(id(&format!("jal_0000000{n}"))),
            })
            .collect()
    }

    #[test]
    fn un_nouveau_profil_n_a_que_le_premier() {
        let rien = HashSet::new();
        assert_eq!(
            a_debloquer(&chaine(), &rien, &rien),
            vec![id("fsc_00000001")]
        );
    }

    #[test]
    fn le_deuxieme_jalon_ouvre_le_suivant_et_s_enchaine() {
        let debloques = HashSet::from([id("fsc_00000001")]);
        let atteints = HashSet::from([id("jal_00000001"), id("jal_00000002")]);
        assert_eq!(
            a_debloquer(&chaine(), &debloques, &atteints),
            vec![id("fsc_00000002"), id("fsc_00000003")]
        );
    }

    #[test]
    fn un_jalon_d_un_fascicule_verrouille_n_ouvre_rien() {
        let debloques = HashSet::from([id("fsc_00000001")]);
        let atteints = HashSet::from([id("jal_00000002")]);
        assert!(a_debloquer(&chaine(), &debloques, &atteints).is_empty());
    }

    #[test]
    fn un_fascicule_debloque_le_reste_et_ouvre_la_suite() {
        // Un fascicule intermédiaire paru après coup ne reverrouille rien.
        let debloques = HashSet::from([id("fsc_00000001"), id("fsc_00000003")]);
        assert!(a_debloquer(&chaine(), &debloques, &HashSet::new()).is_empty());
        let mut suite = chaine();
        suite.push(Maillon {
            fascicule_id: id("fsc_00000004"),
            jalon: None,
        });
        let atteints = HashSet::from([id("jal_00000003")]);
        assert_eq!(
            a_debloquer(&suite, &debloques, &atteints),
            vec![id("fsc_00000004")]
        );
    }

    #[test]
    fn sans_deuxieme_jalon_rien_ne_s_ouvre() {
        let mut chaine = chaine();
        chaine[0].jalon = None;
        let debloques = HashSet::from([id("fsc_00000001")]);
        assert!(a_debloquer(&chaine, &debloques, &HashSet::new()).is_empty());
    }
}
