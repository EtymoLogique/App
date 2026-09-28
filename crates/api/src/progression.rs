//! Lecture et mutation de la progression, toujours dans la transaction d'une
//! commande, le joueur verrouillé (`FOR UPDATE`) : les commandes d'un même
//! joueur s'exécutent l'une après l'autre.

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, TimeDelta, Utc};
use etymo_catalogue::Jeu;
use etymo_contrat::{
    CompteurPli, Decouverte, EnergieEtat, Etat, Exemplaires, IndiceObtenu, OuverturePli,
    SabliersEtat,
};
use etymo_domaine::IdCatalogue;
use etymo_domaine::energie::{self, Energie};
use etymo_domaine::pli::{self, Compteurs, Regle, Resultat};
use etymo_domaine::reserve::ajout_plafonne;
use etymo_domaine::{indice, jalon, sablier};
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

pub async fn etat(
    tx: &mut PgConnection,
    joueur: Uuid,
    recharge: TimeDelta,
) -> Result<Etat, ErreurApi> {
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
    let energie = lire_energie(&mut *tx, joueur)
        .await?
        .a(maintenant, recharge);
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
    let historique_plis = lire_historique(&mut *tx, joueur).await?;
    let indices = lire_indices(&mut *tx, joueur).await?;
    let mut jalons_atteints: Vec<_> = jalons_atteints(&mut *tx, joueur)
        .await?
        .into_iter()
        .collect();
    jalons_atteints.sort();
    Ok(Etat {
        version_etat: ligne.version_etat,
        version_catalogue: ligne.version_catalogue,
        reserve,
        decouvertes,
        energie: EnergieEtat {
            charges: energie.charges,
            capacite: energie::CAPACITE,
            prochaine_charge: energie.prochaine_charge,
            recharge_s: u32::try_from(recharge.num_seconds()).unwrap_or(u32::MAX),
        },
        encre,
        compteurs_plis,
        historique_plis,
        sabliers: sabliers_etat(&mut *tx, joueur, maintenant, recharge).await?,
        indices,
        jalons_atteints,
        prix_indices: indice::PRIX_INDICE.to_vec(),
    })
}

/// Niveaux d'indice obtenus, par recette puis par niveau.
async fn lire_indices(tx: &mut PgConnection, joueur: Uuid) -> Result<Vec<IndiceObtenu>, ErreurApi> {
    sqlx::query!(
        "SELECT recette_id, niveau FROM indice WHERE joueur_id = $1 ORDER BY recette_id, niveau",
        joueur
    )
    .fetch_all(tx)
    .await?
    .into_iter()
    .map(|l| {
        Ok(IndiceObtenu {
            recette_id: id(&l.recette_id)?,
            niveau: u8::try_from(l.niveau).unwrap_or(0),
        })
    })
    .collect()
}

async fn sabliers_etat(
    tx: &mut PgConnection,
    joueur: Uuid,
    maintenant: DateTime<Utc>,
    recharge: TimeDelta,
) -> Result<SabliersEtat, ErreurApi> {
    Ok(SabliersEtat {
        detenus: lire_sabliers(&mut *tx, joueur).await?,
        utilises_24h: sabliers_utilises(&mut *tx, joueur, maintenant, recharge).await?,
        plafond_jour: sablier::PLAFOND_JOUR,
        plafond_detenus: sablier::PLAFOND_DETENUS,
    })
}

/// Derniers plis ouverts, du plus récent au plus ancien.
async fn lire_historique(
    tx: &mut PgConnection,
    joueur: Uuid,
) -> Result<Vec<OuverturePli>, ErreurApi> {
    sqlx::query!(
        "SELECT fascicule_id, brique_id, resultat, regle, encre, ouvert_le FROM ouverture_pli
         WHERE joueur_id = $1 ORDER BY ouvert_le DESC, id DESC LIMIT $2",
        joueur,
        HISTORIQUE,
    )
    .fetch_all(tx)
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
    .collect()
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
        crediter_exemplaire(
            &mut *tx,
            joueur,
            Some(effets.commande),
            brique,
            "pli",
            effets.maintenant,
        )
        .await?;
    }
    let motif = if effets.resultat == Resultat::Nouvelle {
        "pli"
    } else {
        "doublon"
    };
    crediter_encre(
        &mut *tx,
        joueur,
        Some(effets.commande),
        gouttes,
        motif,
        effets.maintenant,
    )
    .await?;
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
    historiser_pli(&mut *tx, joueur, effets, "energie", gouttes).await
}

