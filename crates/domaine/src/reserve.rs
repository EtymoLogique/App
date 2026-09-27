//! Réserve du joueur (ADR 0012) : exemplaires par brique, plafonnés.

/// Exemplaires qu'une brique peut compter au plus.
pub const PLAFOND: u8 = 5;

/// Exemplaires réellement ajoutés quand on en offre `offerts` à une brique qui
/// en compte `actuels` : rien au-delà du plafond (ADR 0030 pour les graines).
#[must_use]
pub fn ajout_plafonne(actuels: u8, offerts: u8) -> u8 {
    offerts.min(PLAFOND.saturating_sub(actuels))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plafonne_a_cinq() {
        assert_eq!(ajout_plafonne(0, 2), 2);
        assert_eq!(ajout_plafonne(4, 2), 1);
        assert_eq!(ajout_plafonne(5, 2), 0);
        assert_eq!(ajout_plafonne(7, 1), 0);
    }
}
