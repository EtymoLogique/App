//! Ricochets (ADR 0044) : tirage d'une séance, jugement d'une réponse et
//! écriture du niveau d'une carte. Le serveur ne lit aucun texte : il juge sur
//! les identifiants et les classes de sens publiés par le contenu.

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDate, Utc};
use etymo_catalogue::Jeu;
use etymo_contrat::{
    FormatRicochet, QuestionRicochet, ReponseJoueur, RicochetEtat, RicochetsDuJour,
};
use etymo_domaine::IdCatalogue;
use etymo_domaine::ricochet::{self, Carte};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::erreur::ErreurApi;

/// Questions d'une séance, au plus.
pub const QUESTIONS: usize = 5;
/// Choix d'un QCM, au plus.
const CHOIX_MAX: usize = 4;
/// Briques d'une question « paires ».
const PAIRES: usize = 4;
/// Positions de coupe acceptées dans une réponse.
const COUPES_MAX: usize = 8;

// ------------------------------------------------------------------ hasard

/// Générateur sans prétention (splitmix64) : le tirage d'une séance n'a rien à protéger.
pub struct Hasard(u64);

impl Hasard {
    #[must_use]
    pub fn nouveau(graine: u64) -> Self {
        Self(graine)
    }

    pub fn depuis_le_systeme() -> Result<Self, ErreurApi> {
        getrandom::u64()
            .map(Self)
            .map_err(|e| ErreurApi::Interne(e.to_string()))
    }

    fn suivant(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Dans `[0, n)`.
    pub fn jusqu_a(&mut self, n: usize) -> usize {
        usize::try_from(self.suivant() % u64::try_from(n.max(1)).unwrap_or(1)).unwrap_or(0)
    }

    fn melanger<T>(&mut self, valeurs: &mut [T]) {
        for i in (1..valeurs.len()).rev() {
            valeurs.swap(i, self.jusqu_a(i + 1));
        }
    }
}

// ------------------------------------------------------------------ tirage

fn est_brique(carte: &IdCatalogue) -> bool {
    carte.prefixe() == "brq"
}

/// Ordre des cartes d'une séance : d'abord celles à revoir (échéance la plus
/// ancienne), puis les cartes sans historique (la plus récente d'abord), puis,
/// pour compléter, les cartes pas encore échues (échéance la plus proche).
/// Celles-ci ne changent aucun niveau, mais la séance compte ses cinq questions.
#[must_use]
pub fn ordonner(
    cartes: Vec<(IdCatalogue, Option<Carte>, DateTime<Utc>)>,
    aujourd_hui: NaiveDate,
) -> Vec<IdCatalogue> {
    let (mut a_revoir, mut neuves, mut pas_echues) = (Vec::new(), Vec::new(), Vec::new());
    for (id, carte, recence) in cartes {
        match carte {
            None => neuves.push((id, recence)),
            Some(c) if c.a_revoir(aujourd_hui) => a_revoir.push((id, c.prochaine_revision)),
            Some(c) => pas_echues.push((id, c.prochaine_revision)),
        }
    }
    a_revoir.sort_by(|a, b| (a.1, &a.0).cmp(&(b.1, &b.0)));
    pas_echues.sort_by(|a, b| (a.1, &a.0).cmp(&(b.1, &b.0)));
    neuves.sort_by(|a, b| (std::cmp::Reverse(a.1), &a.0).cmp(&(std::cmp::Reverse(b.1), &b.0)));
    a_revoir
        .into_iter()
        .map(|c| c.0)
        .chain(neuves.into_iter().map(|c| c.0))
        .chain(pas_echues.into_iter().map(|c| c.0))
        .collect()
}

/// Leurres pour une cible : des cartes distinctes de la cible, deux à deux de
/// classes de sens différentes, tirées au hasard, au plus `CHOIX_MAX - 1`.
fn leurres<'a>(
    cible: &IdCatalogue,
    classe_cible: &IdCatalogue,
    candidats: impl Iterator<Item = (&'a IdCatalogue, &'a IdCatalogue)>,
    hasard: &mut Hasard,
) -> Vec<&'a IdCatalogue> {
    let mut candidats: Vec<_> = candidats.filter(|(id, _)| *id != cible).collect();
    hasard.melanger(&mut candidats);
    let mut classes = HashSet::from([classe_cible]);
    candidats
        .into_iter()
        .filter(|(_, classe)| classes.insert(classe))
        .take(CHOIX_MAX - 1)
        .map(|(id, _)| id)
        .collect()
}

