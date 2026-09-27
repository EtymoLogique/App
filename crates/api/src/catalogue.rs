//! Catalogue publié gardé en mémoire (ADR 0024, ADR 0027) : l'API le lit
//! comme le client, sans clé, sous `public/`, et relit l'index au plus
//! toutes les 60 s. Le contenu ne passe par aucune requête SQL.

use std::sync::{Arc, RwLock};

use etymo_catalogue::{
    CatalogueCharge, ErreurCatalogue, INDEX, Lecteur, LecteurDossier, LecteurHttp,
};

pub struct CatalogueVivant {
    lecteur: Box<dyn Lecteur>,
    courant: RwLock<Option<Arc<CatalogueCharge>>>,
}

impl CatalogueVivant {
    /// `url` est le point de terminaison du bucket (`https://…`) ou un dossier
    /// local (`file:///…`) ; le catalogue publié est sous son préfixe `public/`.
    pub fn depuis_url(url: &str) -> Result<Self, ErreurCatalogue> {
        let lecteur: Box<dyn Lecteur> = match url.strip_prefix("file://") {
            Some(dossier) => Box::new(LecteurDossier::nouveau(
                std::path::Path::new(dossier).join("public"),
            )),
            None => Box::new(LecteurHttp::nouveau(&format!(
                "{}/public",
                url.trim_end_matches('/')
            ))?),
        };
        Ok(Self::nouveau(lecteur))
    }

    #[must_use]
    pub fn nouveau(lecteur: Box<dyn Lecteur>) -> Self {
        Self {
            lecteur,
            courant: RwLock::new(None),
        }
    }

    #[must_use]
    pub fn courant(&self) -> Option<Arc<CatalogueCharge>> {
        self.courant.read().expect("verrou du catalogue").clone()
    }

    #[must_use]
    pub fn version(&self) -> Option<String> {
        self.courant().map(|c| c.version().to_owned())
    }

    /// Relit l'index ; ne recharge les manifestes que s'il a changé.
    /// En cas d'erreur, la version déjà chargée reste en service.
    pub async fn rafraichir(&self) -> Result<bool, ErreurCatalogue> {
        let index = etymo_catalogue::lire_calendrier(self.lecteur.as_ref(), INDEX).await?;
        let inchange = match (&index, self.courant()) {
            (None, None) => true,
            (Some(index), Some(courant)) => *index == courant.index,
            _ => false,
        };
        if inchange {
            return Ok(false);
        }
        let nouveau = etymo_catalogue::charger(self.lecteur.as_ref()).await?;
        if let Some(catalogue) = &nouveau {
            tracing::info!(
                version = catalogue.version(),
                fascicules = catalogue.fascicules.len(),
                "catalogue chargé"
            );
        }
        *self.courant.write().expect("verrou du catalogue") = nouveau;
        Ok(true)
    }
}
