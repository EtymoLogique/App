//! Plis (ADR 0011, 0012, 0016, 0019, 0020) : poids des briques, règle
//! appliquée (tirage, garantie de nouveauté, filet d'utilité), tirage à partir
//! d'un aléa fourni par l'appelant et encre gagnée. Ce module ne lit rien et
//! n'écrit rien : le serveur l'appelle dans sa transaction avec un aléa
//! cryptographique, la PWA en a le miroir pour afficher les chances.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::hash::BuildHasher;

use serde::{Deserialize, Serialize};

use crate::IdCatalogue;
use crate::fusion::RecetteJeu;
use crate::reserve::PLAFOND;

/// Rareté d'une brique élémentaire : quatre niveaux, quatre formes.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum Rarete {
    Commune,
    PeuCommune,
    Rare,
    Legendaire,
}

/// Nature d'une brique tirable : préfixe, suffixe ou mot posé tel quel.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum NaturePli {
    Prefixe,
    Suffixe,
    Mot,
}

/// Une brique que le pli d'un fascicule peut donner.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BriquePli {
    pub id: IdCatalogue,
    pub nature: NaturePli,
    pub rarete: Rarete,
}

/// Paramètres d'équilibrage d'un pli, versionnés dans le catalogue (ADR 0009).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Equilibrage {
    /// Poids de chaque rareté (62, 26, 10) : la chance d'une brique est
    /// proportionnelle au poids de sa seule rareté (ADR 0035). Le poids des
    /// légendaires ne compte que si `chance_legendaire` est nulle.
    pub poids_raretes: BTreeMap<Rarete, u32>,
    /// Chance fixe, en pourcent, qu'un pli donne une légendaire, partagée à
    /// parts égales entre les légendaires du fascicule ; les poids ne
    /// s'appliquent qu'au reste (ADR 0043). Absente d'un manifeste antérieur :
    /// zéro, et les légendaires gardent leur poids.
    #[serde(default)]
    pub chance_legendaire: u32,
    /// Gouttes rapportées par tout pli (ADR 0020).
    pub base_encre: u32,
    /// Gouttes en plus pour un doublon sous le plafond (ADR 0019).
    pub encre_doublon: BTreeMap<Rarete, u32>,
    /// Gouttes en plus quand la réserve est pleine (ADR 0011).
    pub encre_reserve_pleine: BTreeMap<Rarete, u32>,
    /// Gouttes rapportées par la découverte d'un mot, selon sa rareté (ADR 0040).
    /// Absent d'un manifeste antérieur : une découverte ne rapporte rien.
    #[serde(default)]
    pub encre_decouverte: BTreeMap<Rarete, u32>,
    /// Une brique nouvelle au plus tard à ce pli après la dernière nouveauté.
    pub garantie_nouveaute: u32,
    /// Une brique utile au plus tard à ce pli consécutif sans découverte possible.
    pub filet_utilite: u32,
}

/// Règle qui a décidé de la brique tirée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Regle {
    /// Tirage pondéré parmi toutes les briques du pli.
    Tirage,
    /// Garantie de nouveauté : tirage parmi les briques encore inconnues.
    Garantie,
    /// Filet d'utilité : tirage parmi les briques qui rendent une découverte possible.
    Filet,
    /// Garantie lointaine : tirage parmi les légendaires du fascicule, au plus
    /// tard au `GARANTIE_LEGENDAIRE`ᵉ pli d'affilée sans légendaire (ADR 0043).
    GarantieLegendaire,
    /// Pli de jalon : briques déclarées par le fascicule (ADR 0038).
    Deterministe,
}

/// Ce que la brique tirée apporte à la réserve.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Resultat {
    /// Brique jusque-là inconnue : un exemplaire.
    Nouvelle,
    /// Brique connue sous le plafond : un exemplaire de plus.
    Doublon,
    /// Brique déjà à 5 exemplaires : de l'encre seulement.
    ReservePleine,
}

/// Compteurs d'un fascicule pour un joueur (modèle de données, `compteur_pli`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Compteurs {
    pub plis_sans_nouveaute: u32,
    pub plis_sans_utilite: u32,
    pub plis_sans_legendaire: u32,
}

