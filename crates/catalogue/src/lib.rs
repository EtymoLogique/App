//! Lecture de l'artefact publié du catalogue (ADR 0027, ADR 0029).
//!
//! L'artefact est un index global (`index.json`) ou un calendrier
//! (`parutions.json`), des manifestes de fascicule (`f/…`) et des ressources
//! (`r/…`, `a/…`) rangés sous l'empreinte SHA-256 de leurs octets.

pub mod carte;
pub mod chemin;
#[cfg(any(test, feature = "essai"))]
pub mod essai;
pub mod format;
pub mod jeu;
pub mod lecteur;

use std::sync::Arc;

pub use carte::Carte;
pub use chemin::{Chemin, ErreurChemin};
pub use format::{
    BriquePliManifeste, BriqueRicochet, Calendrier, CarteManifeste, Difficulte, Emplacement,
    EntreeFascicule, EquilibrageManifeste, Exclusion, Exclusions, Graine, Manifeste, MotRicochet,
    PliManifeste, Recette, RecetteManifeste, RicochetsManifeste,
};
pub use jeu::{JalonsJeu, Jeu, PliJeu, RicochetsJeu};
pub use lecteur::{Lecteur, LecteurDossier, LecteurHttp};

/// Nom de l'index global, seul fichier modifiable du préfixe `public/`.
pub const INDEX: &str = "index.json";
/// Nom du calendrier des parutions, sous `staging/`.
pub const CALENDRIER: &str = "parutions.json";

#[derive(Debug, thiserror::Error)]
pub enum ErreurCatalogue {
    #[error("fichier absent : {0}")]
    Absent(String),
    #[error("lecture impossible de {chemin} : {cause}")]
    Lecture { chemin: String, cause: String },
    #[error("JSON invalide dans {chemin} : {cause}")]
    Json { chemin: String, cause: String },
    #[error("empreinte incorrecte pour {0}")]
    Empreinte(String),
    #[error("format {0} non pris en charge")]
    Format(u32),
    #[error(transparent)]
    Chemin(#[from] ErreurChemin),
}

/// Version du format d'artefact que ce code sait lire.
pub const FORMAT: u32 = 1;

/// Un fascicule paru, son manifeste, ses recettes et ses exclusions, vérifiés.
#[derive(Debug, Clone)]
pub struct FasciculeCharge {
    pub entree: EntreeFascicule,
    pub manifeste: Manifeste,
    pub recettes: Vec<Recette>,
    pub exclusions: Vec<Exclusion>,
}

/// Catalogue publié, tel que l'API le garde en mémoire.
#[derive(Debug, Clone)]
pub struct CatalogueCharge {
    pub index: Calendrier,
    pub fascicules: Vec<FasciculeCharge>,
    /// Règles du jeu tirées des fascicules parus.
    pub jeu: Jeu,
}

impl CatalogueCharge {
    #[must_use]
    pub fn version(&self) -> &str {
        &self.index.version
    }
}

/// Lit un fichier JSON à chemin fixe (index ou calendrier).
pub async fn lire_calendrier(
    lecteur: &dyn Lecteur,
    nom: &str,
) -> Result<Option<Calendrier>, ErreurCatalogue> {
    let Some(octets) = lecteur.lire(nom).await? else {
        return Ok(None);
    };
    let calendrier: Calendrier = decoder(nom, &octets)?;
    if calendrier.format != FORMAT {
        return Err(ErreurCatalogue::Format(calendrier.format));
    }
    Ok(Some(calendrier))
}

/// Lit un fichier haché et vérifie que son contenu correspond à son nom.
pub async fn lire_hache(
    lecteur: &dyn Lecteur,
    chemin: &Chemin,
) -> Result<Vec<u8>, ErreurCatalogue> {
    let octets = lecteur
        .lire(chemin.as_str())
        .await?
        .ok_or_else(|| ErreurCatalogue::Absent(chemin.to_string()))?;
    chemin.verifier(&octets)?;
    Ok(octets)
}

pub async fn lire_manifeste(
    lecteur: &dyn Lecteur,
    chemin: &Chemin,
) -> Result<Manifeste, ErreurCatalogue> {
    let octets = lire_hache(lecteur, chemin).await?;
    let manifeste: Manifeste = decoder(chemin.as_str(), &octets)?;
    if manifeste.format != FORMAT {
        return Err(ErreurCatalogue::Format(manifeste.format));
    }
    Ok(manifeste)
}

/// Charge l'index global et les manifestes des fascicules parus.
/// Renvoie `None` tant qu'aucun index n'est publié.
pub async fn charger(
    lecteur: &dyn Lecteur,
) -> Result<Option<Arc<CatalogueCharge>>, ErreurCatalogue> {
    let Some(index) = lire_calendrier(lecteur, INDEX).await? else {
        return Ok(None);
    };
    let mut fascicules = Vec::with_capacity(index.fascicules.len());
    for entree in &index.fascicules {
        let manifeste = lire_manifeste(lecteur, &entree.manifeste).await?;
        let mut recettes = Vec::with_capacity(manifeste.recettes.len());
        for reference in &manifeste.recettes {
            recettes.push(lire_json::<Recette>(lecteur, &reference.chemin).await?);
        }
        let exclusions = match &manifeste.exclusions {
            Some(chemin) => lire_json::<Exclusions>(lecteur, chemin).await?.exclusions,
            None => Vec::new(),
        };
        fascicules.push(FasciculeCharge {
            entree: entree.clone(),
            manifeste,
            recettes,
            exclusions,
        });
    }
    let mut jeu = Jeu::depuis(&fascicules);
    if !index.quetes.is_empty() {
        let cartes = lire_cartes(lecteur, &fascicules).await?;
        jeu.mesurer(index.quetes.clone(), &cartes);
    }
    Ok(Some(Arc::new(CatalogueCharge {
        index,
        fascicules,
        jeu,
    })))
}

/// Lit les cartes des fascicules parus pour mesurer les quêtes. Une carte qui
/// n'a pas la forme attendue est ignorée : elle ne compte pour aucune quête.
async fn lire_cartes(
    lecteur: &dyn Lecteur,
    fascicules: &[FasciculeCharge],
) -> Result<Vec<Carte>, ErreurCatalogue> {
    let mut cartes = Vec::new();
    for fascicule in fascicules {
        for reference in &fascicule.manifeste.cartes {
            let octets = lire_hache(lecteur, &reference.carte).await?;
            if let Ok(carte) = serde_json::from_slice::<Carte>(&octets) {
                cartes.push(carte);
            }
        }
    }
    Ok(cartes)
}

/// Lit une ressource JSON hachée et la décode.
pub async fn lire_json<T: serde::de::DeserializeOwned>(
    lecteur: &dyn Lecteur,
    chemin: &Chemin,
) -> Result<T, ErreurCatalogue> {
    let octets = lire_hache(lecteur, chemin).await?;
    decoder(chemin.as_str(), &octets)
}

pub(crate) fn decoder<T: serde::de::DeserializeOwned>(
    chemin: &str,
    octets: &[u8],
) -> Result<T, ErreurCatalogue> {
    serde_json::from_slice(octets).map_err(|e| ErreurCatalogue::Json {
        chemin: chemin.to_owned(),
        cause: e.to_string(),
    })
}

#[cfg(test)]
mod tests;
