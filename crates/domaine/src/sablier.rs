//! Sabliers (ADR 0018, 0020, 0039) : chacun avance la recharge d'un douzième
//! de sa durée, soit une heure en production. Seuls les sabliers détenus
//! s'utilisent ; l'encre en achète, sans plafond.

use chrono::TimeDelta;

/// Sabliers dans une recharge : une heure chacun pour une recharge de 12 h.
pub const PAR_RECHARGE: i32 = 12;
/// Sabliers utiles au plus dans une commande : ceux qui remplissent une
/// énergie vide. Au-delà, le temps serait perdu.
pub const UTILES_MAX: u32 = PAR_RECHARGE.unsigned_abs() * crate::energie::CAPACITE as u32;
/// Prix d'un sablier en encre (ADR 0039).
pub const GOUTTES_PAR_SABLIER: u32 = 10;
/// Sabliers échangés au plus dans une commande : une borne de la requête, pas
/// un plafond de jeu (l'échange n'en a pas, ADR 0039).
pub const ECHANGE_MAX: u32 = 1000;

/// Avance d'un sablier : une heure pour une recharge de 12 h.
#[must_use]
pub fn duree(recharge: TimeDelta) -> TimeDelta {
    recharge / PAR_RECHARGE
}

/// Prix en gouttes de `nombre` sabliers, ou `None` si l'encre ne suffit pas.
#[must_use]
pub fn prix_achat(nombre: u32, encre: u32) -> Option<u32> {
    let prix = nombre.checked_mul(GOUTTES_PAR_SABLIER)?;
    (nombre > 0 && prix <= encre).then_some(prix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dix_gouttes_le_sablier_sans_plafond() {
        assert_eq!(prix_achat(3, 30), Some(30));
        assert_eq!(prix_achat(3, 29), None);
        assert_eq!(prix_achat(50, 500), Some(500));
        assert_eq!(prix_achat(0, 100), None);
    }

    #[test]
    fn une_heure_en_production() {
        assert_eq!(duree(crate::energie::RECHARGE), TimeDelta::hours(1));
    }
}