/// Une légendaire au plus tard à ce pli d'affilée sans légendaire, par fascicule.
pub const GARANTIE_LEGENDAIRE: u32 = 100;

/// Poids des briques : le poids de la seule rareté de chacune (ADR 0035).
/// Deux briques de même rareté ont toujours la même chance.
#[must_use]
pub fn poids(briques: &[BriquePli], equilibrage: &Equilibrage) -> Vec<u64> {
    briques
        .iter()
        .map(|b| u64::from(*equilibrage.poids_raretes.get(&b.rarete).unwrap_or(&0)))
        .collect()
}

/// Poids de tirage des briques éligibles (les autres pèsent zéro).
///
/// Sans `chance_legendaire`, c'est le poids de la rareté. Sinon, les légendaires
/// éligibles se partagent à parts égales la chance fixe `c` %, et les autres
/// briques les `100 - c` % restants selon les poids de leur rareté. Les poids
/// sont des entiers : ceux des non-légendaires sont multipliés par
/// `(100 - c) × nombre de légendaires`, chaque légendaire pèse `c × somme des
/// poids des autres`. Sans légendaire éligible, les poids restent ceux des raretés.
#[must_use]
pub fn poids_eligibles(
    briques: &[BriquePli],
    eligibles: &[bool],
    equilibrage: &Equilibrage,
) -> Vec<u64> {
    let bruts = poids(briques, equilibrage);
    let chance = u64::from(equilibrage.chance_legendaire.min(100));
    let eligible = |i: usize| eligibles.get(i).copied().unwrap_or(false);
    if chance == 0 {
        return bruts
            .into_iter()
            .enumerate()
            .map(|(i, p)| if eligible(i) { p } else { 0 })
            .collect();
    }
    let legendaire = |i: usize| briques[i].rarete == Rarete::Legendaire;
    let nb_legendaires = (0..briques.len())
        .filter(|&i| eligible(i) && legendaire(i))
        .count() as u64;
    let somme_autres: u64 = (0..briques.len())
        .filter(|&i| eligible(i) && !legendaire(i))
        .map(|i| bruts[i])
        .sum();
    (0..briques.len())
        .map(|i| {
            if !eligible(i) {
                0
            } else if legendaire(i) {
                if somme_autres == 0 {
                    1
                } else {
                    chance * somme_autres
                }
            } else if nb_legendaires == 0 {
                bruts[i]
            } else {
                bruts[i] * (100 - chance) * nb_legendaires
            }
        })
        .collect()
}

/// Un pli ne tire que des préfixes et des suffixes, jamais un mot (ADR 0035).
#[must_use]
pub fn tirable(brique: &BriquePli) -> bool {
    brique.nature != NaturePli::Mot
}

/// Tire un indice parmi des poids, avec un aléa uniforme dans `[0, somme)`.
/// Renvoie `None` si tous les poids sont nuls.
#[must_use]
pub fn choisir(poids: &[u64], alea: u64) -> Option<usize> {
    let somme: u64 = poids.iter().sum();
    if somme == 0 {
        return None;
    }
    let mut reste = alea % somme;
    for (i, &p) in poids.iter().enumerate() {
        if reste < p {
            return Some(i);
        }
        reste -= p;
    }
    None
}

/// Borne haute d'un aléa sans biais pour `somme` : l'appelant tire un `u64`
/// et recommence tant qu'il dépasse cette borne (échantillonnage par rejet).
#[must_use]
pub fn borne_sans_biais(somme: u64) -> u64 {
    if somme == 0 {
        return u64::MAX;
    }
    u64::MAX - (u64::MAX % somme) - 1
}

