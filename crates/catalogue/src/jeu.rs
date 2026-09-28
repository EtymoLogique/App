//! Règles du jeu tirées des fascicules parus : recettes, exclusions, briques
//! connues du catalogue et graines. Construit une fois par version d'index.

use std::collections::HashSet;

use etymo_domaine::IdCatalogue;
use etymo_domaine::fusion::{ExclusionJeu, RecetteJeu};
use etymo_domaine::pli::BriquePli;

use crate::{EquilibrageManifeste, FasciculeCharge, Graine};

#[derive(Debug, Clone, Default)]
pub struct Jeu {
    pub recettes: Vec<RecetteJeu>,
    pub exclusions: Vec<ExclusionJeu>,
    /// Briques publiées : tirables par un pli ou semées par un fascicule paru.
    pub briques: HashSet<IdCatalogue>,
    /// Graines de chaque fascicule paru, par identifiant de fascicule.
    pub graines: Vec<(IdCatalogue, Vec<Graine>)>,
    /// Pli de chaque fascicule paru.
    pub plis: Vec<PliJeu>,
}

/// Le pli d'un fascicule : ses briques tirables et son équilibrage.
#[derive(Debug, Clone)]
pub struct PliJeu {
    pub fascicule_id: IdCatalogue,
    pub briques: Vec<BriquePli>,
    /// Absent d'un manifeste antérieur à l'équilibrage : ce pli ne s'ouvre pas.
    pub equilibrage: Option<EquilibrageManifeste>,
}

impl Jeu {
    #[must_use]
    pub fn pli(&self, fascicule: &IdCatalogue) -> Option<&PliJeu> {
        self.plis.iter().find(|p| &p.fascicule_id == fascicule)
    }
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
            let pli = &fascicule.manifeste.pli;
            jeu.briques.extend(pli.briques.iter().map(|b| b.id.clone()));
            // Un pli ne s'ouvre qu'avec son équilibrage et la nature de chaque brique.
            let briques: Option<Vec<BriquePli>> = pli
                .briques
                .iter()
                .map(|b| {
                    Some(BriquePli {
                        id: b.id.clone(),
                        nature: b.nature?,
                        rarete: b.rarete,
                    })
                })
                .collect();
            jeu.plis.push(PliJeu {
                fascicule_id: fascicule.manifeste.id.clone(),
                equilibrage: pli.equilibrage.clone().filter(|_| briques.is_some()),
                briques: briques.unwrap_or_default(),
            });
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