/// Tire une séance de `QUESTIONS` au plus, sur des cartes déjà ordonnées
/// (`ordonner`), toutes trouvées et éligibles. Une carte vise une question au
/// plus ; le même format ne revient pas deux fois de suite quand un autre est
/// possible. Une question n'est tirée que si ses leurres existent.
#[must_use]
pub fn tirer(jeu: &Jeu, ordre: &[IdCatalogue], hasard: &mut Hasard) -> Vec<QuestionRicochet> {
    let briques: Vec<&IdCatalogue> = ordre.iter().filter(|c| est_brique(c)).collect();
    let mots: Vec<&IdCatalogue> = ordre.iter().filter(|c| !est_brique(c)).collect();
    let mut prises: HashSet<IdCatalogue> = HashSet::new();
    let mut questions: Vec<QuestionRicochet> = Vec::new();

    for cible in ordre {
        if questions.len() == QUESTIONS {
            break;
        }
        if prises.contains(cible) {
            continue;
        }
        let Some(question) = question(
            jeu,
            cible,
            &briques,
            &mots,
            &prises,
            questions.last(),
            hasard,
        ) else {
            continue;
        };
        prises.extend(question.cartes.iter().cloned());
        questions.push(question);
    }
    questions
}

fn question<'a>(
    jeu: &Jeu,
    cible: &'a IdCatalogue,
    briques: &[&'a IdCatalogue],
    mots: &[&'a IdCatalogue],
    prises: &HashSet<IdCatalogue>,
    precedente: Option<&QuestionRicochet>,
    hasard: &mut Hasard,
) -> Option<QuestionRicochet> {
    let mut formats = Vec::new();
    if est_brique(cible) {
        let b = jeu.ricochets.briques.get(cible)?;
        let possibles = leurres_briques(jeu, cible, &b.classe_sens, briques, hasard);
        if !possibles.is_empty() {
            formats.extend([FormatRicochet::SensBrique, FormatRicochet::BriqueSens]);
        }
        if compagnes(jeu, cible, &b.classe_sens, briques, prises).len() == PAIRES - 1 {
            formats.push(FormatRicochet::Paires);
        }
    } else {
        let m = jeu.ricochets.mots.get(cible)?;
        if let Some(classe) = &m.classe_litteral
            && !leurres_mots(jeu, cible, classe, mots, hasard).is_empty()
        {
            formats.push(FormatRicochet::MotSens);
        }
        if !m.coupes.is_empty() {
            formats.push(FormatRicochet::Decouper);
        }
    }
    if let Some(p) = precedente
        && formats.len() > 1
    {
        formats.retain(|f| *f != p.format);
    }
    if formats.is_empty() {
        return None;
    }
    let format = formats[hasard.jusqu_a(formats.len())];
    let un = vec![cible.clone()];
    Some(match format {
        FormatRicochet::SensBrique => {
            let b = &jeu.ricochets.briques[cible];
            let mut choix: Vec<IdCatalogue> =
                leurres_briques(jeu, cible, &b.classe_sens, briques, hasard)
                    .iter()
                    .map(|l| jeu.ricochets.briques[*l].sens_id.clone())
                    .collect();
            choix.push(b.sens_id.clone());
            hasard.melanger(&mut choix);
            QuestionRicochet {
                format,
                cartes: un,
                choix,
            }
        }
        FormatRicochet::BriqueSens => {
            let b = &jeu.ricochets.briques[cible];
            let mut choix: Vec<IdCatalogue> =
                leurres_briques(jeu, cible, &b.classe_sens, briques, hasard)
                    .into_iter()
                    .cloned()
                    .collect();
            choix.push(cible.clone());
            hasard.melanger(&mut choix);
            QuestionRicochet {
                format,
                cartes: un,
                choix,
            }
        }
        FormatRicochet::MotSens => {
            let classe = jeu.ricochets.mots[cible].classe_litteral.as_ref()?;
            let mut choix: Vec<IdCatalogue> = leurres_mots(jeu, cible, classe, mots, hasard)
                .into_iter()
                .cloned()
                .collect();
            choix.push(cible.clone());
            hasard.melanger(&mut choix);
            QuestionRicochet {
                format,
                cartes: un,
                choix,
            }
        }
        FormatRicochet::Decouper => QuestionRicochet {
            format,
            cartes: un,
            choix: vec![],
        },
        FormatRicochet::Paires => {
            let b = &jeu.ricochets.briques[cible];
            let mut cartes = vec![cible.clone()];
            cartes.extend(
                compagnes(jeu, cible, &b.classe_sens, briques, prises)
                    .into_iter()
                    .cloned(),
            );
            hasard.melanger(&mut cartes);
            QuestionRicochet {
                format,
                cartes,
                choix: vec![],
            }
        }
    })
}

fn leurres_briques<'a>(
    jeu: &'a Jeu,
    cible: &IdCatalogue,
    classe: &IdCatalogue,
    briques: &[&'a IdCatalogue],
    hasard: &mut Hasard,
) -> Vec<&'a IdCatalogue> {
    leurres(
        cible,
        classe,
        briques
            .iter()
            .filter_map(|b| Some((*b, &jeu.ricochets.briques.get(*b)?.classe_sens))),
        hasard,
    )
}

