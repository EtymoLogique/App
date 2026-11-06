//! Quêtes du jour (ADR 0045) : trois quêtes par jour GMT, une de chaque sorte
//! (table, mémoire, adresse), tirées par le serveur à la première visite du
//! jour parmi celles que l'état du joueur rend faisables. Aucune ne dépend de
//! l'énergie, du hasard du jeu ni d'un mot légendaire.
//!
//! La liste des six quêtes est fermée et écrite ici : l'ADR 0045 les veut
//! déclarées par le catalogue (écart noté dans la roadmap).

use std::collections::{HashMap, HashSet};

use chrono::{Datelike, NaiveDate, Utc};
use etymo_catalogue::{Difficulte, Jeu};
use etymo_contrat::{
    CodeQueteDuJour as Code, FormatRicochet, QueteDuJour, RecompenseQuete, SorteQueteDuJour,
};
use etymo_domaine::IdCatalogue;
use sqlx::PgConnection;
use uuid::Uuid;

use crate::carte_lecteur;
use crate::erreur::ErreurApi;
use crate::progression;
use crate::ricochets::{self, Hasard};

const fn texte(code: Code) -> &'static str {
    match code {
        Code::TableSens => "table_sens",
        Code::MemoireSansFaute => "memoire_sans_faute",
        Code::MemoireLitteral => "memoire_litteral",
        Code::MemoireMaitrise => "memoire_maitrise",
        Code::AdresseDecouper => "adresse_decouper",
        Code::AdressePaires => "adresse_paires",
    }
}

fn depuis(texte_code: &str) -> Option<Code> {
    [
        Code::TableSens,
        Code::MemoireSansFaute,
        Code::MemoireLitteral,
        Code::MemoireMaitrise,
        Code::AdresseDecouper,
        Code::AdressePaires,
    ]
    .into_iter()
    .find(|c| texte(*c) == texte_code)
}

const fn sorte(code: Code) -> SorteQueteDuJour {
    match code {
        Code::TableSens => SorteQueteDuJour::Table,
        Code::MemoireSansFaute | Code::MemoireLitteral | Code::MemoireMaitrise => {
            SorteQueteDuJour::Memoire
        }
        Code::AdresseDecouper | Code::AdressePaires => SorteQueteDuJour::Adresse,
    }
}

/// Récompense de chaque sorte (ADR 0063), valeurs de départ à simuler.
#[must_use]
pub const fn recompense(sorte: SorteQueteDuJour) -> RecompenseQuete {
    let (gouttes, sabliers, plis) = match sorte {
        SorteQueteDuJour::Table => (5, 0, 0),
        SorteQueteDuJour::Memoire => (0, 1, 0),
        SorteQueteDuJour::Adresse => (0, 0, 1),
    };
    RecompenseQuete {
        gouttes,
        sabliers,
        plis,
    }
}

const fn cible(code: Code) -> u8 {
    match code {
        Code::TableSens | Code::MemoireMaitrise => 1,
        Code::AdresseDecouper | Code::MemoireLitteral => 3,
        Code::AdressePaires => 4,
        Code::MemoireSansFaute => 5,
    }
}

/// Progression d'une quête après une réponse. Une suite sans faute retombe à
/// zéro à la première erreur et se recommence aussitôt (ADR 0045).
#[must_use]
pub fn suite(
    code: Code,
    progres: u8,
    format: FormatRicochet,
    juste: bool,
    nouvelle_maitrise: bool,
) -> u8 {
    let serie = |concerne: bool| {
        if !concerne {
            progres
        } else if juste {
            progres + 1
        } else {
            0
        }
    };
    match code {
        Code::TableSens => progres,
        Code::MemoireSansFaute => serie(true),
        Code::MemoireLitteral => progres + u8::from(juste && format == FormatRicochet::MotSens),
        Code::MemoireMaitrise => progres.max(u8::from(nouvelle_maitrise)),
        Code::AdresseDecouper => serie(format == FormatRicochet::Decouper),
        Code::AdressePaires => serie(format == FormatRicochet::Paires),
    }
    .min(cible(code))
}