/// Vrai si la réserve permet encore au moins une découverte : une recette d'un
/// mot inconnu dont chaque emplacement trouve un exemplaire (miroir de
/// `decouvertePossible` dans la PWA).
#[must_use]
pub fn decouverte_possible<S: BuildHasher, T: BuildHasher>(
    recettes: &[RecetteJeu],
    stock: &HashMap<IdCatalogue, u8, S>,
    decouverts: &HashSet<IdCatalogue, T>,
) -> bool {
    recettes.iter().any(|recette| {
        if decouverts.contains(&recette.mot_id) {
            return false;
        }
        let mut restants: HashMap<&IdCatalogue, u8> = stock.iter().map(|(b, &n)| (b, n)).collect();
        recette.emplacements.iter().all(|acceptees| {
            let Some(brique) = acceptees
                .iter()
                .find(|b| restants.get(b).copied().unwrap_or(0) > 0)
            else {
                return false;
            };
            if let Some(n) = restants.get_mut(brique) {
                *n -= 1;
            }
            true
        })
    })
}

/// Briques du pli utiles au filet (ADR 0012) : celles qui, avec un exemplaire
/// de plus, rendent une découverte possible. Si aucune brique seule ne suffit,
/// les briques qui manquent à une recette encore à découvrir.
#[must_use]
pub fn briques_utiles<S: BuildHasher, T: BuildHasher>(
    briques: &[BriquePli],
    recettes: &[RecetteJeu],
    stock: &HashMap<IdCatalogue, u8, S>,
    decouverts: &HashSet<IdCatalogue, T>,
) -> HashSet<IdCatalogue> {
    let utiles: HashSet<IdCatalogue> = briques
        .iter()
        .filter(|b| {
            let mut avec: HashMap<IdCatalogue, u8> =
                stock.iter().map(|(k, &v)| (k.clone(), v)).collect();
            *avec.entry(b.id.clone()).or_default() += 1;
            decouverte_possible(recettes, &avec, decouverts)
        })
        .map(|b| b.id.clone())
        .collect();
    if !utiles.is_empty() {
        return utiles;
    }
    let du_pli: HashSet<&IdCatalogue> = briques.iter().map(|b| &b.id).collect();
    recettes
        .iter()
        .filter(|r| !decouverts.contains(&r.mot_id))
        .flat_map(|r| r.emplacements.iter().flatten())
        .filter(|b| du_pli.contains(b) && stock.get(*b).copied().unwrap_or(0) == 0)
        .cloned()
        .collect()
}

/// Somme des poids des briques éligibles à la règle retenue.
#[must_use]
pub fn somme_eligible(briques: &[BriquePli], eligibles: &[bool], equilibrage: &Equilibrage) -> u64 {
    poids_eligibles(briques, eligibles, equilibrage)
        .iter()
        .sum()
}

/// Décide de la règle d'un pli et des briques éligibles.
///
/// - `connues` : briques de la réserve, épuisées comprises ;
/// - `utiles` : briques qui rendraient au moins une découverte possible ;
/// - `bloque` : vrai si la réserve ne permet aujourd'hui aucune découverte.
///
/// Le filet passe avant la garantie : il répond à une impasse.
#[must_use]
pub fn regle<S: BuildHasher, T: BuildHasher>(
    briques: &[BriquePli],
    compteurs: Compteurs,
    equilibrage: &Equilibrage,
    connues: &HashSet<IdCatalogue, S>,
    utiles: &HashSet<IdCatalogue, T>,
    bloque: bool,
) -> (Regle, Vec<bool>) {
    // Avec une chance fixe, les garanties de nouveauté et d'utilité ne tirent
    // jamais une légendaire (ADR 0043) ; seule la garantie lointaine en donne une.
    let hors_legendaire =
        |b: &BriquePli| equilibrage.chance_legendaire == 0 || b.rarete != Rarete::Legendaire;
    if equilibrage.chance_legendaire > 0
        && compteurs.plis_sans_legendaire + 1 >= GARANTIE_LEGENDAIRE
    {
        let eligibles: Vec<bool> = briques
            .iter()
            .map(|b| b.rarete == Rarete::Legendaire)
            .collect();
        if eligibles.iter().any(|&e| e) {
            return (Regle::GarantieLegendaire, eligibles);
        }
    }
    let filet = bloque && compteurs.plis_sans_utilite + 1 >= equilibrage.filet_utilite;
    if filet {
        let eligibles: Vec<bool> = briques
            .iter()
            .map(|b| utiles.contains(&b.id) && hors_legendaire(b))
            .collect();
        if eligibles.iter().any(|&e| e) {
            return (Regle::Filet, eligibles);
        }
    }
    let garantie = compteurs.plis_sans_nouveaute + 1 >= equilibrage.garantie_nouveaute;
    if garantie {
        let eligibles: Vec<bool> = briques
            .iter()
            .map(|b| !connues.contains(&b.id) && hors_legendaire(b))
            .collect();
        if eligibles.iter().any(|&e| e) {
            return (Regle::Garantie, eligibles);
        }
    }
    (Regle::Tirage, vec![true; briques.len()])
}

