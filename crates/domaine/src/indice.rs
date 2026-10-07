//! Indices (ADR 0051) : trois indices par recette, achetés dans l'ordre,
//! une fois chacun. Le « niveau » identifie l'indice : 1 la
//! silhouette, 2 le sens littéral, 3 la définition.

/// Ordre d'achat des indices, par niveau : définition, silhouette, sens littéral.
pub const ORDRE: [u8; 3] = [3, 1, 2];

/// Prix de chaque indice par niveau, en gouttes : dans l'ordre d'achat, chacun double le précédent (4, 8, 16).
// ponytail: constante ; à déplacer dans l'équilibrage du manifeste si le barème bouge souvent.
pub const PRIX_INDICE: [u32; 3] = [8, 16, 4];

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
        let suite: Vec<_> = ORDRE.iter().map(|&n| prix(n)).collect();
        assert_eq!(suite, [Some(4), Some(8), Some(16)]);
        assert_eq!(prix(0), None);
        assert_eq!(prix(4), None);
        assert_eq!(PRIX_INDICE.iter().sum::<u32>(), 28);
    }
}