async fn historiser_pli(
    tx: &mut PgConnection,
    joueur: Uuid,
    effets: &EffetsPli<'_>,
    origine: &str,
    gouttes: i32,
) -> Result<(), ErreurApi> {
    sqlx::query!(
        "INSERT INTO ouverture_pli
             (joueur_id, fascicule_id, origine, brique_id, resultat, regle, encre, version_equilibrage, ouvert_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        joueur,
        effets.fascicule.as_str(),
        origine,
        effets.brique.as_str(),
        texte(effets.resultat)?,
        texte(effets.regle)?,
        gouttes,
        effets.version_equilibrage,
        effets.maintenant,
    )
    .execute(tx)
    .await?;
    Ok(())
}

/// Un exemplaire de plus, tracé dans `mouvement`.
async fn crediter_exemplaire(
    tx: &mut PgConnection,
    joueur: Uuid,
    commande: Option<Uuid>,
    brique: &str,
    motif: &str,
    maintenant: DateTime<Utc>,
) -> Result<(), ErreurApi> {
    sqlx::query!(
        "INSERT INTO exemplaire (joueur_id, brique_id, nombre, connue_le) VALUES ($1, $2, 1, $3)
         ON CONFLICT (joueur_id, brique_id) DO UPDATE SET nombre = exemplaire.nombre + 1",
        joueur,
        brique,
        maintenant,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "INSERT INTO mouvement (joueur_id, commande_id, ressource, brique_id, delta, motif, le)
         VALUES ($1, $2, 'exemplaire', $3, 1, $4, $5)",
        joueur,
        commande,
        brique,
        motif,
        maintenant,
    )
    .execute(tx)
    .await?;
    Ok(())
}

/// Ajoute (ou retire, `gouttes` négatif) de l'encre, tracée dans `mouvement`.
async fn crediter_encre(
    tx: &mut PgConnection,
    joueur: Uuid,
    commande: Option<Uuid>,
    gouttes: i32,
    motif: &str,
    maintenant: DateTime<Utc>,
) -> Result<(), ErreurApi> {
    if gouttes == 0 {
        return Ok(());
    }
    // Un débit ne passe pas par l'insertion : sa ligne proposée serait négative.
    if gouttes > 0 {
        sqlx::query!(
            "INSERT INTO encre (joueur_id, gouttes) VALUES ($1, $2)
             ON CONFLICT (joueur_id) DO UPDATE SET gouttes = encre.gouttes + EXCLUDED.gouttes",
            joueur,
            gouttes,
        )
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query!(
            "UPDATE encre SET gouttes = gouttes + $2 WHERE joueur_id = $1",
            joueur,
            gouttes,
        )
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query!(
        "INSERT INTO mouvement (joueur_id, commande_id, ressource, delta, motif, le)
         VALUES ($1, $2, 'encre', $3, $4, $5)",
        joueur,
        commande,
        gouttes,
        motif,
        maintenant,
    )
    .execute(tx)
    .await?;
    Ok(())
}

/// Ajoute (ou retire) des sabliers détenus, tracés dans `mouvement`.
async fn crediter_sabliers(
    tx: &mut PgConnection,
    joueur: Uuid,
    commande: Option<Uuid>,
    delta: i32,
    motif: &str,
    maintenant: DateTime<Utc>,
) -> Result<(), ErreurApi> {
    if delta == 0 {
        return Ok(());
    }
    let delta_court = i16::try_from(delta).map_err(|e| ErreurApi::Interne(e.to_string()))?;
    if delta > 0 {
        sqlx::query!(
            "INSERT INTO sablier (joueur_id, detenus) VALUES ($1, $2)
             ON CONFLICT (joueur_id) DO UPDATE SET detenus = sablier.detenus + EXCLUDED.detenus",
            joueur,
            delta_court,
        )
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query!(
            "UPDATE sablier SET detenus = detenus + $2 WHERE joueur_id = $1",
            joueur,
            delta_court,
        )
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query!(
        "INSERT INTO mouvement (joueur_id, commande_id, ressource, delta, motif, le)
         VALUES ($1, $2, 'sablier', $3, $4, $5)",
        joueur,
        commande,
        delta,
        motif,
        maintenant,
    )
    .execute(tx)
    .await?;
    Ok(())
}

pub async fn lire_sabliers(tx: &mut PgConnection, joueur: Uuid) -> Result<u32, ErreurApi> {
    Ok(
        sqlx::query_scalar!("SELECT detenus FROM sablier WHERE joueur_id = $1", joueur)
            .fetch_optional(tx)
            .await?
            .map_or(0, |n| u32::try_from(n).unwrap_or(0)),
    )
}

/// Sabliers utilisés sur la fenêtre glissante du plafond quotidien.
pub async fn sabliers_utilises(
    tx: &mut PgConnection,
    joueur: Uuid,
    maintenant: DateTime<Utc>,
    recharge: TimeDelta,
) -> Result<u32, ErreurApi> {
    let somme = sqlx::query_scalar!(
        "SELECT COALESCE(-SUM(delta), 0)::integer FROM mouvement
         WHERE joueur_id = $1 AND ressource = 'sablier' AND motif = 'sablier' AND delta < 0 AND le > $2",
        joueur,
        maintenant - sablier::fenetre(recharge),
    )
    .fetch_one(tx)
    .await?;
    Ok(somme.map_or(0, positif))
}

/// Utilise `nombre` sabliers : les détenus d'abord, puis ceux payés en encre.
/// Renvoie la répartition (détenus, encre).
pub async fn utiliser_sabliers(
    tx: &mut PgConnection,
    joueur: Uuid,
    commande: Uuid,
    nombre: u32,
    recharge: TimeDelta,
    maintenant: DateTime<Utc>,
) -> Result<(u32, u32), ErreurApi> {
    let energie = lire_energie(&mut *tx, joueur).await?;
    let avancee = energie
        .avancer(maintenant, recharge, nombre)
        .ok_or(ErreurApi::Interdit("énergie pleine"))?;
    let detenus = lire_sabliers(&mut *tx, joueur).await?;
    let encre = lire_encre(&mut *tx, joueur).await?;
    let utilises = sabliers_utilises(&mut *tx, joueur, maintenant, recharge).await?;
    let (depuis_detenus, depuis_encre) = sablier::repartir(nombre, detenus, encre, utilises)
        .ok_or(ErreurApi::Interdit(
            "plafond quotidien ou encre insuffisante",
        ))?;
    let achetes = i32::try_from(depuis_encre).map_err(|e| ErreurApi::Interne(e.to_string()))?;
    let prix = i32::try_from(depuis_encre * sablier::GOUTTES_PAR_SABLIER)
        .map_err(|e| ErreurApi::Interne(e.to_string()))?;
    crediter_encre(
        &mut *tx,
        joueur,
        Some(commande),
        -prix,
        "sablier",
        maintenant,
    )
    .await?;
    crediter_sabliers(
        &mut *tx,
        joueur,
        Some(commande),
        achetes,
        "sablier",
        maintenant,
    )
    .await?;
    let utilises = i32::try_from(nombre).map_err(|e| ErreurApi::Interne(e.to_string()))?;
    crediter_sabliers(
        &mut *tx,
        joueur,
        Some(commande),
        -utilises,
        "sablier",
        maintenant,
    )
    .await?;
    ecrire_energie(&mut *tx, joueur, avancee).await?;
    Ok((depuis_detenus, depuis_encre))
}

async fn ecrire_energie(
    tx: &mut PgConnection,
    joueur: Uuid,
    energie: Energie,
) -> Result<(), ErreurApi> {
    sqlx::query!(
        "INSERT INTO energie (joueur_id, charges, prochaine_charge) VALUES ($1, $2, $3)
         ON CONFLICT (joueur_id) DO UPDATE SET charges = EXCLUDED.charges, prochaine_charge = EXCLUDED.prochaine_charge",
        joueur,
        i16::from(energie.charges),
        energie.prochaine_charge,
    )
    .execute(tx)
    .await?;
    Ok(())
}

/// Niveaux d'indice déjà obtenus pour une recette.
pub async fn niveau_indice(
    tx: &mut PgConnection,
    joueur: Uuid,
    recette: &IdCatalogue,
) -> Result<u8, ErreurApi> {
    let niveau = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(niveau), 0)::smallint FROM indice WHERE joueur_id = $1 AND recette_id = $2",
        joueur,
        recette.as_str(),
    )
    .fetch_one(tx)
    .await?;
    Ok(niveau.map_or(0, |n| u8::try_from(n).unwrap_or(0)))
}

/// Paie un niveau d'indice et l'enregistre.
pub async fn acheter_indice(
    tx: &mut PgConnection,
    joueur: Uuid,
    commande: Uuid,
    recette: &IdCatalogue,
    niveau: u8,
    prix: u32,
) -> Result<(), ErreurApi> {
    if lire_encre(&mut *tx, joueur).await? < prix {
        return Err(ErreurApi::Interdit("encre insuffisante"));
    }
    let prix = i32::try_from(prix).map_err(|e| ErreurApi::Interne(e.to_string()))?;
    crediter_encre(
        &mut *tx,
        joueur,
        Some(commande),
        -prix,
        "indice",
        Utc::now(),
    )
    .await?;
    sqlx::query!(
        "INSERT INTO indice (joueur_id, recette_id, niveau) VALUES ($1, $2, $3)",
        joueur,
        recette.as_str(),
        i16::from(niveau),
    )
    .execute(tx)
    .await?;
    Ok(())
}

async fn jalons_atteints(
    tx: &mut PgConnection,
    joueur: Uuid,
) -> Result<HashSet<IdCatalogue>, ErreurApi> {
    sqlx::query_scalar!(
        "SELECT jalon_id FROM jalon_atteint WHERE joueur_id = $1",
        joueur
    )
    .fetch_all(tx)
    .await?
    .iter()
    .map(|j| id(j))
    .collect()
}

/// Accorde les jalons atteints et pas encore reçus (ADR 0038) : un pli
/// déterministe (un exemplaire de chaque brique, de l'encre si la réserve est
/// pleine) et des sabliers, plafonnés à 36 détenus. Renvoie les jalons accordés.
pub async fn accorder_jalons(
    tx: &mut PgConnection,
    joueur: Uuid,
    jeu: &Jeu,
    commande: Option<Uuid>,
) -> Result<Vec<IdCatalogue>, ErreurApi> {
    let decouverts = mots_decouverts(&mut *tx, joueur).await?;
    let deja = jalons_atteints(&mut *tx, joueur).await?;
    let maintenant = Utc::now();
    let mut accordes = Vec::new();
    for fascicule in &jeu.jalons {
        let n = fascicule.mots.intersection(&decouverts).count();
        for jalon in jalon::atteints(n, &fascicule.jalons, &deja) {
            sqlx::query!(
                "INSERT INTO jalon_atteint (joueur_id, jalon_id, atteint_le) VALUES ($1, $2, $3)",
                joueur,
                jalon.id.as_str(),
                maintenant,
            )
            .execute(&mut *tx)
            .await?;
            let equilibrage = jeu.equilibrage(&fascicule.fascicule_id);
            let mut stock = stock(&mut *tx, joueur).await?;
            for brique in &jalon.pli {
                let resultat = pli::resultat(stock.get(brique).copied());
                let gouttes = match (resultat, equilibrage, jeu.rarete(brique)) {
                    (Resultat::ReservePleine, Some(e), Some(rarete)) => {
                        *e.parametres.encre_reserve_pleine.get(&rarete).unwrap_or(&0)
                    }
                    _ => 0,
                };
                let gouttes =
                    i32::try_from(gouttes).map_err(|e| ErreurApi::Interne(e.to_string()))?;
                if resultat == Resultat::ReservePleine {
                    crediter_encre(&mut *tx, joueur, commande, gouttes, "jalon", maintenant)
                        .await?;
                } else {
                    crediter_exemplaire(
                        &mut *tx,
                        joueur,
                        commande,
                        brique.as_str(),
                        "jalon",
                        maintenant,
                    )
                    .await?;
                    *stock.entry(brique.clone()).or_default() += 1;
                }
                let effets = EffetsPli {
                    commande: commande.unwrap_or_default(),
                    fascicule: &fascicule.fascicule_id,
                    brique,
                    resultat,
                    regle: Regle::Deterministe,
                    gouttes: 0,
                    energie: Energie::pleine(),
                    compteurs: Compteurs::default(),
                    version_equilibrage: equilibrage.map_or("jalon", |e| e.version.as_str()),
                    maintenant,
                };
                historiser_pli(&mut *tx, joueur, &effets, "jalon", gouttes).await?;
            }
            let detenus = lire_sabliers(&mut *tx, joueur).await?;
            // ponytail: au-delà de 36 détenus, les sabliers du jalon sont perdus (ADR 0038) ; un compteur en attente s'ajoutera si un jalon y arrive.
            let ajout = jalon
                .sabliers
                .min(sablier::PLAFOND_DETENUS.saturating_sub(detenus));
            let ajout = i32::try_from(ajout).map_err(|e| ErreurApi::Interne(e.to_string()))?;
            crediter_sabliers(&mut *tx, joueur, commande, ajout, "jalon", maintenant).await?;
            accordes.push(jalon.id.clone());
        }
    }
    Ok(accordes)
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
