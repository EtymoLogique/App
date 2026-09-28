//! Sabliers (ADR 0018, 0020) : chacun avance la recharge d'un douzième de sa
//! durée, soit une heure en production. Ils se prennent d'abord parmi ceux
//! détenus, puis contre de l'encre.

use chrono::TimeDelta;

/// Sabliers dans une recharge : une heure chacun pour une recharge de 12 h.
pub const PAR_RECHARGE: i32 = 12;
/// Sabliers utilisables par fenêtre glissante de deux recharges (24 h).
pub const PLAFOND_JOUR: u32 = 12;
/// Sabliers détenus au plus.
pub const PLAFOND_DETENUS: u32 = 36;
/// Prix d'un sablier en encre : une goutte, une heure.
pub const GOUTTES_PAR_SABLIER: u32 = 1;

/// Avance d'un sablier : une heure pour une recharge de 12 h.
#[must_use]
pub fn duree(recharge: TimeDelta) -> TimeDelta {
    recharge / PAR_RECHARGE
}

/// Fenêtre du plafond quotidien : 24 h pour une recharge de 12 h.
#[must_use]
pub fn fenetre(recharge: TimeDelta) -> TimeDelta {
    recharge * 2
}

/// Répartit `nombre` sabliers entre ceux détenus et ceux payés en encre, ou
/// `None` si le plafond quotidien ou l'encre ne le permettent pas.
#[must_use]
pub fn repartir(nombre: u32, detenus: u32, encre: u32, utilises: u32) -> Option<(u32, u32)> {
    if nombre == 0 || utilises.saturating_add(nombre) > PLAFOND_JOUR {
        return None;
    }
    let depuis_detenus = nombre.min(detenus);
    let depuis_encre = nombre - depuis_detenus;
    (depuis_encre * GOUTTES_PAR_SABLIER <= encre).then_some((depuis_detenus, depuis_encre))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detenus_d_abord_puis_encre() {
        assert_eq!(repartir(5, 3, 10, 0), Some((3, 2)));
        assert_eq!(repartir(2, 3, 0, 0), Some((2, 0)));
        assert_eq!(repartir(5, 3, 1, 0), None);
    }

    #[test]
    fn plafond_quotidien() {
        assert_eq!(repartir(2, 0, 10, 10), Some((0, 2)));
        assert_eq!(repartir(3, 0, 10, 10), None);
        assert_eq!(repartir(0, 5, 5, 0), None);
    }

    #[test]
    fn une_heure_en_production() {
        assert_eq!(duree(crate::energie::RECHARGE), TimeDelta::hours(1));
    }
}