fn leurres_mots<'a>(
    jeu: &'a Jeu,
    cible: &IdCatalogue,
    classe: &IdCatalogue,
    mots: &[&'a IdCatalogue],
    hasard: &mut Hasard,
) -> Vec<&'a IdCatalogue> {
    leurres(
        cible,
        classe,
        mots.iter()
            .filter_map(|m| Some((*m, jeu.ricochets.mots.get(*m)?.classe_litteral.as_ref()?))),
        hasard,
    )
}

/// Les trois briques qui accompagnent la cible dans une question « paires » :
/// les suivantes dans l'ordre de la séance, de classes de sens toutes différentes.
fn compagnes<'a>(
    jeu: &Jeu,
    cible: &IdCatalogue,
    classe: &IdCatalogue,
    briques: &[&'a IdCatalogue],
    prises: &HashSet<IdCatalogue>,
) -> Vec<&'a IdCatalogue> {
    let mut classes = HashSet::from([classe]);
    briques
        .iter()
        .filter(|b| **b != cible && !prises.contains(**b))
        .filter_map(|b| Some((*b, &jeu.ricochets.briques.get(*b)?.classe_sens)))
        .filter(|(_, c)| classes.insert(*c))
        .map(|(b, _)| b)
        .take(PAIRES - 1)
        .collect()
}

// ---------------------------------------------------------------- jugement

fn invalide(message: &str) -> ErreurApi {
    ErreurApi::RequeteInvalide(message.to_owned())
}

/// Juge une réponse. `403` : la carte visée n'est pas un ricochet possible
/// (inconnue ou légendaire) ; `400` : format ou réponse mal formés.
pub fn juger(
    jeu: &Jeu,
    format: FormatRicochet,
    unite: &IdCatalogue,
    reponse: &ReponseJoueur,
) -> Result<bool, ErreurApi> {
    let ricochets = &jeu.ricochets;
    let inconnue = || ErreurApi::Interdit("carte inconnue");
    match (format, reponse) {
        (FormatRicochet::SensBrique | FormatRicochet::Paires, ReponseJoueur::Choix(sens)) => {
            let brique = (unite.prefixe() == "brq")
                .then(|| ricochets.briques.get(unite))
                .flatten()
                .ok_or_else(inconnue)?;
            if sens.prefixe() != "sns" {
                return Err(invalide("reponse : un sens attendu"));
            }
            // Deux briques de même glose ont deux sens : les deux sont justes.
            Ok(*sens == brique.sens_id
                || ricochets
                    .briques
                    .values()
                    .any(|b| b.sens_id == *sens && b.classe_sens == brique.classe_sens))
        }
        (FormatRicochet::BriqueSens, ReponseJoueur::Choix(choisie)) => {
            let brique = (unite.prefixe() == "brq")
                .then(|| ricochets.briques.get(unite))
                .flatten()
                .ok_or_else(inconnue)?;
            let autre = ricochets
                .briques
                .get(choisie)
                .ok_or_else(|| invalide("reponse : une brique connue attendue"))?;
            Ok(choisie == unite || autre.classe_sens == brique.classe_sens)
        }
        (FormatRicochet::MotSens, ReponseJoueur::Choix(choisi)) => {
            let mot = (unite.prefixe() == "unt")
                .then(|| ricochets.mots.get(unite))
                .flatten()
                .ok_or_else(inconnue)?;
            let classe = mot
                .classe_litteral
                .as_ref()
                .ok_or_else(|| invalide("format : ce mot n'a pas de sens littéral"))?;
            let autre = ricochets
                .mots
                .get(choisi)
                .ok_or_else(|| invalide("reponse : un mot connu attendu"))?;
            Ok(choisi == unite || autre.classe_litteral.as_ref() == Some(classe))
        }
        (FormatRicochet::Decouper, ReponseJoueur::Coupes(coupes)) => {
            let mot = (unite.prefixe() == "unt")
                .then(|| ricochets.mots.get(unite))
                .flatten()
                .ok_or_else(inconnue)?;
            if mot.coupes.is_empty() {
                return Err(invalide("format : ce mot ne se découpe pas"));
            }
            if coupes.len() > COUPES_MAX {
                return Err(invalide("reponse : trop de coupes"));
            }
            let mut coupes = coupes.clone();
            coupes.sort_unstable();
            coupes.dedup();
            Ok(coupes == mot.coupes)
        }
        _ => Err(invalide("reponse : forme incompatible avec le format")),
    }
}

