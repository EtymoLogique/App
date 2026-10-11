//! Carte de lecteur (ADR 0045) : un tampon par jour où les quêtes du jour sont
//! faites, sans série ni expiration. Sept tampons remplissent une carte, dont
//! la récompense attend que le joueur la récupère.

/// Tampons d'une carte pleine.
pub const TAILLE: u32 = 7;
/// Récompense d'une carte pleine : valeurs de départ de l'ADR 0045, à simuler.
pub const GOUTTES: u32 = 20;
pub const SABLIERS: u32 = 1;
pub const PLIS_DE_LECTEUR: u32 = 1;

/// Ce que montre la carte, d'après le nombre de tampons gagnés et de cartes récupérées.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Vue {
    /// Cartes pleines, récupérées ou non.
    pub remplies: u32,
    /// Cartes pleines dont la récompense attend.
    pub a_recuperer: u32,
    /// Tampons affichés, comme bornes `[debut, fin)` dans la liste des tampons
    /// du plus ancien au plus récent : la plus ancienne carte pleine à récupérer,
    /// sinon la carte en cours.
    pub debut: usize,
    pub fin: usize,
}

#[must_use]
pub fn vue(tampons: u32, recuperees: u32) -> Vue {
    let remplies = tampons / TAILLE;
    let recuperees = recuperees.min(remplies);
    let a_recuperer = remplies - recuperees;
    let (debut, fin) = if a_recuperer > 0 {
        (recuperees * TAILLE, (recuperees + 1) * TAILLE)
    } else {
        (remplies * TAILLE, tampons)
    };
    Vue {
        remplies,
        a_recuperer,
        debut: debut as usize,
        fin: fin as usize,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_carte_se_remplit_puis_attend_sa_recuperation() {
        assert_eq!(
            vue(0, 0),
            Vue {
                remplies: 0,
                a_recuperer: 0,
                debut: 0,
                fin: 0
            }
        );
        assert_eq!(
            vue(4, 0),
            Vue {
                remplies: 0,
                a_recuperer: 0,
                debut: 0,
                fin: 4
            }
        );
        // Septième tampon : la carte pleine reste affichée jusqu'à la récupération.
        assert_eq!(
            vue(7, 0),
            Vue {
                remplies: 1,
                a_recuperer: 1,
                debut: 0,
                fin: 7
            }
        );
        // Les tampons suivants comptent pour la carte d'après.
        assert_eq!(
            vue(9, 0),
            Vue {
                remplies: 1,
                a_recuperer: 1,
                debut: 0,
                fin: 7
            }
        );
        assert_eq!(
            vue(9, 1),
            Vue {
                remplies: 1,
                a_recuperer: 0,
                debut: 7,
                fin: 9
            }
        );
        assert_eq!(
            vue(14, 1),
            Vue {
                remplies: 2,
                a_recuperer: 1,
                debut: 7,
                fin: 14
            }
        );
        assert_eq!(vue(14, 2).a_recuperer, 0);
        // Jamais plus de cartes récupérées que de cartes pleines.
        assert_eq!(vue(3, 5).a_recuperer, 0);
    }
}
