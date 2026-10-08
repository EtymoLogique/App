//! Énergie (ADR 0020) : 2 charges au plus, une toutes les 12 h en production,
//! à l'horloge du
//! serveur. Quand les deux charges sont prêtes, le temps s'arrête ; ouvrir un
//! pli relance la recharge si l'énergie était pleine, sinon la recharge en
//! cours continue. Rien n'est stocké entre deux lectures : l'état se rattrape
//! à partir de `prochaine_charge`.

use chrono::{DateTime, TimeDelta, Utc};

/// Charges au plus : deux plis peuvent attendre le joueur.
pub const CAPACITE: u8 = 2;

/// Durée d'une recharge par défaut ; l'API la règle par `ETYMO_RECHARGE_S`.
pub const RECHARGE: TimeDelta = TimeDelta::hours(12);

/// Charges et instant de la prochaine, nul si l'énergie est pleine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Energie {
    pub charges: u8,
    pub prochaine_charge: Option<DateTime<Utc>>,
}

impl Energie {
    /// Énergie d'un nouveau joueur : pleine.
    #[must_use]
    pub fn pleine() -> Self {
        Self {
            charges: CAPACITE,
            prochaine_charge: None,
        }
    }

    /// Rattrape les charges revenues jusqu'à `maintenant`.
    #[must_use]
    pub fn a(self, maintenant: DateTime<Utc>, recharge: TimeDelta) -> Self {
        let mut energie = self;
        while energie.charges < CAPACITE {
            match energie.prochaine_charge {
                Some(prochaine) if prochaine <= maintenant => {
                    energie.charges += 1;
                    energie.prochaine_charge =
                        (energie.charges < CAPACITE).then(|| prochaine + recharge);
                }
                // Une énergie incomplète sans échéance est incohérente : on relance la recharge.
                None => energie.prochaine_charge = Some(maintenant + recharge),
                Some(_) => break,
            }
        }
        if energie.charges >= CAPACITE {
            energie.charges = CAPACITE;
            energie.prochaine_charge = None;
        }
        energie
    }

    /// Consomme une charge pour ouvrir un pli, ou `None` s'il n'y en a pas.
    #[must_use]
    pub fn consommer(self, maintenant: DateTime<Utc>, recharge: TimeDelta) -> Option<Self> {
        let energie = self.a(maintenant, recharge);
        if energie.charges == 0 {
            return None;
        }
        Some(Self {
            charges: energie.charges - 1,
            prochaine_charge: Some(energie.prochaine_charge.unwrap_or(maintenant + recharge)),
        })
    }

    /// Avance la recharge de `sabliers` sablier(s), ou `None` si l'énergie est
    /// pleine (ADR 0020). Le temps qui dépasse la charge en cours passe à la
    /// suivante ; il n'est perdu que si l'énergie atteint 2.
    #[must_use]
    pub fn avancer(
        self,
        maintenant: DateTime<Utc>,
        recharge: TimeDelta,
        sabliers: u32,
    ) -> Option<Self> {
        let energie = self.a(maintenant, recharge);
        let prochaine = energie
            .prochaine_charge
            .filter(|_| energie.charges < CAPACITE)?;
        let avance = crate::sablier::duree(recharge) * i32::try_from(sabliers).ok()?;
        Some(
            Self {
                charges: energie.charges,
                prochaine_charge: Some(prochaine - avance),
            }
            .a(maintenant, recharge),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(heures: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(0, 0).unwrap() + TimeDelta::hours(heures)
    }

    #[test]
    fn ouvrir_depuis_le_plein_relance_la_recharge() {
        let e = Energie::pleine().consommer(t(0), RECHARGE).unwrap();
        assert_eq!(
            e,
            Energie {
                charges: 1,
                prochaine_charge: Some(t(12))
            }
        );
    }

    #[test]
    fn la_recharge_en_cours_continue() {
        let e = Energie::pleine().consommer(t(0), RECHARGE).unwrap();
        let e = e.consommer(t(3), RECHARGE).unwrap();
        assert_eq!(
            e,
            Energie {
                charges: 0,
                prochaine_charge: Some(t(12))
            }
        );
        assert!(e.consommer(t(11), RECHARGE).is_none());
    }

    #[test]
    fn le_temps_s_arrete_a_deux_charges() {
        let e = Energie {
            charges: 0,
            prochaine_charge: Some(t(12)),
        };
        assert_eq!(
            e.a(t(12), RECHARGE),
            Energie {
                charges: 1,
                prochaine_charge: Some(t(24))
            }
        );
        assert_eq!(e.a(t(100), RECHARGE), Energie::pleine());
    }

    #[test]
    fn le_sablier_reporte_le_temps_sur_la_charge_suivante() {
        let e = Energie {
            charges: 0,
            prochaine_charge: Some(t(2)),
        };
        assert_eq!(
            e.avancer(t(0), RECHARGE, 3),
            Some(Energie {
                charges: 1,
                prochaine_charge: Some(t(11))
            })
        );
    }

    #[test]
    fn le_sablier_perd_le_temps_a_deux_charges() {
        let e = Energie {
            charges: 1,
            prochaine_charge: Some(t(2)),
        };
        assert_eq!(e.avancer(t(0), RECHARGE, 5), Some(Energie::pleine()));
        assert_eq!(Energie::pleine().avancer(t(0), RECHARGE, 1), None);
    }
}