// -------------------------------------------------------------------- base

fn id(texte: &str) -> Result<IdCatalogue, ErreurApi> {
    texte
        .parse()
        .map_err(|_| ErreurApi::Interne(format!("identifiant stocké invalide : {texte}")))
}

fn octet(n: i16) -> u8 {
    u8::try_from(n).unwrap_or(0)
}

/// Niveau de chaque carte qui a un historique.
pub async fn lire(
    tx: &mut PgConnection,
    joueur: Uuid,
) -> Result<HashMap<IdCatalogue, Carte>, ErreurApi> {
    sqlx::query!(
        "SELECT unite_id, niveau, bonnes_niveau_3, prochaine_revision, maitrisee_le
         FROM ricochet WHERE joueur_id = $1",
        joueur
    )
    .fetch_all(tx)
    .await?
    .into_iter()
    .map(|l| {
        Ok((
            id(&l.unite_id)?,
            Carte {
                niveau: octet(l.niveau),
                bonnes_niveau_3: octet(l.bonnes_niveau_3),
                prochaine_revision: l.prochaine_revision,
                maitrisee: l.maitrisee_le.is_some(),
            },
        ))
    })
    .collect()
}

/// Lignes de l'état : niveau, maîtrise et échéance de chaque carte à historique.
pub async fn etat(
    tx: &mut PgConnection,
    joueur: Uuid,
    aujourd_hui: NaiveDate,
) -> Result<Vec<RicochetEtat>, ErreurApi> {
    let mut lignes: Vec<_> = lire(tx, joueur).await?.into_iter().collect();
    lignes.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(lignes
        .into_iter()
        .map(|(unite_id, c)| RicochetEtat {
            unite_id,
            niveau: c.niveau,
            maitrisee: c.maitrisee,
            a_revoir: c.a_revoir(aujourd_hui),
        })
        .collect())
}

/// Cartes que le joueur peut se voir poser : briques de sa réserve et mots de
/// son codex que le contenu sait juger, avec leur ordre d'arrivée.
pub async fn cartes_du_joueur(
    tx: &mut PgConnection,
    joueur: Uuid,
    jeu: &Jeu,
) -> Result<Vec<(IdCatalogue, DateTime<Utc>)>, ErreurApi> {
    let mut cartes = Vec::new();
    for l in sqlx::query!(
        "SELECT brique_id, connue_le FROM exemplaire WHERE joueur_id = $1",
        joueur
    )
    .fetch_all(&mut *tx)
    .await?
    {
        let brique = id(&l.brique_id)?;
        if jeu.ricochets.briques.contains_key(&brique) {
            cartes.push((brique, l.connue_le));
        }
    }
    for l in sqlx::query!(
        "SELECT mot_id, decouverte_le FROM decouverte WHERE joueur_id = $1",
        joueur
    )
    .fetch_all(&mut *tx)
    .await?
    {
        let mot = id(&l.mot_id)?;
        if jeu.ricochets.mots.contains_key(&mot) {
            cartes.push((mot, l.decouverte_le));
        }
    }
    Ok(cartes)
}

