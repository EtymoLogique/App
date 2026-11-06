//! Ricochets (ADR 0044, 0065) : niveau d'une carte trouvée, de 0 à 3, et maîtrise.
//!
//! Une réponse n'agit que si la carte est à revoir : jouer plus ne fait pas
//! monter plus vite. Trois bonnes réponses données au niveau 3, sur trois
//! jours différents (chaque réponse repousse l'échéance), maîtrisent la carte.
//! Une erreur la fait descendre d'un niveau, maîtrisée ou non : elle perd sa
//! maîtrise et doit la regagner en entier (ADR 0065).

use chrono::{Days, NaiveDate};

/// Niveau le plus haut avant la maîtrise.
pub const NIVEAU_MAX: u8 = 3;
/// Bonnes réponses données au niveau 3 qui maîtrisent la carte.
pub const BONNES_POUR_MAITRISE: u8 = 3;
/// Jours avant la révision d'une bonne réponse, selon le niveau de départ (0, 1, 2).
const INTERVALLES: [u64; 3] = [1, 3, 7];
/// Jours avant la révision d'une carte au niveau 3 ou maîtrisée.
const INTERVALLE_FINAL: u64 = 7;

/// L'état de révision d'une carte (brique ou mot) pour un joueur.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Carte {
    pub niveau: u8,
    pub bonnes_niveau_3: u8,
    pub prochaine_revision: NaiveDate,
    pub maitrisee: bool,
}

impl Carte {
    /// Carte sans historique : niveau 0, à revoir aujourd'hui.
    #[must_use]
    pub fn neuve(aujourd_hui: NaiveDate) -> Self {
        Self {
            niveau: 0,
            bonnes_niveau_3: 0,
            prochaine_revision: aujourd_hui,
            maitrisee: false,
        }
    }

    #[must_use]
    pub fn a_revoir(&self, aujourd_hui: NaiveDate) -> bool {
        aujourd_hui >= self.prochaine_revision
    }
}

fn dans(jour: NaiveDate, jours: u64) -> NaiveDate {
    jour.checked_add_days(Days::new(jours)).unwrap_or(jour)
}

/// Applique une réponse. Carte pas à revoir : inchangée.
#[must_use]
pub fn repondre(carte: Carte, juste: bool, aujourd_hui: NaiveDate) -> Carte {
    if !carte.a_revoir(aujourd_hui) {
        return carte;
    }
    let demain = dans(aujourd_hui, 1);
    if !juste {
        return Carte {
            niveau: carte.niveau.saturating_sub(1),
            bonnes_niveau_3: 0,
            prochaine_revision: demain,
            maitrisee: false,
        };
    }
    if carte.niveau < NIVEAU_MAX {
        let intervalle = INTERVALLES[usize::from(carte.niveau)];
        return Carte {
            niveau: carte.niveau + 1,
            bonnes_niveau_3: 0,
            prochaine_revision: dans(aujourd_hui, intervalle),
            maitrisee: false,
        };
    }
    let bonnes = if carte.maitrisee {
        carte.bonnes_niveau_3
    } else {
        (carte.bonnes_niveau_3 + 1).min(BONNES_POUR_MAITRISE)
    };
    Carte {
        niveau: NIVEAU_MAX,
        bonnes_niveau_3: bonnes,
        prochaine_revision: dans(aujourd_hui, INTERVALLE_FINAL),
        maitrisee: bonnes >= BONNES_POUR_MAITRISE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jour(n: u64) -> NaiveDate {
        dans(NaiveDate::from_ymd_opt(2026, 10, 1).unwrap(), n)
    }

    #[test]
    fn carte_neuve_juste_chaque_fois_maitrisee_au_jour_25() {
        let mut carte = Carte::neuve(jour(0));
        // (jour de la réponse, niveau, bonnes au niveau 3, maîtrisée) après la réponse.
        let attendu = [
            (0, 1, 0, false),
            (1, 2, 0, false),
            (4, 3, 0, false),
            (11, 3, 1, false),
            (18, 3, 2, false),
            (25, 3, 3, true),
        ];
        for (n, niveau, bonnes, maitrisee) in attendu {
            assert!(carte.a_revoir(jour(n)), "jour {n}");
            carte = repondre(carte, true, jour(n));
            assert_eq!(
                (carte.niveau, carte.bonnes_niveau_3, carte.maitrisee),
                (niveau, bonnes, maitrisee),
                "jour {n}"
            );
        }
        assert_eq!(carte.prochaine_revision, jour(32));
    }

    #[test]
    fn carte_pas_a_revoir_inchangee() {
        let carte = repondre(Carte::neuve(jour(0)), true, jour(0));
        assert_eq!(repondre(carte, true, jour(0)), carte);
        assert_eq!(repondre(carte, false, jour(0)), carte);
    }

    #[test]
    fn erreur_baisse_d_un_niveau_sans_passer_sous_zero() {
        let neuve = Carte::neuve(jour(0));
        let rate = repondre(neuve, false, jour(0));
        assert_eq!((rate.niveau, rate.prochaine_revision), (0, jour(1)));
        let niveau2 = Carte { niveau: 2, ..neuve };
        let rate = repondre(niveau2, false, jour(0));
        assert_eq!((rate.niveau, rate.prochaine_revision), (1, jour(1)));
    }

    #[test]
    fn erreur_au_niveau_3_remet_le_compte_a_zero() {
        let carte = Carte {
            niveau: 3,
            bonnes_niveau_3: 2,
            ..Carte::neuve(jour(0))
        };
        let rate = repondre(carte, false, jour(0));
        assert_eq!((rate.niveau, rate.bonnes_niveau_3), (2, 0));
    }

    #[test]
    fn carte_maitrisee_garde_sa_maitrise_sur_une_bonne_reponse() {
        let carte = Carte {
            niveau: 3,
            bonnes_niveau_3: 3,
            maitrisee: true,
            ..Carte::neuve(jour(0))
        };
        let juste = repondre(carte, true, jour(0));
        assert!(juste.maitrisee);
        assert_eq!(juste.prochaine_revision, jour(7));
    }

    #[test]
    fn erreur_sur_une_carte_maitrisee_la_fait_descendre_au_niveau_2() {
        let carte = Carte {
            niveau: 3,
            bonnes_niveau_3: 3,
            maitrisee: true,
            ..Carte::neuve(jour(0))
        };
        let rate = repondre(carte, false, jour(0));
        assert_eq!(
            (rate.niveau, rate.bonnes_niveau_3, rate.maitrisee),
            (2, 0, false)
        );
        assert_eq!(rate.prochaine_revision, jour(1));
    }

    #[test]
    fn maitrise_regagnee_en_entier_apres_une_perte() {
        let maitrisee = Carte {
            niveau: 3,
            bonnes_niveau_3: 3,
            maitrisee: true,
            ..Carte::neuve(jour(0))
        };
        let mut carte = repondre(maitrisee, false, jour(0));
        // Retour au niveau 3, puis trois bonnes réponses : (jour, niveau, bonnes, maîtrisée).
        let attendu = [
            (1, 3, 0, false),
            (8, 3, 1, false),
            (15, 3, 2, false),
            (22, 3, 3, true),
        ];
        for (n, niveau, bonnes, maitrisee) in attendu {
            carte = repondre(carte, true, jour(n));
            assert_eq!(
                (carte.niveau, carte.bonnes_niveau_3, carte.maitrisee),
                (niveau, bonnes, maitrisee),
                "jour {n}"
            );
        }
    }
}