/// Ce que l'état du joueur rend faisable ce jour-là.
#[derive(Debug, Default)]
pub struct Faisables {
    /// Mots trouvés qui portent un sens littéral.
    pub litteral: usize,
    /// Mots trouvés qui se découpent.
    pub decoupables: usize,
    /// Briques connues dont le sens se juge.
    pub briques: usize,
    /// Une carte n'est plus qu'à un ricochet de la maîtrise.
    pub proche_maitrise: bool,
    /// Mots que la réserve permet de découvrir, avec leur difficulté.
    pub table: Vec<(IdCatalogue, Option<Difficulte>)>,
}

/// Les quêtes du jour : `(rang, code, mot visé)`. Déterministe pour un joueur
/// et un jour. La quête de table cède sa place à une seconde quête de mémoire
/// quand la réserve ne permet aucune découverte ; la difficulté des mots
/// (ADR 0047) fait tourner le tirage entre les trois tiers.
#[must_use]
pub fn tirer(graine: u64, jour: NaiveDate, f: &Faisables) -> Vec<(u8, Code, Option<IdCatalogue>)> {
    let mut hasard =
        Hasard::nouveau(graine ^ u64::from(jour.num_days_from_ce().unsigned_abs()) << 20);
    let mut memoire = vec![Code::MemoireSansFaute];
    if f.litteral >= 3 {
        memoire.push(Code::MemoireLitteral);
    }
    if f.proche_maitrise {
        memoire.push(Code::MemoireMaitrise);
    }
    let mut adresse = Vec::new();
    if f.decoupables >= 3 {
        adresse.push(Code::AdresseDecouper);
    }
    if f.briques >= 4 {
        adresse.push(Code::AdressePaires);
    }
    let mut tirage = Vec::new();
    let mut table = f.table.clone();
    table.sort_by(|a, b| a.0.cmp(&b.0));
    let tiers = [Difficulte::Facile, Difficulte::Moyen, Difficulte::Difficile]
        [usize::try_from(jour.num_days_from_ce().rem_euclid(3)).unwrap_or(0)];
    let voulus: Vec<_> = table.iter().filter(|(_, d)| *d == Some(tiers)).collect();
    let choix = if voulus.is_empty() {
        table.iter().collect()
    } else {
        voulus
    };
    let mot = (!choix.is_empty()).then(|| choix[hasard.jusqu_a(choix.len())].0.clone());
    match mot {
        Some(mot) => tirage.push((0, Code::TableSens, Some(mot))),
        None => {
            if memoire.len() > 1 {
                let i = hasard.jusqu_a(memoire.len());
                tirage.push((0, memoire.remove(i), None));
            }
        }
    }
    let i = hasard.jusqu_a(memoire.len());
    tirage.push((1, memoire.remove(i), None));
    if !adresse.is_empty() {
        let i = hasard.jusqu_a(adresse.len());
        tirage.push((2, adresse.remove(i), None));
    }
    tirage
}

fn id(texte_id: &str) -> Result<IdCatalogue, ErreurApi> {
    texte_id
        .parse()
        .map_err(|_| ErreurApi::Interne(format!("identifiant stocké invalide : {texte_id}")))
}

