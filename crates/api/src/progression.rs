//! Lecture et mutation de la progression, toujours dans la transaction d'une
//! commande, le joueur verrouillé (`FOR UPDATE`) : les commandes d'un même
//! joueur s'exécutent l'une après l'autre.

use std::collections::HashSet;

use etymo_catalogue::Jeu;
use etymo_contrat::{Decouverte, Etat, Exemplaires};
use etymo_domaine::IdCatalogue;
use etymo_domaine::reserve::ajout_plafonne;
use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;

use crate::erreur::ErreurApi;

pub type Tx<'a> = Transaction<'a, Postgres>;

fn id(texte: &str) -> Result<IdCatalogue, ErreurApi> {
    texte
        .parse()
        .map_err(|_| ErreurApi::Interne(format!("identifiant stocké invalide : {texte}")))
}

/// Verrouille le joueur et renvoie sa `version_etat`.
pub async fn verrouiller(tx: &mut PgConnection, joueur: Uuid) -> Result<i64, ErreurApi> {
    sqlx::query_scalar!(
        "SELECT version_etat FROM joueur WHERE id = $1 FOR UPDATE",
        joueur
    )
    .fetch_optional(tx)
    .await?
    .ok_or(ErreurApi::NonAuthentifie)
}

pub async fn etat(tx: &mut PgConnection, joueur: Uuid) -> Result<Etat, ErreurApi> {
    let ligne = sqlx::query!(
        "SELECT version_etat, version_catalogue FROM joueur WHERE id = $1",
        joueur
    )
    .fetch_one(&mut *tx)
    .await?;
    let reserve = sqlx::query!(
        "SELECT brique_id, nombre FROM exemplaire WHERE joueur_id = $1 ORDER BY brique_id",
        joueur
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|l| {
        Ok(Exemplaires {
            brique_id: id(&l.brique_id)?,
            exemplaires: u8::try_from(l.nombre).map_err(|e| ErreurApi::Interne(e.to_string()))?,
        })
    })
    .collect::<Result<_, ErreurApi>>()?;
    let decouvertes = sqlx::query!(
        "SELECT mot_id, recette_id, numero, decouverte_le FROM decouverte WHERE joueur_id = $1 ORDER BY numero",
        joueur
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|l| {
        Ok(Decouverte {
            mot_id: id(&l.mot_id)?,
            recette_id: id(&l.recette_id)?,
            numero: l.numero,
            decouverte_le: l.decouverte_le,
        })
    })
    .collect::<Result<_, ErreurApi>>()?;
    Ok(Etat {
        version_etat: ligne.version_etat,
        version_catalogue: ligne.version_catalogue,
        reserve,
        decouvertes,
    })
}

pub async fn mots_decouverts(
    tx: &mut PgConnection,
    joueur: Uuid,
) -> Result<HashSet<IdCatalogue>, ErreurApi> {
    sqlx::query_scalar!("SELECT mot_id FROM decouverte WHERE joueur_id = $1", joueur)
        .fetch_all(tx)
        .await?
        .iter()
        .map(|m| id(m))
        .collect()
}

/// Accorde les graines des fascicules parus que le joueur n'a pas encore
/// reçues (ADR 0030). Renvoie vrai si la réserve a changé.
pub async fn semer(tx: &mut PgConnection, joueur: Uuid, jeu: &Jeu) -> Result<bool, ErreurApi> {
    let mut change = false;
    for (fascicule, graines) in &jeu.graines {
        let nouveau = sqlx::query_scalar!(
            "INSERT INTO graine_accordee (joueur_id, fascicule_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING RETURNING fascicule_id",
            joueur,
            fascicule.as_str(),
        )
        .fetch_optional(&mut *tx)
        .await?
        .is_some();
        if !nouveau {
            continue;
        }
        for graine in graines {
            let actuels = sqlx::query_scalar!(
                "SELECT nombre FROM exemplaire WHERE joueur_id = $1 AND brique_id = $2",
                joueur,
                graine.brique_id.as_str(),
            )
            .fetch_optional(&mut *tx)
            .await?;
            let actuels = actuels.map_or(0, |n| u8::try_from(n).unwrap_or(u8::MAX));
            let ajout = ajout_plafonne(actuels, graine.exemplaires);
            sqlx::query!(
                "INSERT INTO exemplaire (joueur_id, brique_id, nombre) VALUES ($1, $2, $3)
                 ON CONFLICT (joueur_id, brique_id) DO UPDATE SET nombre = exemplaire.nombre + EXCLUDED.nombre",
                joueur,
                graine.brique_id.as_str(),
                i16::from(ajout),
            )
            .execute(&mut *tx)
            .await?;
            if ajout > 0 {
                sqlx::query!(
                    "INSERT INTO mouvement (joueur_id, ressource, brique_id, delta, motif)
                     VALUES ($1, 'exemplaire', $2, $3, 'depart')",
                    joueur,
                    graine.brique_id.as_str(),
                    i32::from(ajout),
                )
                .execute(&mut *tx)
                .await?;
                change = true;
            }
        }
    }
    Ok(change)
}

/// Briques dont la réserve n'a pas assez d'exemplaires pour ces besoins.
pub async fn manquantes(
    tx: &mut PgConnection,
    joueur: Uuid,
    besoins: &[(&IdCatalogue, u8)],
) -> Result<Vec<IdCatalogue>, ErreurApi> {
    let mut manquantes = Vec::new();
    for (brique, besoin) in besoins {
        let nombre = sqlx::query_scalar!(
            "SELECT nombre FROM exemplaire WHERE joueur_id = $1 AND brique_id = $2 FOR UPDATE",
            joueur,
            brique.as_str(),
        )
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or(0);
        if nombre < i16::from(*besoin) {
            manquantes.push((*brique).clone());
        }
    }
    Ok(manquantes)
}

/// Consomme les exemplaires et ajoute le mot au codex (ADR 0012).
pub async fn decouvrir(
    tx: &mut PgConnection,
    joueur: Uuid,
    commande: Uuid,
    besoins: &[(&IdCatalogue, u8)],
    recette: &IdCatalogue,
    mot: &IdCatalogue,
) -> Result<(), ErreurApi> {
    for (brique, besoin) in besoins {
        sqlx::query!(
            "UPDATE exemplaire SET nombre = nombre - $3 WHERE joueur_id = $1 AND brique_id = $2",
            joueur,
            brique.as_str(),
            i16::from(*besoin),
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "INSERT INTO mouvement (joueur_id, commande_id, ressource, brique_id, delta, motif)
             VALUES ($1, $2, 'exemplaire', $3, $4, 'decouverte')",
            joueur,
            commande,
            brique.as_str(),
            -i32::from(*besoin),
        )
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query!(
        "INSERT INTO decouverte (joueur_id, mot_id, recette_id, numero)
         SELECT $1, $2, $3, COALESCE(MAX(numero), 0) + 1 FROM decouverte WHERE joueur_id = $1",
        joueur,
        mot.as_str(),
        recette.as_str(),
    )
    .execute(&mut *tx)
    .await?;
    Ok(())
}

pub async fn incrementer_version(tx: &mut PgConnection, joueur: Uuid) -> Result<(), ErreurApi> {
    sqlx::query!(
        "UPDATE joueur SET version_etat = version_etat + 1, derniere_activite = now() WHERE id = $1",
        joueur
    )
    .execute(tx)
    .await?;
    Ok(())
}
