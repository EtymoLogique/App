//! Règles du jeu tirées des fascicules parus : recettes, exclusions, briques
//! connues du catalogue et graines. Construit une fois par version d'index.

use std::collections::{HashMap, HashSet};

use etymo_domaine::IdCatalogue;
use etymo_domaine::fusion::{ExclusionJeu, RecetteJeu};
use etymo_domaine::jalon::Jalon;
use etymo_domaine::pli::{self, BriquePli};

use crate::format::Role;
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
    /// Jalons de chaque fascicule paru.
    pub jalons: Vec<JalonsJeu>,
    /// Briques légendaires : leurs recettes restent secrètes (ADR 0015).
    pub legendaires: HashSet<IdCatalogue>,
    /// Brique-mot par mot (unité) : la découverte d'un mot ingrédient en offre un exemplaire.
    pub briques_de_mot: HashMap<IdCatalogue, IdCatalogue>,
}

/// Les jalons d'un fascicule et les mots qui les font avancer.
#[derive(Debug, Clone)]
pub struct JalonsJeu {
    pub fascicule_id: IdCatalogue,
    pub mots: HashSet<IdCatalogue>,
    pub jalons: Vec<Jalon>,
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
    /// Rareté d'une brique tirable, si un pli paru la connaît.
    #[must_use]
    pub fn rarete(&self, brique: &IdCatalogue) -> Option<pli::Rarete> {
        self.plis
            .iter()
            .flat_map(|p| &p.briques)
            .find(|b| &b.id == brique)
            .map(|b| b.rarete)
    }

    /// Rareté d'un mot, dérivée des briques de ses recettes (ADR 0040).
    #[must_use]
    pub fn rarete_mot(&self, mot: &IdCatalogue) -> pli::Rarete {
        pli::rarete_mot(self.recettes.iter().filter(|r| &r.mot_id == mot), |b| {
            self.rarete(b)
        })
    }

    /// Gouttes que rapporte la découverte d'un mot : barème de l'équilibrage
    /// du fascicule qui le publie, selon sa rareté (ADR 0040).
    #[must_use]
    pub fn encre_decouverte(&self, mot: &IdCatalogue) -> u32 {
        self.jalons
            .iter()
            .find(|f| f.mots.contains(mot))
            .and_then(|f| self.equilibrage(&f.fascicule_id))
            .and_then(|e| e.parametres.encre_decouverte.get(&self.rarete_mot(mot)))
            .copied()
            .unwrap_or(0)
    }

    /// Équilibrage du pli d'un fascicule.
    #[must_use]
    pub fn equilibrage(&self, fascicule: &IdCatalogue) -> Option<&EquilibrageManifeste> {
        self.pli(fascicule).and_then(|p| p.equilibrage.as_ref())
    }

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
            jeu.legendaires.extend(
                pli.briques
                    .iter()
                    .filter(|b| b.rarete == pli::Rarete::Legendaire)
                    .map(|b| b.id.clone()),
            );
            jeu.jalons.push(JalonsJeu {
                fascicule_id: fascicule.manifeste.id.clone(),
                mots: fascicule
                    .manifeste
                    .cartes
                    .iter()
                    .filter(|c| c.role == Role::Resultat)
                    .map(|c| c.id.clone())
                    .collect(),
                jalons: fascicule.manifeste.jalons.clone(),
            });
            jeu.briques.extend(pli.briques.iter().map(|b| b.id.clone()));
            jeu.briques_de_mot.extend(
                fascicule
                    .manifeste
                    .mots_briques
                    .iter()
                    .map(|m| (m.mot_id.clone(), m.brique_id.clone())),
            );
            jeu.briques.extend(
                fascicule
                    .manifeste
                    .mots_briques
                    .iter()
                    .map(|m| m.brique_id.clone()),
            );
            // Un pli ne s'ouvre qu'avec son équilibrage et la nature de chaque
            // brique ; il ne tire jamais un mot (ADR 0035).
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
                .collect::<Option<Vec<_>>>()
                .map(|v| v.into_iter().filter(pli::tirable).collect());
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
