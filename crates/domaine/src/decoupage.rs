//! Découper en chaîne (ADR 0084) : l'arbre des coupes justes d'un mot et le
//! jugement d'un ensemble de coupes posées.
//!
//! Un nœud est un morceau du mot (`[debut, fin)`) avec les positions où sa
//! composition préférée le coupe, et un sous-nœud pour chaque partie qui est
//! elle-même un mot composé. Des positions seulement : aucun texte.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

/// Un morceau du mot et ses coupes justes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Noeud {
    pub debut: u32,
    /// Fin exclue.
    pub fin: u32,
    /// Positions des coupes de ce morceau, dans le mot entier.
    pub coupes: Vec<u32>,
    /// Sous-nœuds : les parties qui se coupent à leur tour.
    #[serde(default)]
    #[schema(no_recursion)]
    pub parties: Vec<Noeud>,
}

impl Noeud {
    /// Arbre d'un seul niveau, pour un mot publié avec ses seules `coupes`
    /// (manifeste antérieur à l'ADR 0084). Sa fin n'est pas connue.
    #[must_use]
    pub fn plat(coupes: &[u32]) -> Self {
        let mut coupes = coupes.to_vec();
        coupes.sort_unstable();
        coupes.dedup();
        Self {
            debut: 0,
            fin: u32::MAX,
            coupes,
            parties: Vec::new(),
        }
    }

    fn rassembler<'a>(&'a self, noeuds: &mut Vec<&'a Noeud>) {
        noeuds.push(self);
        for partie in &self.parties {
            partie.rassembler(noeuds);
        }
    }
}

/// Ce que valent les coupes posées.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Une coupe n'est pas juste : la question s'arrête, fausse.
    Faux,
    /// Toutes les coupes posées sont justes, il en reste à poser.
    Continue,
    /// Toutes les coupes possibles sont posées : la question s'arrête, réussie.
    Termine,
}

/// Juge l'ensemble des coupes posées jusqu'ici, quel que soit leur ordre.
///
/// Une coupe est juste si un nœud la porte et si les deux bords de ce nœud sont
/// des bords du mot ou des coupes déjà posées : *étymo · logiste* n'est pas juste
/// avant *étymologie · iste*. La validité ne fait que croître avec les coupes
/// posées, donc l'ordre n'importe pas.
#[must_use]
pub fn juger(racine: &Noeud, posees: &[u32]) -> Verdict {
    let mut noeuds = Vec::new();
    racine.rassembler(&mut noeuds);
    let attendues: BTreeSet<u32> = noeuds
        .iter()
        .flat_map(|n| n.coupes.iter().copied())
        .collect();
    let mut restantes: BTreeSet<u32> = posees.iter().copied().collect();
    let mut placees: BTreeSet<u32> = BTreeSet::new();
    loop {
        let juste = restantes.iter().copied().find(|c| {
            noeuds.iter().any(|n| {
                n.coupes.contains(c)
                    && [n.debut, n.fin]
                        .iter()
                        .all(|b| *b == racine.debut || *b == racine.fin || placees.contains(b))
            })
        });
        match juste {
            Some(c) => {
                restantes.remove(&c);
                placees.insert(c);
            }
            None => break,
        }
    }
    if !restantes.is_empty() {
        Verdict::Faux
    } else if placees == attendues {
        Verdict::Termine
    } else {
        Verdict::Continue
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feuille(debut: u32, fin: u32, coupes: &[u32]) -> Noeud {
        Noeud {
            debut,
            fin,
            coupes: coupes.to_vec(),
            parties: Vec::new(),
        }
    }

    /// *étymologiste* : *étymologie · iste*, puis *étymo · logie*.
    fn etymologiste() -> Noeud {
        Noeud {
            debut: 0,
            fin: 13,
            coupes: vec![10],
            parties: vec![feuille(0, 10, &[5])],
        }
    }

    #[test]
    fn un_mot_a_un_niveau() {
        let geologie = feuille(0, 8, &[3]);
        assert_eq!(juger(&geologie, &[]), Verdict::Continue);
        assert_eq!(juger(&geologie, &[3]), Verdict::Termine);
        assert_eq!(juger(&geologie, &[3, 3]), Verdict::Termine);
        assert_eq!(juger(&geologie, &[2]), Verdict::Faux);
        assert_eq!(juger(&geologie, &[3, 5]), Verdict::Faux);
    }

    #[test]
    fn la_chaine_se_coupe_niveau_par_niveau() {
        let mot = etymologiste();
        assert_eq!(juger(&mot, &[10]), Verdict::Continue);
        assert_eq!(juger(&mot, &[10, 5]), Verdict::Termine);
    }

    #[test]
    fn le_sous_niveau_attend_son_morceau() {
        let mot = etymologiste();
        // étymo · logiste n'existe pas : le morceau « étymologie » n'est pas encore coupé du reste.
        assert_eq!(juger(&mot, &[5]), Verdict::Faux);
        assert_eq!(
            juger(&mot, &[5, 10]),
            Verdict::Termine,
            "l'ordre n'importe pas dans l'ensemble posé"
        );
    }

    #[test]
    fn une_coupe_fausse_apres_une_juste_est_fausse() {
        assert_eq!(juger(&etymologiste(), &[10, 7]), Verdict::Faux);
        assert_eq!(juger(&etymologiste(), &[10, 5, 7]), Verdict::Faux);
        assert_eq!(juger(&etymologiste(), &[0]), Verdict::Faux);
        assert_eq!(juger(&etymologiste(), &[99]), Verdict::Faux);
    }

    #[test]
    fn trois_parties_se_coupent_dans_un_ordre_libre() {
        let mot = feuille(0, 12, &[3, 8]);
        assert_eq!(juger(&mot, &[8]), Verdict::Continue);
        assert_eq!(juger(&mot, &[3]), Verdict::Continue);
        assert_eq!(juger(&mot, &[8, 3]), Verdict::Termine);
    }

    #[test]
    fn partie_finale_en_chaine() {
        // préfixe · (mot composé de deux parties) : le sous-nœud est décalé.
        let mot = Noeud {
            debut: 0,
            fin: 10,
            coupes: vec![4],
            parties: vec![feuille(4, 10, &[7])],
        };
        assert_eq!(juger(&mot, &[7]), Verdict::Faux);
        assert_eq!(juger(&mot, &[4]), Verdict::Continue);
        assert_eq!(juger(&mot, &[4, 7]), Verdict::Termine);
    }

    #[test]
    fn mot_publie_a_plat() {
        let mot = Noeud::plat(&[5, 3, 5]);
        assert_eq!(juger(&mot, &[3, 5]), Verdict::Termine);
        assert_eq!(juger(&mot, &[3]), Verdict::Continue);
        assert_eq!(juger(&mot, &[4]), Verdict::Faux);
    }
}
