//! Carte de lecteur (ADR 0045) : tampons, récompense d'une carte pleine.
//! Le serveur accorde le tampon dès que les quêtes du jour sont faites ; la
//! récompense se récupère par une commande, une carte à la fois.

use chrono::NaiveDate;
use etymo_contrat::{CarteDeLecteurEtat, RecompenseCarte};
use etymo_domaine::carte_de_lecteur::{self, GOUTTES, PLIS, SABLIERS, TAILLE};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::erreur::ErreurApi;

/// Un tampon pour ce jour GMT, au plus : sans effet s'il est déjà posé.
pub async fn tamponner(
    tx: &mut PgConnection,
    joueur: Uuid,
    jour: NaiveDate,
) -> Result<(), ErreurApi> {
    sqlx::query!(
        "INSERT INTO tampon (joueur_id, jour) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        joueur,
        jour
    )
    .execute(tx)
    .await?;
    Ok(())
}

async fn recuperees(tx: &mut PgConnection, joueur: Uuid) -> Result<u32, ErreurApi> {
    let n = sqlx::query_scalar!(
        "SELECT count(*) FROM carte_lecteur_recuperee WHERE joueur_id = $1",
        joueur
    )
    .fetch_one(tx)
    .await?
    .unwrap_or(0);
    Ok(u32::try_from(n).unwrap_or(u32::MAX))
}

async fn tampons(tx: &mut PgConnection, joueur: Uuid) -> Result<Vec<NaiveDate>, ErreurApi> {
    Ok(sqlx::query_scalar!(
        "SELECT jour FROM tampon WHERE joueur_id = $1 ORDER BY jour",
        joueur
    )
    .fetch_all(tx)
    .await?)
}

/// Cartes pleines, récupérées ou non : ce que compte la quête « lecteur ».
pub async fn remplies(tx: &mut PgConnection, joueur: Uuid) -> Result<u32, ErreurApi> {
    let n = sqlx::query_scalar!("SELECT count(*) FROM tampon WHERE joueur_id = $1", joueur)
        .fetch_one(tx)
        .await?
        .unwrap_or(0);
    Ok(u32::try_from(n).unwrap_or(u32::MAX) / TAILLE)
}

pub async fn etat(tx: &mut PgConnection, joueur: Uuid) -> Result<CarteDeLecteurEtat, ErreurApi> {
    let jours = tampons(&mut *tx, joueur).await?;
    let vue = carte_de_lecteur::vue(
        u32::try_from(jours.len()).unwrap_or(u32::MAX),
        recuperees(&mut *tx, joueur).await?,
    );
    Ok(CarteDeLecteurEtat {
        tampons: jours[vue.debut..vue.fin].to_vec(),
        taille: u8::try_from(TAILLE).unwrap_or(7),
        a_recuperer: vue.a_recuperer,
        remplies: vue.remplies,
        recompense: RecompenseCarte {
            gouttes: GOUTTES,
            sabliers: SABLIERS,
            plis: PLIS,
        },
    })
}

/// Marque la plus ancienne carte pleine comme récupérée. `403` : aucune carte pleine.
pub async fn reclamer(tx: &mut PgConnection, joueur: Uuid) -> Result<(), ErreurApi> {
    let vue = etat(&mut *tx, joueur).await?;
    if vue.a_recuperer == 0 {
        return Err(ErreurApi::Interdit("aucune carte de lecteur pleine"));
    }
    let numero = recuperees(&mut *tx, joueur).await? + 1;
    sqlx::query!(
        "INSERT INTO carte_lecteur_recuperee (joueur_id, numero) VALUES ($1, $2)",
        joueur,
        i32::try_from(numero).unwrap_or(i32::MAX)
    )
    .execute(tx)
    .await?;
    Ok(())
}
