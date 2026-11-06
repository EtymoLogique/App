//! Purges quotidiennes des données à durée limitée (ADR 0010, ADR 0024).
//!
//! | Donnée | Conservation | Pourquoi |
//! |---|---|---|
//! | `commande` | 30 jours | idempotence et support |
//! | `quete_jour` | 30 jours | les quêtes du jour ne servent que le jour même ; on garde un mois pour le support, sauf une quête faite dont la récompense attend (ADR 0063) |
//! | `ricochet_jour` | 30 jours | réponses du jour comptées pour les quêtes |
//! | `defi_connexion` | 1 jour | lien et code de connexion, valables 15 minutes (ADR 0070) |
//! | `joueur` sans `compte` | 6 mois sans activité | partie invitée abandonnée, sans adresse pour la retrouver (ADR 0070) |
//! | `joueur` avec `compte` | 3 ans sans activité | la reprise est improbable ; aucune adresse gardée, donc aucun e-mail d'avertissement (ADR 0071) |
//! | `ouverture_pli` | 12 mois, puis agrégat sans identifiant | diagnostic de l'équilibrage (ADR 0071) ; l'agrégat va dans `plis_agreges` |
//!
//! Le reste est la progression du joueur (codex, réserve, tampons, cartes de
//! ricochets, mouvements) : il se garde tant que le joueur existe. La
//! télémétrie brute (90 jours) et les agrégats viendront avec leurs tables.

use sqlx::PgPool;

/// Durée de conservation des commandes traitées.
pub const JOURS_COMMANDES: i32 = 30;
/// Durée de conservation des données du jour (quêtes et réponses de ricochets).
pub const JOURS_DONNEES_DU_JOUR: i32 = 30;
/// Inactivité après laquelle une partie invitée, sans compte, est effacée.
pub const MOIS_INVITE_INACTIF: i32 = 6;
/// Inactivité après laquelle un compte et sa progression sont effacés (ADR 0071,
/// à confirmer avec le conseil avant la bêta ouverte).
pub const MOIS_COMPTE_INACTIF: i32 = 36;
/// Âge à partir duquel le détail des plis est agrégé puis effacé. Seuls les
/// mois civils entiers passent : le dernier mois agrégé est complet, son
/// décompte de joueurs est exact. Un pli vit donc de 12 à 13 mois.
pub const MOIS_DETAIL_PLIS: i32 = 12;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RapportPurge {
    pub commandes: u64,
    pub quetes_du_jour: u64,
    pub ricochets_du_jour: u64,
    pub defis_connexion: u64,
    pub invites_inactifs: u64,
    pub comptes_inactifs: u64,
    pub plis_agreges: u64,
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
    let comptes_inactifs = sqlx::query!(
        "DELETE FROM joueur j WHERE EXISTS (SELECT 1 FROM compte c WHERE c.joueur_id = j.id)
           AND j.derniere_activite < now() - make_interval(months => $1)",
        MOIS_COMPTE_INACTIF
    )
    .execute(base)
    .await?
    .rows_affected();
    let plis_agreges = agreger_plis(base).await?;
    tracing::info!(
        commandes,
        quetes_du_jour,
        ricochets_du_jour,
        defis_connexion,
        invites_inactifs,
        comptes_inactifs,
        plis_agreges,
        "purge terminée"
    );
    Ok(RapportPurge {
        commandes,
        quetes_du_jour,
        ricochets_du_jour,
        defis_connexion,
        invites_inactifs,
        comptes_inactifs,
        plis_agreges,
    })
}

/// Agrège par mois les plis plus vieux que `MOIS_DETAIL_PLIS`, puis les efface,
/// en une seule requête : un échec ne perd rien. Renvoie le nombre de plis effacés.
async fn agreger_plis(base: &PgPool) -> Result<u64, sqlx::Error> {
    let plis = sqlx::query!(
        "WITH vieux AS (
             DELETE FROM ouverture_pli
              WHERE ouvert_le < date_trunc('month', now() AT TIME ZONE 'UTC' - make_interval(months => $1)) AT TIME ZONE 'UTC'
              RETURNING joueur_id, fascicule_id, origine, resultat, regle, version_equilibrage, ouvert_le
         ), agreges AS (
             INSERT INTO plis_agreges (mois, fascicule_id, origine, resultat, regle, version_equilibrage, plis, joueurs)
             SELECT date_trunc('month', ouvert_le AT TIME ZONE 'UTC')::date, fascicule_id, origine, resultat, regle,
                    version_equilibrage, count(*), count(DISTINCT joueur_id)
               FROM vieux GROUP BY 1, 2, 3, 4, 5, 6
         )
         SELECT count(*) AS \"plis!\" FROM vieux",
        MOIS_DETAIL_PLIS
    )
    .fetch_one(base)
    .await?
    .plis;
    Ok(u64::try_from(plis).unwrap_or(0))
}
