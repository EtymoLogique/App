//! Sources de lecture de l'artefact : HTTP anonyme (bucket public, CDN) ou
//! dossier local (développement, tests).

use std::path::PathBuf;
use std::time::Duration;

use async_trait::async_trait;

use crate::ErreurCatalogue;

#[async_trait]
pub trait Lecteur: Send + Sync {
    /// Lit un fichier par son chemin relatif. `None` s'il n'existe pas.
    async fn lire(&self, chemin: &str) -> Result<Option<Vec<u8>>, ErreurCatalogue>;
}

/// Lecture anonyme par HTTP, sous une adresse de base (`…/public`).
#[derive(Debug, Clone)]
pub struct LecteurHttp {
    client: reqwest::Client,
    base: String,
}

impl LecteurHttp {
    pub fn nouveau(base: &str) -> Result<Self, ErreurCatalogue> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ErreurCatalogue::Lecture {
                chemin: base.to_owned(),
                cause: e.to_string(),
            })?;
        Ok(Self {
            client,
            base: base.trim_end_matches('/').to_owned(),
        })
    }
}

#[async_trait]
impl Lecteur for LecteurHttp {
    async fn lire(&self, chemin: &str) -> Result<Option<Vec<u8>>, ErreurCatalogue> {
        let erreur = |cause: String| ErreurCatalogue::Lecture {
            chemin: chemin.to_owned(),
            cause,
        };
        let reponse = self
            .client
            .get(format!("{}/{chemin}", self.base))
            .header(reqwest::header::CACHE_CONTROL, "no-cache")
            .send()
            .await
            .map_err(|e| erreur(e.to_string()))?;
        // Sans droit de listage, un objet absent répond 403, pas 404.
        match reponse.status() {
            s if s.is_success() => {
                let octets = reponse.bytes().await.map_err(|e| erreur(e.to_string()))?;
                Ok(Some(octets.to_vec()))
            }
            reqwest::StatusCode::NOT_FOUND | reqwest::StatusCode::FORBIDDEN => Ok(None),
            s => Err(erreur(format!("statut HTTP {s}"))),
        }
    }
}

/// Lecture dans un dossier local, par exemple la sortie de `etymo-contenu compiler`.
#[derive(Debug, Clone)]
pub struct LecteurDossier {
    racine: PathBuf,
}

impl LecteurDossier {
    #[must_use]
    pub fn nouveau(racine: impl Into<PathBuf>) -> Self {
        Self {
            racine: racine.into(),
        }
    }
}

#[async_trait]
impl Lecteur for LecteurDossier {
    async fn lire(&self, chemin: &str) -> Result<Option<Vec<u8>>, ErreurCatalogue> {
        if chemin
            .split('/')
            .any(|segment| segment.is_empty() || segment == "..")
        {
            return Err(ErreurCatalogue::Lecture {
                chemin: chemin.to_owned(),
                cause: "chemin refusé".into(),
            });
        }
        match tokio::fs::read(self.racine.join(chemin)).await {
            Ok(octets) => Ok(Some(octets)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(ErreurCatalogue::Lecture {
                chemin: chemin.to_owned(),
                cause: e.to_string(),
            }),
        }
    }
}
