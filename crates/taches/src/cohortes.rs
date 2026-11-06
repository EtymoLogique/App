//! Cohortes de rétention et indicateurs agrégés (ADR 0050), sans donnée
//! personnelle : les tâches ne gardent que des nombres, jamais un identifiant
//! de joueur. Aucun agrégat de moins de 50 joueurs n'est affiché ni exporté.
//!
//! La tâche quotidienne se lance **juste après minuit GMT** pour le jour qui
//! vient de s'achever : `derniere_activite` ne garde que la dernière visite,
//! un joueur revenu depuis ne serait plus compté ce jour-là. De même la tâche
//! mensuelle se lance dans les premières minutes du mois suivant.

use chrono::{Datelike, Days, Months, NaiveDate, Utc};
use serde::Serialize;
use sqlx::PgPool;

/// Taille minimale d'un agrégat pour être affiché ou exporté (ADR 0050).
pub const SEUIL: i64 = 50;

/// Un nombre n'est montré que si le groupe qu'il décrit compte au moins `SEUIL` joueurs.
#[must_use]
pub fn masquer(valeur: i64, groupe: i64) -> Option<i64> {
    (groupe >= SEUIL).then_some(valeur)
}

/// Veille du jour courant en UTC : le jour que la tâche quotidienne agrège par défaut.
#[must_use]
pub fn hier() -> NaiveDate {
    Utc::now()
        .date_naive()
        .checked_sub_days(Days::new(1))
        .unwrap_or_default()
}

/// Premier jour du mois précédent : le mois que la tâche mensuelle agrège par défaut.
#[must_use]
pub fn mois_precedent() -> NaiveDate {
    premier_du_mois(Utc::now().date_naive())
        .checked_sub_months(Months::new(1))
        .unwrap_or_default()
}

#[must_use]
pub fn premier_du_mois(jour: NaiveDate) -> NaiveDate {
    jour.with_day(1).unwrap_or(jour)
}

/// Agrège un jour GMT achevé : joueurs actifs, indicateurs des quêtes et des
/// ricochets, retour au 1ᵉʳ, 7ᵉ et 30ᵉ jour. Idempotente : la relancer recalcule.
pub async fn agreger_jour(base: &PgPool, jour: NaiveDate) -> Result<(), sqlx::Error> {
    let deux_jours = jour.checked_sub_days(Days::new(2)).unwrap_or(jour);
    sqlx::query!(
        "INSERT INTO indicateurs_jour (jour, joueurs_actifs, sans_decouverte, tampons, quetes_terminees, seances_ricochets)
         SELECT $1::date,
                (SELECT count(*) FROM joueur WHERE (derniere_activite AT TIME ZONE 'UTC')::date = $1::date),
                (SELECT count(*) FROM joueur j
                  WHERE (j.derniere_activite AT TIME ZONE 'UTC')::date = $1::date
                    AND (j.cree_le AT TIME ZONE 'UTC')::date < $2::date
                    AND NOT EXISTS (SELECT 1 FROM decouverte d
                                    WHERE d.joueur_id = j.id AND (d.decouverte_le AT TIME ZONE 'UTC')::date >= $2::date)),
                (SELECT count(*) FROM tampon WHERE jour = $1::date),
                (SELECT count(*) FROM quete_jour WHERE jour = $1::date AND faite_le IS NOT NULL),
                (SELECT count(*) FROM ricochet_jour WHERE jour = $1::date AND reponses = 5)
         ON CONFLICT (jour) DO UPDATE SET
             joueurs_actifs = EXCLUDED.joueurs_actifs, sans_decouverte = EXCLUDED.sans_decouverte,
             tampons = EXCLUDED.tampons, quetes_terminees = EXCLUDED.quetes_terminees,
             seances_ricochets = EXCLUDED.seances_ricochets",
        jour,
        deux_jours
    )
    .execute(base)
    .await?;
    for delai in [1_i16, 7, 30] {
        let cree = jour
            .checked_sub_days(Days::new(u64::try_from(delai).unwrap_or(1)))
            .unwrap_or(jour);
        sqlx::query!(
            "INSERT INTO retour_jour (jour, delai, cohorte, revenus)
             SELECT $1::date, $2::smallint, count(*), count(*) FILTER (WHERE (derniere_activite AT TIME ZONE 'UTC')::date >= $1::date)
             FROM joueur WHERE (cree_le AT TIME ZONE 'UTC')::date = $3::date
             ON CONFLICT (jour, delai) DO UPDATE SET cohorte = EXCLUDED.cohorte, revenus = EXCLUDED.revenus",
            jour,
            delai,
            cree
        )
        .execute(base)
        .await?;
    }
    tracing::info!(%jour, "agrégats du jour écrits");
    Ok(())
}