async fn faisables(
    tx: &mut PgConnection,
    joueur: Uuid,
    jeu: &Jeu,
    jour: NaiveDate,
) -> Result<Faisables, ErreurApi> {
    let mut f = Faisables::default();
    for (carte, _) in ricochets::cartes_du_joueur(&mut *tx, joueur, jeu).await? {
        if let Some(mot) = jeu.ricochets.mots.get(&carte) {
            f.litteral += usize::from(mot.classe_litteral.is_some());
            f.decoupables += usize::from(!mot.coupes.is_empty());
        } else {
            f.briques += 1;
        }
    }
    f.proche_maitrise = ricochets::lire(&mut *tx, joueur)
        .await?
        .values()
        .any(|c| !c.maitrisee && c.niveau == 3 && c.bonnes_niveau_3 == 2 && c.a_revoir(jour));
    let mut reserve: HashMap<IdCatalogue, i16> = HashMap::new();
    for l in sqlx::query!(
        "SELECT brique_id, nombre FROM exemplaire WHERE joueur_id = $1 AND nombre > 0",
        joueur
    )
    .fetch_all(&mut *tx)
    .await?
    {
        reserve.insert(id(&l.brique_id)?, l.nombre);
    }
    let trouves: HashSet<String> =
        sqlx::query_scalar!("SELECT mot_id FROM decouverte WHERE joueur_id = $1", joueur)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .collect();
    // La quête de table ne vise qu'un mot d'un fascicule débloqué (ADR 0068).
    let debloques = progression::fascicules_debloques(&mut *tx, joueur).await?;
    let ouverts: HashSet<&IdCatalogue> = jeu
        .jalons
        .iter()
        .filter(|f| debloques.contains(&f.fascicule_id))
        .flat_map(|f| &f.mots)
        .collect();
    let mut deja = HashSet::new();
    for recette in &jeu.recettes {
        // `ricochets.mots` écarte déjà les mots légendaires ou qui en exigent une.
        if !ouverts.contains(&recette.mot_id)
            || !jeu.ricochets.mots.contains_key(&recette.mot_id)
            || trouves.contains(recette.mot_id.as_str())
            || deja.contains(&recette.mot_id)
        {
            continue;
        }
        let mut restant = reserve.clone();
        let permise = recette.emplacements.iter().all(|acceptees| {
            acceptees
                .iter()
                .find(|b| !jeu.legendaires.contains(*b) && restant.get(*b).is_some_and(|n| *n > 0))
                .is_some_and(|b| {
                    *restant.entry(b.clone()).or_default() -= 1;
                    true
                })
        });
        if permise {
            deja.insert(recette.mot_id.clone());
            f.table.push((
                recette.mot_id.clone(),
                jeu.difficultes.get(&recette.mot_id).copied(),
            ));
        }
    }
    Ok(f)
}

fn graine(joueur: Uuid) -> u64 {
    let octets = joueur.as_bytes();
    u64::from_le_bytes([
        octets[0], octets[1], octets[2], octets[3], octets[4], octets[5], octets[6], octets[7],
    ])
}

