//! Indices à la carte (ADR 0051) : trois indices par recette, achetés dans
//! l'ordre voulu, une fois chacun. Le « niveau » identifie l'indice : 1 la
//! silhouette, 2 le sens littéral, 3 la définition.

/// Prix de chaque indice, en gouttes.
// ponytail: constante ; à déplacer dans l'équilibrage du manifeste si le barème bouge souvent.
pub const PRIX_INDICE: [u32; 3] = [4, 8, 12];

/// Prix d'un indice (1 à 3), ou `None` hors barème.
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
        assert_eq!(prix(1), Some(4));
        assert_eq!(prix(3), Some(12));
        assert_eq!(prix(0), None);
        assert_eq!(prix(4), None);
        assert_eq!(PRIX_INDICE.iter().sum::<u32>(), 24);
    }
}