/// Tire la brique parmi les éligibles, en gardant leurs poids d'origine.
#[must_use]
pub fn tirer<'a>(
    briques: &'a [BriquePli],
    eligibles: &[bool],
    equilibrage: &Equilibrage,
    alea: u64,
) -> Option<&'a BriquePli> {
    let poids = poids_eligibles(briques, eligibles, equilibrage);
    choisir(&poids, alea).map(|i| &briques[i])
}

/// Résultat d'une brique tirée, selon ses exemplaires actuels (`None` si inconnue).
#[must_use]
pub fn resultat(exemplaires: Option<u8>) -> Resultat {
    match exemplaires {
        None => Resultat::Nouvelle,
        Some(n) if n >= PLAFOND => Resultat::ReservePleine,
        Some(_) => Resultat::Doublon,
    }
}

/// Gouttes gagnées : la base, plus le barème du doublon ou de la réserve pleine.
#[must_use]
pub fn encre(resultat: Resultat, rarete: Rarete, equilibrage: &Equilibrage) -> u32 {
    let bonus = match resultat {
        Resultat::Nouvelle => 0,
        Resultat::Doublon => *equilibrage.encre_doublon.get(&rarete).unwrap_or(&0),
        Resultat::ReservePleine => *equilibrage.encre_reserve_pleine.get(&rarete).unwrap_or(&0),
    };
    equilibrage.base_encre + bonus
}

/// Rareté d'un mot (ADR 0040) : la plus haute rareté parmi les briques que sa
/// recette la plus accessible exige. Pour un emplacement à variantes, la moins
/// rare compte. Une brique sans rareté connue (un mot posé tel quel) compte
/// comme commune. Miroir de `rareteMot` dans la PWA.
#[must_use]
pub fn rarete_mot<'a>(
    recettes: impl IntoIterator<Item = &'a RecetteJeu>,
    rarete: impl Fn(&IdCatalogue) -> Option<Rarete>,
) -> Rarete {
    recettes
        .into_iter()
        .map(|r| {
            r.emplacements
                .iter()
                .map(|acceptees| {
                    acceptees
                        .iter()
                        .map(|b| rarete(b).unwrap_or(Rarete::Commune))
                        .min()
                        .unwrap_or(Rarete::Commune)
                })
                .max()
                .unwrap_or(Rarete::Commune)
        })
        .min()
        .unwrap_or(Rarete::Commune)
}

