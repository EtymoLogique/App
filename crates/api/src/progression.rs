//! Lecture et mutation de la progression, toujours dans la transaction d'une
//! commande, le joueur verrouillé (`FOR UPDATE`) : les commandes d'un même
//! joueur s'exécutent l'une après l'autre.

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use etymo_catalogue::Jeu;
use etymo_contrat::{CompteurPli, Decouverte, EnergieEtat, Etat, Exemplaires, OuverturePli};
use etymo_domaine::IdCatalogue;
use etymo_domaine::energie::{self, Energie};
use etymo_domaine::pli::{Compteurs, Regle, Resultat};
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
        "SELECT brique_id, nombre, connue_le FROM exemplaire WHERE joueur_id = $1 ORDER BY brique_id",
        joueur
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|l| {
        Ok(Exemplaires {
            brique_id: id(&l.brique_id)?,
            exemplaires: u8::try_from(l.nombre).map_err(|e| ErreurApi::Interne(e.to_string()))?,
            connue_le: l.connue_le,
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
    let maintenant = Utc::now();
    let energie = lire_energie(&mut *tx, joueur).await?.a(maintenant);
    let encre = lire_encre(&mut *tx, joueur).await?;
    let compteurs_plis = sqlx::query!(
        "SELECT fascicule_id, plis_sans_nouveaute, plis_sans_utilite FROM compteur_pli
         WHERE joueur_id = $1 ORDER BY fascicule_id",
        joueur
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|l| {
        Ok(CompteurPli {
            fascicule_id: id(&l.fascicule_id)?,
            plis_sans_nouveaute: positif(l.plis_sans_nouveaute),
            plis_sans_utilite: positif(l.plis_sans_utilite),
        })
    })
    .collect::<Result<_, ErreurApi>>()?;
    let historique_plis = sqlx::query!(
        "SELECT fascicule_id, brique_id, resultat, regle, encre, ouvert_le FROM ouverture_pli
         WHERE joueur_id = $1 ORDER BY ouvert_le DESC, id DESC LIMIT $2",
        joueur,
        HISTORIQUE,
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|l| {
        Ok(OuverturePli {
            fascicule_id: id(&l.fascicule_id)?,
            brique_id: id(&l.brique_id)?,
            resultat: enumere(&l.resultat)?,
            regle: enumere(&l.regle)?,
            encre: positif(l.encre),
            ouvert_le: l.ouvert_le,
        })
    })
    .collect::<Result<_, ErreurApi>>()?;
    Ok(Etat {
        version_etat: ligne.version_etat,
        version_catalogue: ligne.version_catalogue,
        reserve,
        decouvertes,
        energie: EnergieEtat {
            charges: energie.charges,
            capacite: energie::CAPACITE,
            prochaine_charge: energie.prochaine_charge,
            recharge_s: u32::try_from(energie::RECHARGE.num_seconds()).unwrap_or(u32::MAX),
        },
        encre,
        compteurs_plis,
        historique_plis,
    })
}

/// Plis rendus dans l'état : l'historique récent seulement.
const HISTORIQUE: i64 = 20;

fn positif(n: i32) -> u32 {
    u32::try_from(n).unwrap_or(0)
}

/// Relit une valeur énumérée stockée en texte (`snake_case`, comme dans le contrat).
fn enumere<T: serde::de::DeserializeOwned>(texte: &str) -> Result<T, ErreurApi> {
    serde_json::from_value(serde_json::Value::String(texte.to_owned()))
        .map_err(|_| ErreurApi::Interne(format!("valeur stockée invalide : {texte}")))
}

fn texte<T: serde::Serialize>(valeur: T) -> Result<String, ErreurApi> {
    match serde_json::to_value(valeur) {
        Ok(serde_json::Value::String(t)) => Ok(t),
        _ => Err(ErreurApi::Interne("valeur non énumérée".into())),
    }
}

/// Énergie enregistrée ; une ligne absente vaut une énergie pleine.
pub async fn lire_energie(tx: &mut PgConnection, joueur: Uuid) -> Result<Energie, ErreurApi> {
    Ok(sqlx::query!(
        "SELECT charges, prochaine_charge FROM energie WHERE joueur_id = $1 FOR UPDATE",
        joueur
    )
    .fetch_optional(tx)
    .await?
    .map_or_else(Energie::pleine, |l| Energie {
        charges: u8::try_from(l.charges).unwrap_or(0),
        prochaine_charge: l.prochaine_charge,
    }))
}

pub async fn lire_encre(tx: &mut PgConnection, joueur: Uuid) -> Result<u32, ErreurApi> {
    Ok(
        sqlx::query_scalar!("SELECT gouttes FROM encre WHERE joueur_id = $1", joueur)
            .fetch_optional(tx)
            .await?
            .map_or(0, positif),
    )
}

/// Exemplaires de chaque brique connue.
pub async fn stock(
    tx: &mut PgConnection,
    joueur: Uuid,
) -> Result<HashMap<IdCatalogue, u8>, ErreurApi> {
    sqlx::query!(
        "SELECT brique_id, nombre FROM exemplaire WHERE joueur_id = $1 FOR UPDATE",
        joueur
    )
    .fetch_all(tx)
    .await?
    .into_iter()
    .map(|l| Ok((id(&l.brique_id)?, u8::try_from(l.nombre).unwrap_or(0))))
    .collect()
}

pub async fn compteurs(
    tx: &mut PgConnection,
    joueur: Uuid,
    fascicule: &IdCatalogue,
) -> Result<Compteurs, ErreurApi> {
    Ok(sqlx::query!(
        "SELECT plis_sans_nouveaute, plis_sans_utilite FROM compteur_pli
         WHERE joueur_id = $1 AND fascicule_id = $2",
        joueur,
        fascicule.as_str(),
    )
    .fetch_optional(tx)
    .await?
    .map_or_else(Compteurs::default, |l| Compteurs {
        plis_sans_nouveaute: positif(l.plis_sans_nouveaute),
        plis_sans_utilite: positif(l.plis_sans_utilite),
    }))
}

/// Ce qu'un pli change, déjà décidé par le domaine.
pub struct EffetsPli<'a> {
    pub commande: Uuid,
    pub fascicule: &'a IdCatalogue,
    pub brique: &'a IdCatalogue,
    pub resultat: Resultat,
    pub regle: Regle,
    pub gouttes: u32,
    pub energie: Energie,
    pub compteurs: Compteurs,
    pub version_equilibrage: &'a str,
    pub maintenant: DateTime<Utc>,
}

/// Applique un pli : charge consommée, exemplaire ou encre, compteurs et
/// historique, chaque variation tracée dans `mouvement`.
pub async fn ouvrir_pli(
    tx: &mut PgConnection,
    joueur: Uuid,
    effets: &EffetsPli<'_>,
) -> Result<(), ErreurApi> {
    let brique = effets.brique.as_str();
    let gouttes = i32::try_from(effets.gouttes).map_err(|e| ErreurApi::Interne(e.to_string()))?;
    sqlx::query!(
        "INSERT INTO energie (joueur_id, charges, prochaine_charge) VALUES ($1, $2, $3)
         ON CONFLICT (joueur_id) DO UPDATE SET charges = EXCLUDED.charges, prochaine_charge = EXCLUDED.prochaine_charge",
        joueur,
        i16::from(effets.energie.charges),
        effets.energie.prochaine_charge,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "INSERT INTO mouvement (joueur_id, commande_id, ressource, delta, motif, le)
         VALUES ($1, $2, 'charge', -1, 'pli', $3)",
        joueur,
        effets.commande,
        effets.maintenant,
    )
    .execute(&mut *tx)
    .await?;
    if effets.resultat != Resultat::ReservePleine {
        sqlx::query!(
            "INSERT INTO exemplaire (joueur_id, brique_id, nombre, connue_le) VALUES ($1, $2, 1, $3)
             ON CONFLICT (joueur_id, brique_id) DO UPDATE SET nombre = exemplaire.nombre + 1",
            joueur,
            brique,
            effets.maintenant,
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "INSERT INTO mouvement (joueur_id, commande_id, ressource, brique_id, delta, motif, le)
             VALUES ($1, $2, 'exemplaire', $3, 1, 'pli', $4)",
            joueur,
            effets.commande,
            brique,
            effets.maintenant,
        )
        .execute(&mut *tx)
        .await?;
    }
    if gouttes > 0 {
        sqlx::query!(
            "INSERT INTO encre (joueur_id, gouttes) VALUES ($1, $2)
             ON CONFLICT (joueur_id) DO UPDATE SET gouttes = encre.gouttes + EXCLUDED.gouttes",
            joueur,
            gouttes,
        )
        .execute(&mut *tx)
        .await?;
        let motif = if effets.resultat == Resultat::Nouvelle {
            "pli"
        } else {
            "doublon"
        };
        sqlx::query!(
            "INSERT INTO mouvement (joueur_id, commande_id, ressource, delta, motif, le)
             VALUES ($1, $2, 'encre', $3, $4, $5)",
            joueur,
            effets.commande,
            gouttes,
            motif,
            effets.maintenant,
        )
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query!(
        "INSERT INTO compteur_pli (joueur_id, fascicule_id, plis_sans_nouveaute, plis_sans_utilite)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (joueur_id, fascicule_id) DO UPDATE
         SET plis_sans_nouveaute = EXCLUDED.plis_sans_nouveaute, plis_sans_utilite = EXCLUDED.plis_sans_utilite",
        joueur,
        effets.fascicule.as_str(),
        i32::try_from(effets.compteurs.plis_sans_nouveaute).unwrap_or(i32::MAX),
        i32::try_from(effets.compteurs.plis_sans_utilite).unwrap_or(i32::MAX),
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "INSERT INTO ouverture_pli
             (joueur_id, fascicule_id, origine, brique_id, resultat, regle, encre, version_equilibrage, ouvert_le)
         VALUES ($1, $2, 'energie', $3, $4, $5, $6, $7, $8)",
        joueur,
        effets.fascicule.as_str(),
        brique,
        texte(effets.resultat)?,
        texte(effets.regle)?,
        gouttes,
        effets.version_equilibrage,
        effets.maintenant,
    )
    .execute(&mut *tx)
    .await?;
    Ok(())
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
