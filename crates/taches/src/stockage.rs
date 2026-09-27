//! Accès au bucket du catalogue par la tâche de parution, avec sa propre clé
//! (ADR 0029) : lecture de `staging/`, lecture et écriture de `public/`.

use std::sync::Arc;

use object_store::ObjectStore;
use object_store::aws::AmazonS3Builder;
use object_store::local::LocalFileSystem;
use serde::Deserialize;

use crate::Cible;

#[derive(Debug, thiserror::Error)]
pub enum ErreurConfiguration {
    #[error("ETYMO_S3 doit être un JSON {{\"access_key\", \"secret_key\"}}")]
    Cle,
    #[error("client S3 : {0}")]
    Client(String),
}

/// Contenu du secret `parution-s3`, posé par le dépôt Infra dans `ETYMO_S3`.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CleS3 {
    access_key: String,
    secret_key: String,
}

/// Construit le client du bucket du catalogue.
///
/// Un point de terminaison `file:///dossier` désigne un bucket simulé sur
/// disque, pour le développement : la clé est alors ignorée.
/// `cle_json` est la valeur du secret ; elle n'est jamais journalisée.
pub fn bucket_catalogue(
    cle_json: &str,
    point_de_terminaison: &str,
    region: &str,
    bucket: &str,
) -> Result<(Arc<dyn ObjectStore>, Cible), ErreurConfiguration> {
    if let Some(dossier) = point_de_terminaison.strip_prefix("file://") {
        let local = LocalFileSystem::new_with_prefix(dossier)
            .map_err(|e| ErreurConfiguration::Client(e.to_string()))?;
        return Ok((Arc::new(local), Cible::Dossier));
    }
    let cle: CleS3 = serde_json::from_str(cle_json).map_err(|_| ErreurConfiguration::Cle)?;
    let client = AmazonS3Builder::new()
        .with_endpoint(point_de_terminaison)
        .with_region(region)
        .with_bucket_name(bucket)
        .with_access_key_id(cle.access_key)
        .with_secret_access_key(cle.secret_key)
        .with_virtual_hosted_style_request(false)
        .build()
        .map_err(|e| ErreurConfiguration::Client(e.to_string()))?;
    Ok((Arc::new(client), Cible::Bucket))
}
