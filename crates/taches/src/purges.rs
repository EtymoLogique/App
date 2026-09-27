//! Purges quotidiennes des données à durée limitée (ADR 0024) : les commandes
//! traitées sont gardées 30 jours pour l'idempotence et le support.

use sqlx::PgPool;

/// Durée de conservation des commandes traitées.
pub const JOURS_COMMANDES: i32 = 30;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RapportPurge {
    pub commandes: u64,
}

pub async fn purger(base: &PgPool) -> Result<RapportPurge, sqlx::Error> {
    let commandes = sqlx::query!(
        "DELETE FROM commande WHERE recue_le < now() - make_interval(days => $1)",
        JOURS_COMMANDES
    )
    .execute(base)
    .await?
    .rows_affected();
    tracing::info!(commandes, "purge terminée");
    Ok(RapportPurge { commandes })
}
