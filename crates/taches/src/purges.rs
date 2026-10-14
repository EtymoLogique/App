//! Purges quotidiennes des données à durée limitée (ADR 0010, ADR 0024).
//!
//! | Donnée | Conservation | Pourquoi |
//! |---|---|---|
//! | `commande` | 30 jours | idempotence et support |
//! | `quete_jour` | 30 jours | les quêtes du jour ne servent que le jour même ; on garde un mois pour le support, sauf une quête faite dont la récompense attend (ADR 0063) |
//! | `ricochet_jour` | 30 jours | réponses du jour comptées pour les quêtes |
//! | `defi_connexion` | 1 jour | lien et code de connexion, valables 15 minutes (ADR 0070) |
//! | `joueur` sans `compte` | 6 mois sans activité | partie invitée abandonnée ; un compte n'est jamais effacé sans demande du joueur (ADR 0070) |
//!
//! Le reste est la progression du joueur (codex, réserve, tampons, cartes de
//! ricochets, mouvements) : il se garde tant que le profil existe. La
//! télémétrie brute (90 jours) et les agrégats viendront avec leurs tables.

use sqlx::PgPool;

/// Durée de conservation des commandes traitées.
pub const JOURS_COMMANDES: i32 = 30;
/// Durée de conservation des données du jour (quêtes et réponses de ricochets).
pub const JOURS_DONNEES_DU_JOUR: i32 = 30;
/// Inactivité après laquelle une partie invitée, sans compte, est effacée.
pub const MOIS_INVITE_INACTIF: i32 = 6;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RapportPurge {
    pub commandes: u64,
    pub quetes_du_jour: u64,
    pub ricochets_du_jour: u64,
    pub defis_connexion: u64,
    pub invites_inactifs: u64,
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
        "DELETE FROM quete_jour WHERE jour < (now() AT TIME ZONE 'UTC')::date - $1::int
           AND (faite_le IS NULL OR recupere_le IS NOT NULL)",
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
    let defis_connexion =
        sqlx::query!("DELETE FROM defi_connexion WHERE cree_le < now() - interval '1 day'")
            .execute(base)
            .await?
            .rows_affected();
    // Tout part en cascade : appareil, codex, réserve, encre…
    let invites_inactifs = sqlx::query!(
        "DELETE FROM joueur j WHERE NOT EXISTS (SELECT 1 FROM compte c WHERE c.joueur_id = j.id)
           AND j.derniere_activite < now() - make_interval(months => $1)",
        MOIS_INVITE_INACTIF
    )
    .execute(base)
    .await?
    .rows_affected();
    tracing::info!(
        commandes,
        quetes_du_jour,
        ricochets_du_jour,
        defis_connexion,
        invites_inactifs,
        "purge terminée"
    );
    Ok(RapportPurge {
        commandes,
        quetes_du_jour,
        ricochets_du_jour,
        defis_connexion,
        invites_inactifs,
    })
}
