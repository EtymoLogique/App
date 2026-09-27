//! Règles du jeu tirées des fascicules parus : recettes, exclusions, briques
//! connues du catalogue et graines. Construit une fois par version d'index.

use std::collections::HashSet;

use etymo_domaine::IdCatalogue;
use etymo_domaine::fusion::{ExclusionJeu, RecetteJeu};

use crate::{FasciculeCharge, Graine};

#[derive(Debug, Clone, Default)]
pub struct Jeu {
    pub recettes: Vec<RecetteJeu>,
    pub exclusions: Vec<ExclusionJeu>,
    /// Briques publiées : tirables par un pli ou semées par un fascicule paru.
    pub briques: HashSet<IdCatalogue>,
    /// Graines de chaque fascicule paru, par identifiant de fascicule.
    pub graines: Vec<(IdCatalogue, Vec<Graine>)>,
}

impl Jeu {
    #[must_use]
    pub fn depuis(fascicules: &[FasciculeCharge]) -> Self {
        let mut jeu = Self::default();
        for fascicule in fascicules {
            for recette in &fascicule.recettes {
                let mut emplacements: Vec<_> = recette.emplacements.iter().collect();
                emplacements.sort_by_key(|e| e.rang);
                let emplacements: Vec<Vec<IdCatalogue>> = emplacements
                    .into_iter()
                    .map(|e| e.briques_acceptees.clone())
                    .collect();
                jeu.briques.extend(emplacements.iter().flatten().cloned());
                jeu.recettes.push(RecetteJeu {
                    id: recette.id.clone(),
                    mot_id: recette.resultat_id.clone(),
                    emplacements,
                });
            }
            jeu.exclusions
                .extend(fascicule.exclusions.iter().map(|e| ExclusionJeu {
                    combinaison: e.combinaison.clone(),
                    raison: e.raison.clone(),
                }));
            if let Some(briques) = fascicule
                .manifeste
                .pli
                .get("briques")
                .and_then(|b| b.as_array())
            {
                jeu.briques.extend(
                    briques
                        .iter()
                        .filter_map(|b| b.get("id")?.as_str()?.parse::<IdCatalogue>().ok()),
                );
            }
            jeu.briques.extend(
                fascicule
                    .manifeste
                    .graines
                    .iter()
                    .map(|g| g.brique_id.clone()),
            );
            jeu.graines.push((
                fascicule.manifeste.id.clone(),
                fascicule.manifeste.graines.clone(),
            ));
        }
        jeu
    }
}
