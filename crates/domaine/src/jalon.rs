//! Jalons (ADR 0038) : atteints à un nombre de découvertes dans le fascicule,
//! ils donnent un pli déterministe et/ou des sabliers.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::IdCatalogue;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Jalon {
    pub id: IdCatalogue,
    /// Mots du fascicule découverts qui atteignent le jalon.
    pub decouvertes: u32,
    /// Briques du pli de jalon : un exemplaire de chacune.
    #[serde(default)]
    pub pli: Vec<IdCatalogue>,
    #[serde(default)]
    pub sabliers: u32,
}

/// Jalons atteints avec `decouvertes` mots du fascicule, hors ceux déjà accordés.
#[must_use]
pub fn atteints<'a, S: std::hash::BuildHasher>(
    decouvertes: usize,
    jalons: &'a [Jalon],
    deja: &HashSet<IdCatalogue, S>,
) -> Vec<&'a Jalon> {
    jalons
        .iter()
        .filter(|j| usize::try_from(j.decouvertes).is_ok_and(|n| n <= decouvertes))
        .filter(|j| !deja.contains(&j.id))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jalon(id: &str, decouvertes: u32) -> Jalon {
        Jalon {
            id: id.parse().unwrap(),
            decouvertes,
            pli: vec![],
            sabliers: 1,
        }
    }

    #[test]
    fn une_seule_fois_et_au_seuil() {
        let jalons = [jalon("jal_00000003", 3), jalon("jal_00000006", 6)];
        assert!(atteints(2, &jalons, &HashSet::new()).is_empty());
        assert_eq!(atteints(3, &jalons, &HashSet::new()), vec![&jalons[0]]);
        let deja = HashSet::from([jalons[0].id.clone()]);
        assert_eq!(atteints(7, &jalons, &deja), vec![&jalons[1]]);
    }
}
