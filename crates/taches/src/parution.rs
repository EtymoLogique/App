//! Parution des fascicules par promotion de préfixe (ADR 0029).
//!
//! À chaque passage, la tâche :
//! 1. lit le calendrier `staging/parutions.json` et retient les fascicules
//!    dont la date d'effet est passée ;
//! 2. copie vers `public/` les ressources que cite chaque manifeste, puis le
//!    manifeste, sans recopier un fichier déjà présent ;
//! 3. écrit en dernier `public/index.json`, s'il a changé.
//!
//! Elle est idempotente : relancée, elle ne recopie rien et ne réécrit pas l'index.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use etymo_catalogue::{
    CALENDRIER, Calendrier, Chemin, EntreeFascicule, ErreurCatalogue, FORMAT, INDEX, Manifeste,
};
use object_store::path::Path;
use object_store::{Attribute, Attributes, ObjectStore, ObjectStoreExt, PutOptions, PutPayload};

const STAGING: &str = "staging";
const PUBLIC: &str = "public";
const IMMUABLE: &str = "public, max-age=31536000, immutable";
const REVALIDER: &str = "no-cache";

#[derive(Debug, thiserror::Error)]
pub enum ErreurParution {
    #[error("stockage : {0}")]
    Stockage(#[from] object_store::Error),
    #[error(transparent)]
    Catalogue(#[from] ErreurCatalogue),
    #[error("JSON : {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RapportParution {
    /// Numéros des fascicules parus, après ce passage.
    pub parus: Vec<u32>,
    /// Fascicules encore à venir dans le calendrier.
    pub a_venir: usize,
    /// Fichiers copiés de `staging/` vers `public/` lors de ce passage.
    pub copies: usize,
    /// Vrai si `public/index.json` a été réécrit.
    pub index_ecrit: bool,
    /// Fascicules de l'index absents du calendrier, conservés tels quels.
    pub conserves: Vec<u32>,
}

/// Destination de la parution : le bucket, ou un dossier local en développement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cible {
    /// Bucket S3 : chaque fichier reçoit son type MIME et sa politique de cache.
    Bucket,
    /// Dossier local : aucun attribut, le serveur de développement les déduit.
    Dossier,
}

pub async fn publier_fascicules(
    bucket: &dyn ObjectStore,
    cible: Cible,
    maintenant: DateTime<Utc>,
) -> Result<RapportParution, ErreurParution> {
    let mut rapport = RapportParution::default();
    let Some(calendrier) = lire_calendrier(bucket, STAGING, CALENDRIER).await? else {
        tracing::info!("aucun calendrier dans staging/ : rien à publier");
        return Ok(rapport);
    };
    let actuel = lire_calendrier(bucket, PUBLIC, INDEX).await?;

    let (dus, a_venir): (Vec<_>, Vec<_>) = calendrier
        .fascicules
        .iter()
        .cloned()
        .partition(|f| f.parution <= maintenant);
    rapport.a_venir = a_venir.len();

    for entree in &dus {
        rapport.copies += promouvoir(bucket, cible, entree).await?;
    }

    // Un fascicule déjà paru ne disparaît pas de l'index parce qu'il manque
    // au calendrier : un retrait après parution se fait en restaurant une
    // version antérieure de l'index (ADR 0029).
    let mut parus: BTreeMap<u32, EntreeFascicule> = BTreeMap::new();
    if let Some(actuel) = &actuel {
        for entree in &actuel.fascicules {
            if !calendrier
                .fascicules
                .iter()
                .any(|f| f.numero == entree.numero)
            {
                tracing::warn!(
                    numero = entree.numero,
                    "fascicule paru absent du calendrier, conservé"
                );
                rapport.conserves.push(entree.numero);
                parus.insert(entree.numero, entree.clone());
            }
        }
    }
    parus.extend(dus.into_iter().map(|e| (e.numero, e)));
    rapport.parus = parus.keys().copied().collect();

    let index = Calendrier {
        format: FORMAT,
        version: calendrier.version.clone(),
        essai: calendrier.essai,
        referentiels: calendrier.referentiels.clone(),
        fascicules: parus.into_values().collect(),
    };
    if actuel.as_ref() != Some(&index) {
        let octets = serde_json::to_vec(&index)?;
        deposer(
            bucket,
            cible,
            &Path::from(format!("{PUBLIC}/{INDEX}")),
            octets,
            "application/json",
            REVALIDER,
        )
        .await?;
        rapport.index_ecrit = true;
    }
    // Aucune migration de progression : ADR 0041, la resynchronisation par
    // `409` suffit.
    Ok(rapport)
}

/// Copie les ressources d'un fascicule, puis son manifeste. Renvoie le nombre
/// de fichiers copiés.
async fn promouvoir(
    bucket: &dyn ObjectStore,
    cible: Cible,
    entree: &EntreeFascicule,
) -> Result<usize, ErreurParution> {
    let octets = lire_hache(bucket, STAGING, &entree.manifeste).await?;
    let manifeste: Manifeste = serde_json::from_slice(&octets)?;
    let mut copies = 0;
    for chemin in manifeste.ressources() {
        if copier(bucket, cible, &chemin).await? {
            copies += 1;
        }
    }
    if copier(bucket, cible, &entree.manifeste).await? {
        copies += 1;
    }
    tracing::info!(numero = entree.numero, copies, "fascicule promu");
    Ok(copies)
}

/// Copie un fichier haché de `staging/` vers `public/`, sauf s'il y est déjà :
/// à chemin égal, contenu égal.
async fn copier(
    bucket: &dyn ObjectStore,
    cible: Cible,
    chemin: &Chemin,
) -> Result<bool, ErreurParution> {
    let destination = Path::from(format!("{PUBLIC}/{chemin}"));
    match bucket.head(&destination).await {
        Ok(_) => return Ok(false),
        Err(object_store::Error::NotFound { .. }) => {}
        Err(e) => return Err(e.into()),
    }
    let octets = lire_hache(bucket, STAGING, chemin).await?;
    deposer(
        bucket,
        cible,
        &destination,
        octets,
        chemin.type_contenu(),
        IMMUABLE,
    )
    .await?;
    Ok(true)
}

async fn lire_hache(
    bucket: &dyn ObjectStore,
    prefixe: &str,
    chemin: &Chemin,
) -> Result<Vec<u8>, ErreurParution> {
    let octets = match bucket.get(&Path::from(format!("{prefixe}/{chemin}"))).await {
        Ok(resultat) => resultat.bytes().await?.to_vec(),
        Err(object_store::Error::NotFound { .. }) => {
            return Err(ErreurCatalogue::Absent(format!("{prefixe}/{chemin}")).into());
        }
        Err(e) => return Err(e.into()),
    };
    chemin.verifier(&octets)?;
    Ok(octets)
}

async fn lire_calendrier(
    bucket: &dyn ObjectStore,
    prefixe: &str,
    nom: &str,
) -> Result<Option<Calendrier>, ErreurParution> {
    let octets = match bucket.get(&Path::from(format!("{prefixe}/{nom}"))).await {
        Ok(resultat) => resultat.bytes().await?,
        Err(object_store::Error::NotFound { .. }) => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let calendrier: Calendrier = serde_json::from_slice(&octets)?;
    if calendrier.format != FORMAT {
        return Err(ErreurCatalogue::Format(calendrier.format).into());
    }
    Ok(Some(calendrier))
}

async fn deposer(
    bucket: &dyn ObjectStore,
    cible: Cible,
    destination: &Path,
    octets: Vec<u8>,
    type_contenu: &'static str,
    cache: &'static str,
) -> Result<(), ErreurParution> {
    let attributes = match cible {
        Cible::Bucket => Attributes::from_iter([
            (Attribute::ContentType, type_contenu),
            (Attribute::CacheControl, cache),
        ]),
        Cible::Dossier => Attributes::new(),
    };
    let options = PutOptions {
        attributes,
        ..PutOptions::default()
    };
    bucket
        .put_opts(destination, PutPayload::from(octets), options)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests;