/// Les quêtes du jour, tirées à la première visite du jour GMT puis mises à
/// jour : la quête de table est faite dès que son mot est dans le codex.
pub async fn du_jour(
    tx: &mut PgConnection,
    joueur: Uuid,
    jeu: Option<&Jeu>,
    jour: NaiveDate,
) -> Result<Vec<QueteDuJour>, ErreurApi> {
    let existantes = sqlx::query_scalar!(
        "SELECT count(*) FROM quete_jour WHERE joueur_id = $1 AND jour = $2",
        joueur,
        jour
    )
    .fetch_one(&mut *tx)
    .await?
    .unwrap_or(0);
    if existantes == 0 {
        // Sans catalogue, rien n'est faisable : on tirera à la prochaine visite.
        let Some(jeu) = jeu else {
            return Ok(Vec::new());
        };
        let f = faisables(&mut *tx, joueur, jeu, jour).await?;
        for (rang, code, mot) in tirer(graine(joueur), jour, &f) {
            sqlx::query!(
                "INSERT INTO quete_jour (joueur_id, jour, rang, code, cible_id) VALUES ($1, $2, $3, $4, $5)",
                joueur,
                jour,
                i16::from(rang),
                texte(code),
                mot.as_ref().map(IdCatalogue::as_str),
            )
            .execute(&mut *tx)
            .await?;
        }
    }
    let debut = jour.and_time(chrono::NaiveTime::MIN).and_utc();
    sqlx::query!(
        "UPDATE quete_jour q SET progres = 1, faite_le = now()
         WHERE q.joueur_id = $1 AND q.jour = $2 AND q.code = 'table_sens' AND q.faite_le IS NULL
           AND EXISTS (SELECT 1 FROM decouverte d
                       WHERE d.joueur_id = q.joueur_id AND d.mot_id = q.cible_id AND d.decouverte_le >= $3)",
        joueur,
        jour,
        debut
    )
    .execute(&mut *tx)
    .await?;
    // Un tampon par jour au plus, quand toutes les quêtes tirées sont faites.
    let faites = sqlx::query_scalar!(
        "SELECT count(*) FILTER (WHERE faite_le IS NOT NULL) = count(*) AND count(*) >= 2
         FROM quete_jour WHERE joueur_id = $1 AND jour = $2",
        joueur,
        jour
    )
    .fetch_one(&mut *tx)
    .await?
    .unwrap_or(false);
    if faites {
        carte_lecteur::tamponner(&mut *tx, joueur, jour).await?;
    }
    sqlx::query!(
        "SELECT jour, rang, code, cible_id, progres, faite_le, recupere_le FROM quete_jour
         WHERE joueur_id = $1
           AND (jour = $2 OR (jour < $2 AND faite_le IS NOT NULL AND recupere_le IS NULL))
         ORDER BY jour, rang",
        joueur,
        jour
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|l| {
        let code = depuis(&l.code)
            .ok_or_else(|| ErreurApi::Interne(format!("quête du jour inconnue : {}", l.code)))?;
        Ok(QueteDuJour {
            rang: u8::try_from(l.rang).unwrap_or(0),
            sorte: sorte(code),
            code,
            mot_id: l.cible_id.as_deref().map(id).transpose()?,
            cible: cible(code),
            progres: u8::try_from(l.progres).unwrap_or(0),
            faite: l.faite_le.is_some(),
            jour: Some(l.jour),
            recuperee: l.recupere_le.is_some(),
            recompense: Some(recompense(sorte(code))),
        })
    })
    .collect()
}

/// Marque la récompense d'une quête du jour comme prise et rend sa sorte.
/// `403` : quête pas faite ; `409` : déjà récupérée.
pub async fn reclamer(
    tx: &mut PgConnection,
    joueur: Uuid,
    jour: NaiveDate,
    rang: u8,
) -> Result<SorteQueteDuJour, ErreurApi> {
    let prise = sqlx::query_scalar!(
        "UPDATE quete_jour SET recupere_le = now()
         WHERE joueur_id = $1 AND jour = $2 AND rang = $3
           AND faite_le IS NOT NULL AND recupere_le IS NULL RETURNING code",
        joueur,
        jour,
        i16::from(rang)
    )
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(code) = prise {
        let code = depuis(&code)
            .ok_or_else(|| ErreurApi::Interne(format!("quête du jour inconnue : {code}")))?;
        return Ok(sorte(code));
    }
    let faite = sqlx::query_scalar!(
        "SELECT faite_le IS NOT NULL FROM quete_jour WHERE joueur_id = $1 AND jour = $2 AND rang = $3",
        joueur,
        jour,
        i16::from(rang)
    )
    .fetch_optional(tx)
    .await?
    .flatten();
    Err(if faite == Some(true) {
        ErreurApi::Conflit("quête du jour déjà récupérée")
    } else {
        ErreurApi::Interdit("quête du jour pas faite")
    })
}