/// Vrai si la carte est dans la réserve (brique, même épuisée) ou le codex (mot).
pub async fn est_trouvee(
    tx: &mut PgConnection,
    joueur: Uuid,
    unite: &IdCatalogue,
) -> Result<bool, ErreurApi> {
    Ok(if est_brique(unite) {
        sqlx::query_scalar!(
            "SELECT true FROM exemplaire WHERE joueur_id = $1 AND brique_id = $2",
            joueur,
            unite.as_str()
        )
        .fetch_optional(tx)
        .await?
        .is_some()
    } else {
        sqlx::query_scalar!(
            "SELECT true FROM decouverte WHERE joueur_id = $1 AND mot_id = $2",
            joueur,
            unite.as_str()
        )
        .fetch_optional(tx)
        .await?
        .is_some()
    })
}

/// Applique la réponse à la carte (`etymo_domaine::ricochet::repondre`) et compte
/// la réponse parmi les cinq premières du jour. Renvoie la carte après la réponse.
pub async fn enregistrer(
    tx: &mut PgConnection,
    joueur: Uuid,
    unite: &IdCatalogue,
    juste: bool,
    maintenant: DateTime<Utc>,
) -> Result<Carte, ErreurApi> {
    let aujourd_hui = maintenant.date_naive();
    let avant = lire(&mut *tx, joueur)
        .await?
        .remove(unite)
        .unwrap_or_else(|| Carte::neuve(aujourd_hui));
    let apres = ricochet::repondre(avant, juste, aujourd_hui);
    // La maîtrise est définitive : `maitrisee_le` garde sa première date.
    let maitrisee_le = apres.maitrisee.then_some(maintenant);
    sqlx::query!(
        "INSERT INTO ricochet (joueur_id, unite_id, niveau, bonnes_niveau_3, prochaine_revision, maitrisee_le)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (joueur_id, unite_id) DO UPDATE SET
             niveau = EXCLUDED.niveau,
             bonnes_niveau_3 = EXCLUDED.bonnes_niveau_3,
             prochaine_revision = EXCLUDED.prochaine_revision,
             maitrisee_le = COALESCE(ricochet.maitrisee_le, EXCLUDED.maitrisee_le)",
        joueur,
        unite.as_str(),
        i16::from(apres.niveau),
        i16::from(apres.bonnes_niveau_3),
        apres.prochaine_revision,
        maitrisee_le,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "INSERT INTO ricochet_jour (joueur_id, jour, reponses, bonnes) VALUES ($1, $2, 1, $3)
         ON CONFLICT (joueur_id, jour) DO UPDATE SET
             reponses = LEAST(ricochet_jour.reponses + 1, 5),
             bonnes = ricochet_jour.bonnes + $3
         WHERE ricochet_jour.reponses < 5",
        joueur,
        aujourd_hui,
        i16::from(juste),
    )
    .execute(&mut *tx)
    .await?;
    Ok(apres)
}