/// Agrège un mois civil achevé (`mois` : son premier jour) : rétention par mois
/// d'arrivée et passage du mois précédent à celui-ci. Idempotente.
pub async fn agreger_mois(base: &PgPool, mois: NaiveDate) -> Result<(), sqlx::Error> {
    let mois = premier_du_mois(mois);
    let precedent = mois.checked_sub_months(Months::new(1)).unwrap_or(mois);
    sqlx::query!(
        "INSERT INTO retention_mois (mois, mois_arrivee, cohorte, actifs)
         SELECT $1::date, date_trunc('month', cree_le AT TIME ZONE 'UTC')::date, count(*),
                count(*) FILTER (WHERE date_trunc('month', derniere_activite AT TIME ZONE 'UTC')::date = $1::date)
         FROM joueur WHERE date_trunc('month', cree_le AT TIME ZONE 'UTC')::date <= $1::date
         GROUP BY 2
         ON CONFLICT (mois, mois_arrivee) DO UPDATE SET cohorte = EXCLUDED.cohorte, actifs = EXCLUDED.actifs",
        mois
    )
    .execute(base)
    .await?;
    sqlx::query!(
        "INSERT INTO passage_mois (mois, actifs, venus_du_mois_precedent)
         SELECT $1::date, count(*), count(*) FILTER (WHERE mois_activite_precedente = $2::date)
         FROM joueur WHERE date_trunc('month', derniere_activite AT TIME ZONE 'UTC')::date = $1::date
         ON CONFLICT (mois) DO UPDATE SET actifs = EXCLUDED.actifs, venus_du_mois_precedent = EXCLUDED.venus_du_mois_precedent",
        mois,
        precedent
    )
    .execute(base)
    .await?;
    tracing::info!(%mois, "agrégats du mois écrits");
    Ok(())
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Retour {
    pub jour: NaiveDate,
    pub delai: i16,
    pub revenus: Option<i64>,
    pub cohorte: Option<i64>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Retention {
    pub mois: NaiveDate,
    pub mois_arrivee: NaiveDate,
    pub cohorte: Option<i64>,
    pub actifs: Option<i64>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Passage {
    pub mois: NaiveDate,
    pub actifs: Option<i64>,
    pub venus_du_mois_precedent: Option<i64>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Indicateurs {
    pub jour: NaiveDate,
    pub joueurs_actifs: Option<i64>,
    pub sans_decouverte: Option<i64>,
    pub tampons: Option<i64>,
    pub quetes_terminees: Option<i64>,
    pub seances_ricochets: Option<i64>,
}

/// Ce qui peut sortir : tout nombre décrivant moins de `SEUIL` joueurs est absent.
#[derive(Debug, Default, Serialize, PartialEq, Eq)]
pub struct Statistiques {
    pub retours: Vec<Retour>,
    pub retention: Vec<Retention>,
    pub passages: Vec<Passage>,
    pub indicateurs: Vec<Indicateurs>,
}

pub async fn statistiques(base: &PgPool) -> Result<Statistiques, sqlx::Error> {
    let retours =
        sqlx::query!("SELECT jour, delai, cohorte, revenus FROM retour_jour ORDER BY jour, delai")
            .fetch_all(base)
            .await?
            .into_iter()
            .map(|l| {
                let groupe = i64::from(l.cohorte);
                Retour {
                    jour: l.jour,
                    delai: l.delai,
                    revenus: masquer(i64::from(l.revenus), groupe),
                    cohorte: masquer(groupe, groupe),
                }
            })
            .collect();
    let retention = sqlx::query!(
        "SELECT mois, mois_arrivee, cohorte, actifs FROM retention_mois ORDER BY mois, mois_arrivee"
    )
    .fetch_all(base)
    .await?
    .into_iter()
    .map(|l| {
        let groupe = i64::from(l.cohorte);
        Retention {
            mois: l.mois,
            mois_arrivee: l.mois_arrivee,
            cohorte: masquer(groupe, groupe),
            actifs: masquer(i64::from(l.actifs), groupe),
        }
    })
    .collect();
    let passages = sqlx::query!(
        "SELECT mois, actifs, venus_du_mois_precedent FROM passage_mois ORDER BY mois"
    )
    .fetch_all(base)
    .await?
    .into_iter()
    .map(|l| {
        let groupe = i64::from(l.actifs);
        Passage {
            mois: l.mois,
            actifs: masquer(groupe, groupe),
            venus_du_mois_precedent: masquer(i64::from(l.venus_du_mois_precedent), groupe),
        }
    })
    .collect();
    let indicateurs = sqlx::query!(
        "SELECT jour, joueurs_actifs, sans_decouverte, tampons, quetes_terminees, seances_ricochets
         FROM indicateurs_jour ORDER BY jour"
    )
    .fetch_all(base)
    .await?
    .into_iter()
    .map(|l| {
        let groupe = i64::from(l.joueurs_actifs);
        let m = |v: i32| masquer(i64::from(v), groupe);
        Indicateurs {
            jour: l.jour,
            joueurs_actifs: m(l.joueurs_actifs),
            sans_decouverte: m(l.sans_decouverte),
            tampons: m(l.tampons),
            quetes_terminees: m(l.quetes_terminees),
            seances_ricochets: m(l.seances_ricochets),
        }
    })
    .collect();
    Ok(Statistiques {
        retours,
        retention,
        passages,
        indicateurs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_groupe_de_moins_de_cinquante_joueurs_est_masque() {
        assert_eq!(masquer(12, 49), None);
        assert_eq!(masquer(12, 50), Some(12));
        assert_eq!(masquer(0, 0), None);
    }

    #[test]
    fn le_mois_precedent_est_un_premier_du_mois() {
        let m = mois_precedent();
        assert_eq!(m.day(), 1);
        assert!(m < Utc::now().date_naive());
    }
}