/// Compte une réponse de ricochet pour les quêtes du jour non faites.
pub async fn compter(
    tx: &mut PgConnection,
    joueur: Uuid,
    format: FormatRicochet,
    juste: bool,
    nouvelle_maitrise: bool,
) -> Result<(), ErreurApi> {
    let jour = Utc::now().date_naive();
    for l in sqlx::query!(
        "SELECT rang, code, progres FROM quete_jour
         WHERE joueur_id = $1 AND jour = $2 AND faite_le IS NULL AND code <> 'table_sens'",
        joueur,
        jour
    )
    .fetch_all(&mut *tx)
    .await?
    {
        let Some(code) = depuis(&l.code) else {
            continue;
        };
        let avant = u8::try_from(l.progres).unwrap_or(0);
        let apres = suite(code, avant, format, juste, nouvelle_maitrise);
        if apres != avant {
            sqlx::query!(
                "UPDATE quete_jour SET progres = $4,
                    faite_le = CASE WHEN $5 THEN now() END
                 WHERE joueur_id = $1 AND jour = $2 AND rang = $3",
                joueur,
                jour,
                l.rang,
                i16::from(apres),
                apres >= cible(code),
            )
            .execute(&mut *tx)
            .await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mot(n: u32) -> IdCatalogue {
        format!("unt_{n:08}").parse().unwrap()
    }

    fn jour(j: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, j).unwrap()
    }

    fn riche() -> Faisables {
        Faisables {
            litteral: 5,
            decoupables: 5,
            briques: 8,
            proche_maitrise: true,
            table: (1..=6).map(|n| (mot(n), None)).collect(),
        }
    }

    #[test]
    fn trois_quetes_une_de_chaque_sorte_et_deterministes() {
        for j in 1..=28 {
            let a = tirer(7, jour(j), &riche());
            assert_eq!(a, tirer(7, jour(j), &riche()), "jour {j}");
            let sortes: Vec<_> = a.iter().map(|(_, c, _)| sorte(*c)).collect();
            assert_eq!(
                sortes,
                [
                    SorteQueteDuJour::Table,
                    SorteQueteDuJour::Memoire,
                    SorteQueteDuJour::Adresse
                ]
            );
            assert!(a[0].2.is_some() && a[1].2.is_none());
        }
    }

    #[test]
    fn sans_decouverte_possible_la_table_cede_a_une_seconde_memoire() {
        let f = Faisables {
            table: vec![],
            ..riche()
        };
        for j in 1..=28 {
            let t = tirer(3, jour(j), &f);
            let sortes: Vec<_> = t.iter().map(|(_, c, _)| sorte(*c)).collect();
            assert_eq!(
                sortes,
                [
                    SorteQueteDuJour::Memoire,
                    SorteQueteDuJour::Memoire,
                    SorteQueteDuJour::Adresse
                ]
            );
            assert_ne!(t[0].1, t[1].1);
        }
    }

    #[test]
    fn pas_de_quete_infaisable() {
        let f = Faisables {
            briques: 2,
            ..Faisables::default()
        };
        let t = tirer(1, jour(1), &f);
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].1, Code::MemoireSansFaute);
    }

    #[test]
    fn les_suites_sans_faute_repartent_de_zero() {
        let f = FormatRicochet::Decouper;
        assert_eq!(suite(Code::AdresseDecouper, 2, f, true, false), 3);
        assert_eq!(suite(Code::AdresseDecouper, 2, f, false, false), 0);
        // Une erreur à un autre format ne casse pas la suite.
        assert_eq!(
            suite(
                Code::AdresseDecouper,
                2,
                FormatRicochet::Paires,
                false,
                false
            ),
            2
        );
        assert_eq!(suite(Code::MemoireSansFaute, 4, f, true, false), 5);
        assert_eq!(suite(Code::MemoireSansFaute, 4, f, false, false), 0);
        assert_eq!(suite(Code::MemoireSansFaute, 5, f, true, false), 5);
        assert_eq!(
            suite(
                Code::MemoireLitteral,
                1,
                FormatRicochet::MotSens,
                true,
                false
            ),
            2
        );
        assert_eq!(suite(Code::MemoireLitteral, 1, f, true, false), 1);
        assert_eq!(suite(Code::MemoireMaitrise, 0, f, true, true), 1);
    }
}
