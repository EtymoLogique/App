//! Indices (ADR 0038) : cinq niveaux par recette, achetés dans l'ordre, le
//! prix doublant à chaque niveau.

/// Prix de chaque niveau, en gouttes.
// ponytail: constante ; à déplacer dans l'équilibrage du manifeste si le barème bouge souvent.
pub const PRIX_INDICE: [u32; 5] = [5, 10, 20, 40, 80];

/// Prix d'un niveau (1 à 5), ou `None` hors barème.
#[must_use]
pub fn prix(niveau: u8) -> Option<u32> {
    PRIX_INDICE
        .get(usize::from(niveau).checked_sub(1)?)
        .copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bareme() {
        assert_eq!(prix(1), Some(5));
        assert_eq!(prix(5), Some(80));
        assert_eq!(prix(0), None);
        assert_eq!(prix(6), None);
        assert_eq!(PRIX_INDICE.iter().sum::<u32>(), 155);
    }
}