/// Compteurs après un pli : la nouveauté remet la garantie à zéro ; le filet
/// compte les plis consécutifs ouverts sans découverte possible, jusqu'à ce
/// que la réserve en permette une ; la garantie lointaine compte les plis
/// d'affilée sans légendaire.
#[must_use]
pub fn compteurs_apres(
    avant: Compteurs,
    resultat: Resultat,
    legendaire: bool,
    bloque_avant: bool,
    bloque_apres: bool,
) -> Compteurs {
    Compteurs {
        plis_sans_nouveaute: if resultat == Resultat::Nouvelle {
            0
        } else {
            avant.plis_sans_nouveaute + 1
        },
        plis_sans_utilite: if bloque_avant && bloque_apres {
            avant.plis_sans_utilite + 1
        } else {
            0
        },
        plis_sans_legendaire: if legendaire {
            0
        } else {
            avant.plis_sans_legendaire + 1
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(texte: &str) -> IdCatalogue {
        texte.parse().unwrap()
    }

    fn equilibrage() -> Equilibrage {
        Equilibrage {
            chance_legendaire: 0,
            poids_raretes: BTreeMap::from([
                (Rarete::Commune, 62),
                (Rarete::PeuCommune, 26),
                (Rarete::Rare, 10),
                (Rarete::Legendaire, 2),
            ]),
            base_encre: 2,
            encre_doublon: BTreeMap::from([
                (Rarete::Commune, 1),
                (Rarete::PeuCommune, 2),
                (Rarete::Rare, 4),
                (Rarete::Legendaire, 10),
            ]),
            encre_reserve_pleine: BTreeMap::from([
                (Rarete::Commune, 2),
                (Rarete::PeuCommune, 4),
                (Rarete::Rare, 8),
                (Rarete::Legendaire, 20),
            ]),
            encre_decouverte: BTreeMap::new(),
            garantie_nouveaute: 6,
            filet_utilite: 5,
        }
    }

    fn brique(texte: &str, nature: NaturePli, rarete: Rarete) -> BriquePli {
        BriquePli {
            id: id(texte),
            nature,
            rarete,
        }
    }

    fn briques() -> Vec<BriquePli> {
        vec![
            brique("brq_0000ge00", NaturePli::Prefixe, Rarete::Commune),
            brique("brq_0000b100", NaturePli::Prefixe, Rarete::Commune),
            brique("brq_000109e0", NaturePli::Suffixe, Rarete::Commune),
            brique("brq_0000000r", NaturePli::Suffixe, Rarete::Rare),
        ]
    }

    #[test]
    fn le_poids_d_une_brique_est_celui_de_sa_rarete() {
        let p = poids(&briques(), &equilibrage());
        // Même rareté, même chance, quel que soit le type ou le nombre de voisines.
        assert_eq!(p, vec![62, 62, 62, 10]);
        assert!(!tirable(&brique(
            "brq_0000m000",
            NaturePli::Mot,
            Rarete::Commune
        )));
    }

    #[test]
    fn choisit_selon_les_poids() {
        assert_eq!(choisir(&[1, 0, 3], 0), Some(0));
        assert_eq!(choisir(&[1, 0, 3], 1), Some(2));
        assert_eq!(choisir(&[1, 0, 3], 3), Some(2));
        assert_eq!(choisir(&[1, 0, 3], 4), Some(0));
        assert_eq!(choisir(&[0, 0], 7), None);
    }

    #[test]
    fn la_garantie_ne_tire_que_des_briques_inconnues_au_sixieme_pli() {
        let connues = HashSet::from([id("brq_0000ge00"), id("brq_0000b100"), id("brq_000109e0")]);
        let cinq = Compteurs {
            plis_sans_nouveaute: 5,
            plis_sans_utilite: 0,
            plis_sans_legendaire: 0,
        };
        let (r, eligibles) = regle(
            &briques(),
            cinq,
            &equilibrage(),
            &connues,
            &HashSet::new(),
            false,
        );
        assert_eq!(r, Regle::Garantie);
        assert_eq!(eligibles, vec![false, false, false, true]);
        let quatre = Compteurs {
            plis_sans_nouveaute: 4,
            ..cinq
        };
        assert_eq!(
            regle(
                &briques(),
                quatre,
                &equilibrage(),
                &connues,
                &HashSet::new(),
                false
            )
            .0,
            Regle::Tirage
        );
    }

    #[test]
    fn sans_brique_inconnue_la_garantie_laisse_place_au_tirage() {
        let connues: HashSet<_> = briques().into_iter().map(|b| b.id).collect();
        let compteurs = Compteurs {
            plis_sans_nouveaute: 9,
            plis_sans_utilite: 0,
            plis_sans_legendaire: 0,
        };
        assert_eq!(
            regle(
                &briques(),
                compteurs,
                &equilibrage(),
                &connues,
                &HashSet::new(),
                false
            )
            .0,
            Regle::Tirage
        );
    }

    #[test]
    fn le_filet_passe_avant_la_garantie_au_cinquieme_pli_bloque() {
        let utiles = HashSet::from([id("brq_000109e0")]);
        let compteurs = Compteurs {
            plis_sans_nouveaute: 5,
            plis_sans_utilite: 4,
            plis_sans_legendaire: 0,
        };
        let (r, eligibles) = regle(
            &briques(),
            compteurs,
            &equilibrage(),
            &HashSet::new(),
            &utiles,
            true,
        );
        assert_eq!(r, Regle::Filet);
        assert_eq!(eligibles, vec![false, false, true, false]);
        let toutes = briques();
        let brique = tirer(&toutes, &eligibles, &equilibrage(), 12_345).unwrap();
        assert_eq!(brique.id, id("brq_000109e0"));
    }

    #[test]
    fn chaque_pli_rapporte_au_moins_la_base() {
        let e = equilibrage();
        assert_eq!(encre(Resultat::Nouvelle, Rarete::Legendaire, &e), 2);
        assert_eq!(encre(Resultat::Doublon, Rarete::Rare, &e), 6);
        assert_eq!(encre(Resultat::ReservePleine, Rarete::Commune, &e), 4);
        assert_eq!(resultat(None), Resultat::Nouvelle);
        assert_eq!(resultat(Some(0)), Resultat::Doublon);
        assert_eq!(resultat(Some(5)), Resultat::ReservePleine);
    }

    #[test]
    fn les_compteurs_suivent_nouveaute_et_impasse() {
        let avant = Compteurs {
            plis_sans_nouveaute: 3,
            plis_sans_utilite: 2,
            plis_sans_legendaire: 0,
        };
        assert_eq!(
            compteurs_apres(avant, Resultat::Nouvelle, false, true, false),
            Compteurs {
                plis_sans_legendaire: 1,
                ..Compteurs::default()
            }
        );
        assert_eq!(
            compteurs_apres(avant, Resultat::Doublon, false, true, true),
            Compteurs {
                plis_sans_nouveaute: 4,
                plis_sans_utilite: 3,
                plis_sans_legendaire: 1,
            }
        );
    }

    #[test]
    fn la_borne_sans_biais_est_un_multiple_de_la_somme() {
        let somme = 7_u64;
        assert_eq!((borne_sans_biais(somme) + 1) % somme, 0);
    }

    #[test]
    fn la_rarete_d_un_mot_est_celle_de_sa_brique_la_plus_rare() {
        let raretes = HashMap::from([
            (id("brq_0000ge00"), Rarete::Commune),
            (id("brq_0000b100"), Rarete::PeuCommune),
            (id("brq_0000000r"), Rarete::Rare),
        ]);
        let rarete = |b: &IdCatalogue| raretes.get(b).copied();
        let recette = |emplacements: Vec<Vec<IdCatalogue>>| RecetteJeu {
            id: id("rct_00000001"),
            mot_id: id("unt_00000001"),
            emplacements,
        };
        let geo_rare = recette(vec![vec![id("brq_0000ge00")], vec![id("brq_0000000r")]]);
        assert_eq!(rarete_mot([&geo_rare], rarete), Rarete::Rare);
        // Une variante moins rare suffit ; un mot posé tel quel compte comme commun.
        let variantes = recette(vec![
            vec![id("brq_0000000r"), id("brq_0000b100")],
            vec![id("brq_000000m0")],
        ]);
        assert_eq!(rarete_mot([&variantes], rarete), Rarete::PeuCommune);
        // La recette la plus accessible décide.
        assert_eq!(
            rarete_mot([&geo_rare, &variantes], rarete),
            Rarete::PeuCommune
        );
        assert_eq!(rarete_mot([], rarete), Rarete::Commune);
    }

    fn avec_legendaires() -> (Vec<BriquePli>, Equilibrage) {
        let mut briques = briques();
        briques.push(brique(
            "brq_0000g001",
            NaturePli::Prefixe,
            Rarete::Legendaire,
        ));
        briques.push(brique(
            "brq_0000g002",
            NaturePli::Suffixe,
            Rarete::Legendaire,
        ));
        let mut e = equilibrage();
        e.chance_legendaire = 3;
        (briques, e)
    }

    #[test]
    fn la_chance_fixe_ne_depend_ni_du_poids_ni_du_nombre_de_legendaires() {
        let (briques, e) = avec_legendaires();
        let tous = vec![true; briques.len()];
        let p = poids_eligibles(&briques, &tous, &e);
        let somme: u64 = p.iter().sum();
        let legendaires: u64 = p[4] + p[5];
        // 3 % pour l'ensemble, partagé à parts égales.
        assert_eq!(legendaires * 100, somme * 3);
        assert_eq!(p[4], p[5]);
        // Les 97 % restants suivent les poids 62, 62, 62, 10.
        assert_eq!(p[0], p[1]);
        assert_eq!(p[3] * 62, p[0] * 10);
        // Une seule légendaire garde la même chance totale.
        let seule: Vec<bool> = vec![true, true, true, true, true, false];
        let p = poids_eligibles(&briques, &seule, &e);
        assert_eq!(p[4] * 100, p.iter().sum::<u64>() * 3);
    }

    #[test]
    fn sans_chance_fixe_ou_sans_legendaire_les_poids_sont_ceux_des_raretes() {
        let (briques, mut e) = avec_legendaires();
        let tous = vec![true; briques.len()];
        e.chance_legendaire = 0;
        assert_eq!(
            poids_eligibles(&briques, &tous, &e),
            vec![62, 62, 62, 10, 2, 2]
        );
        e.chance_legendaire = 3;
        let sans = vec![true, true, true, true, false, false];
        assert_eq!(
            poids_eligibles(&briques, &sans, &e),
            vec![62, 62, 62, 10, 0, 0]
        );
    }

    #[test]
    fn les_garanties_ne_tirent_jamais_une_legendaire() {
        let (briques, e) = avec_legendaires();
        let connues = HashSet::from([id("brq_0000ge00")]);
        let compteurs = Compteurs {
            plis_sans_nouveaute: 5,
            ..Compteurs::default()
        };
        let (r, eligibles) = regle(&briques, compteurs, &e, &connues, &HashSet::new(), false);
        assert_eq!(r, Regle::Garantie);
        assert_eq!(eligibles, vec![false, true, true, true, false, false]);
        let utiles = HashSet::from([id("brq_0000g001"), id("brq_000109e0")]);
        let bloque = Compteurs {
            plis_sans_utilite: 4,
            ..Compteurs::default()
        };
        let (r, eligibles) = regle(&briques, bloque, &e, &HashSet::new(), &utiles, true);
        assert_eq!(r, Regle::Filet);
        assert_eq!(eligibles, vec![false, false, true, false, false, false]);
    }

    #[test]
    fn la_garantie_lointaine_donne_une_legendaire_au_centieme_pli() {
        let (briques, e) = avec_legendaires();
        let quatre_vingt_dix_huit = Compteurs {
            plis_sans_legendaire: GARANTIE_LEGENDAIRE - 2,
            ..Compteurs::default()
        };
        let connues = HashSet::new();
        assert_eq!(
            regle(
                &briques,
                quatre_vingt_dix_huit,
                &e,
                &connues,
                &HashSet::new(),
                false
            )
            .0,
            Regle::Tirage
        );
        let quatre_vingt_dix_neuf = Compteurs {
            plis_sans_legendaire: GARANTIE_LEGENDAIRE - 1,
            ..Compteurs::default()
        };
        let (r, eligibles) = regle(
            &briques,
            quatre_vingt_dix_neuf,
            &e,
            &connues,
            &HashSet::new(),
            false,
        );
        assert_eq!(r, Regle::GarantieLegendaire);
        assert_eq!(eligibles, vec![false, false, false, false, true, true]);
        // Sans légendaire dans le fascicule, ou sans chance fixe, la garantie ne joue pas.
        assert_eq!(
            regle(
                &briques[..4],
                quatre_vingt_dix_neuf,
                &e,
                &connues,
                &HashSet::new(),
                false
            )
            .0,
            Regle::Tirage
        );
    }

    #[test]
    fn le_compteur_de_legendaire_repart_a_zero_sur_une_legendaire() {
        let avant = Compteurs {
            plis_sans_legendaire: 40,
            ..Compteurs::default()
        };
        assert_eq!(
            compteurs_apres(avant, Resultat::Doublon, true, false, false).plis_sans_legendaire,
            0
        );
        assert_eq!(
            compteurs_apres(avant, Resultat::Nouvelle, false, false, false).plis_sans_legendaire,
            41
        );
    }
}
