//! Purges quotidiennes des données à durée limitée (ADR 0010, ADR 0024).
//!
//! | Donnée | Conservation | Pourquoi |
//! |---|---|---|
//! | `commande` | 30 jours | idempotence et support |
//! | `quete_jour` | 30 jours | les quêtes du jour ne servent que le jour même ; on garde un mois pour le support |
//! | `ricochet_jour` | 30 jours | réponses du jour comptées pour les quêtes |
//!
//! Le reste est la progression du joueur (codex, réserve, tampons, cartes de
//! ricochets, mouvements) : il se garde tant que le profil existe. La
//! télémétrie brute (90 jours) et les agrégats viendront avec leurs tables.

use sqlx::PgPool;

/// Durée de conservation des commandes traitées.
pub const JOURS_COMMANDES: i32 = 30;
/// Durée de conservation des données du jour (quêtes et réponses de ricochets).
pub const JOURS_DONNEES_DU_JOUR: i32 = 30;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RapportPurge {
    pub commandes: u64,
    pub quetes_du_jour: u64,
    pub ricochets_du_jour: u64,
}

pub async fn purger(base: &PgPool) -> Result<RapportPurge, sqlx::Error> {
    let commandes = sqlx::query!(
        "DELETE FROM commande WHERE recue_le < now() - make_interval(days => $1)",
        JOURS_COMMANDES
    )
    .execute(base)
    .await?
    .rows_affected();
    let quetes_du_jour = sqlx::query!(
        "DELETE FROM quete_jour WHERE jour < (now() AT TIME ZONE 'UTC')::date - $1::int",
        JOURS_DONNEES_DU_JOUR
    )
    .execute(base)
    .await?
    .rows_affected();
    let ricochets_du_jour = sqlx::query!(
        "DELETE FROM ricochet_jour WHERE jour < (now() AT TIME ZONE 'UTC')::date - $1::int",
        JOURS_DONNEES_DU_JOUR
    )
    .execute(base)
    .await?
    .rows_affected();
    tracing::info!(
        commandes,
        quetes_du_jour,
        ricochets_du_jour,
        "purge terminée"
    );
    Ok(RapportPurge {
        commandes,
        quetes_du_jour,
        ricochets_du_jour,
    })
}