/// Réponses du jour, pour les quêtes.
pub async fn du_jour(
    tx: &mut PgConnection,
    joueur: Uuid,
    aujourd_hui: NaiveDate,
) -> Result<RicochetsDuJour, ErreurApi> {
    let (reponses, bonnes) = sqlx::query!(
        "SELECT reponses, bonnes FROM ricochet_jour WHERE joueur_id = $1 AND jour = $2",
        joueur,
        aujourd_hui
    )
    .fetch_optional(tx)
    .await?
    .map_or((0, 0), |l| (octet(l.reponses), octet(l.bonnes)));
    Ok(RicochetsDuJour { reponses, bonnes })
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;
    use etymo_catalogue::{BriqueRicochet, MotRicochet};

    use super::*;

    fn brique(n: u32) -> IdCatalogue {
        format!("brq_{n:08}").parse().unwrap()
    }
    fn sens(n: u32) -> IdCatalogue {
        format!("sns_{n:08}").parse().unwrap()
    }
    fn mot(n: u32) -> IdCatalogue {
        format!("unt_{n:08}").parse().unwrap()
    }

    /// 6 briques (les n°5 et 6 partagent la classe de sens du n°1), 6 mots
    /// dont deux de même sens littéral, deux qui se découpent.
    fn jeu() -> Jeu {
        let mut jeu = Jeu::default();
        for n in 1..=6u32 {
            let classe = if n >= 5 { 1 } else { n };
            jeu.ricochets.briques.insert(
                brique(n),
                BriqueRicochet {
                    id: brique(n),
                    sens_id: sens(n),
                    classe_sens: sens(classe),
                },
            );
            let classe = if n == 6 { 1 } else { n };
            jeu.ricochets.mots.insert(
                mot(n),
                MotRicochet {
                    id: mot(n),
                    classe_litteral: Some(mot(classe)),
                    coupes: if n <= 2 { vec![3] } else { vec![] },
                },
            );
        }
        jeu
    }

    fn ordre() -> Vec<IdCatalogue> {
        (1..=6).flat_map(|n| [brique(n), mot(n)]).collect()
    }

    #[test]
    fn une_seance_compte_cinq_questions_sur_des_cartes_distinctes() {
        let jeu = jeu();
        for graine in 0..200 {
            let questions = tirer(&jeu, &ordre(), &mut Hasard::nouveau(graine));
            assert_eq!(questions.len(), QUESTIONS, "graine {graine}");
            let cartes: Vec<_> = questions.iter().flat_map(|q| &q.cartes).collect();
            assert_eq!(cartes.len(), cartes.iter().collect::<HashSet<_>>().len());
        }
    }

    #[test]
    fn les_choix_contiennent_la_cible_et_jamais_deux_cartes_de_meme_classe() {
        let jeu = jeu();
        for graine in 0..200 {
            for q in tirer(&jeu, &ordre(), &mut Hasard::nouveau(graine)) {
                let cible = &q.cartes[0];
                match q.format {
                    FormatRicochet::SensBrique => {
                        assert!(q.choix.contains(&jeu.ricochets.briques[cible].sens_id));
                        let classes: HashSet<_> = q
                            .choix
                            .iter()
                            .map(|s| {
                                let b = jeu.ricochets.briques.values().find(|b| b.sens_id == *s);
                                &b.unwrap().classe_sens
                            })
                            .collect();
                        assert_eq!(classes.len(), q.choix.len());
                        assert!((2..=4).contains(&q.choix.len()));
                    }
                    FormatRicochet::BriqueSens => {
                        assert!(q.choix.contains(cible));
                        let classes: HashSet<_> = q
                            .choix
                            .iter()
                            .map(|b| &jeu.ricochets.briques[b].classe_sens)
                            .collect();
                        assert_eq!(classes.len(), q.choix.len());
                    }
                    FormatRicochet::MotSens => {
                        assert!(q.choix.contains(cible));
                        let classes: HashSet<_> = q
                            .choix
                            .iter()
                            .map(|m| jeu.ricochets.mots[m].classe_litteral.as_ref())
                            .collect();
                        assert_eq!(classes.len(), q.choix.len());
                    }
                    FormatRicochet::Paires => {
                        assert_eq!(q.cartes.len(), PAIRES);
                        let classes: HashSet<_> = q
                            .cartes
                            .iter()
                            .map(|b| &jeu.ricochets.briques[b].classe_sens)
                            .collect();
                        assert_eq!(classes.len(), PAIRES);
                    }
                    FormatRicochet::Decouper => assert!(q.choix.is_empty()),
                }
            }
        }
    }

    #[test]
    fn peu_de_cartes_peu_de_questions() {
        let jeu = jeu();
        assert!(tirer(&jeu, &[brique(1)], &mut Hasard::nouveau(1)).is_empty());
        // Deux briques de même classe ne se posent pas de leurre l'une à l'autre.
        assert!(tirer(&jeu, &[brique(1), brique(5)], &mut Hasard::nouveau(1)).is_empty());
        // Deux briques : chacune est cible à son tour, avec l'autre pour seul leurre.
        let deux = tirer(&jeu, &[brique(1), brique(2)], &mut Hasard::nouveau(1));
        assert_eq!(deux.len(), 2);
        assert!(deux.iter().all(|q| q.choix.len() == 2));
    }

    #[test]
    fn ordre_a_revoir_puis_neuves_puis_pas_echues() {
        let jour = |j| NaiveDate::from_ymd_opt(2026, 10, j).unwrap();
        let heure = |h| Utc.with_ymd_and_hms(2026, 10, 1, h, 0, 0).unwrap();
        let revision = |j| {
            Some(Carte {
                prochaine_revision: jour(j),
                ..Carte::neuve(jour(1))
            })
        };
        let ordre = ordonner(
            vec![
                (brique(1), revision(9), heure(0)), // pas échue
                (brique(2), revision(4), heure(0)), // à revoir, récente
                (mot(3), None, heure(5)),           // neuve, récente
                (mot(4), revision(2), heure(0)),    // à revoir, ancienne
                (mot(5), None, heure(9)),           // neuve, plus récente
                (brique(6), revision(7), heure(0)), // pas échue, plus proche
            ],
            jour(5),
        );
        assert_eq!(
            ordre,
            vec![mot(4), brique(2), mot(5), mot(3), brique(6), brique(1)]
        );
    }

    #[test]
    fn jugement_par_format() {
        let jeu = jeu();
        let choix = |i: IdCatalogue| ReponseJoueur::Choix(i);
        // Sens d'une brique : le sien, ou celui d'une brique de même classe.
        assert!(
            juger(
                &jeu,
                FormatRicochet::SensBrique,
                &brique(1),
                &choix(sens(1))
            )
            .unwrap()
        );
        assert!(
            juger(
                &jeu,
                FormatRicochet::SensBrique,
                &brique(1),
                &choix(sens(5))
            )
            .unwrap()
        );
        assert!(
            !juger(
                &jeu,
                FormatRicochet::SensBrique,
                &brique(1),
                &choix(sens(2))
            )
            .unwrap()
        );
        assert!(juger(&jeu, FormatRicochet::Paires, &brique(2), &choix(sens(2))).unwrap());
        // Brique d'un sens.
        assert!(
            juger(
                &jeu,
                FormatRicochet::BriqueSens,
                &brique(1),
                &choix(brique(6))
            )
            .unwrap()
        );
        assert!(
            !juger(
                &jeu,
                FormatRicochet::BriqueSens,
                &brique(1),
                &choix(brique(3))
            )
            .unwrap()
        );
        // Mot d'un sens littéral.
        assert!(juger(&jeu, FormatRicochet::MotSens, &mot(1), &choix(mot(6))).unwrap());
        assert!(!juger(&jeu, FormatRicochet::MotSens, &mot(1), &choix(mot(2))).unwrap());
        // Découper : l'ordre et les doublons ne comptent pas.
        let coupes = |c: &[u32]| ReponseJoueur::Coupes(c.to_vec());
        assert!(juger(&jeu, FormatRicochet::Decouper, &mot(1), &coupes(&[3, 3])).unwrap());
        assert!(!juger(&jeu, FormatRicochet::Decouper, &mot(1), &coupes(&[2])).unwrap());
    }

    #[test]
    fn jugement_refuse_l_inconnu_et_les_formes_incompatibles() {
        let jeu = jeu();
        let inconnue = brique(99);
        let choix = ReponseJoueur::Choix(sens(1));
        assert!(matches!(
            juger(&jeu, FormatRicochet::SensBrique, &inconnue, &choix),
            Err(ErreurApi::Interdit(_))
        ));
        // Une brique n'est pas un mot.
        assert!(matches!(
            juger(
                &jeu,
                FormatRicochet::MotSens,
                &brique(1),
                &ReponseJoueur::Choix(mot(1))
            ),
            Err(ErreurApi::Interdit(_))
        ));
        assert!(matches!(
            juger(
                &jeu,
                FormatRicochet::SensBrique,
                &brique(1),
                &ReponseJoueur::Coupes(vec![1])
            ),
            Err(ErreurApi::RequeteInvalide(_))
        ));
        assert!(matches!(
            juger(
                &jeu,
                FormatRicochet::Decouper,
                &mot(3),
                &ReponseJoueur::Coupes(vec![1])
            ),
            Err(ErreurApi::RequeteInvalide(_))
        ));
        assert!(matches!(
            juger(
                &jeu,
                FormatRicochet::Decouper,
                &mot(1),
                &ReponseJoueur::Coupes(vec![1; 9])
            ),
            Err(ErreurApi::RequeteInvalide(_))
        ));
    }
}
