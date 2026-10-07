//! Configuration par variables d'environnement. Les secrets n'apparaissent
//! jamais dans les journaux ni dans `--help`.

use clap::{Args, Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(
    name = "etymo-api",
    version,
    about = "API de jeu et tâches planifiées d'ÉtymoLogique"
)]
pub struct Cli {
    #[command(subcommand)]
    pub commande: Option<Commande>,
}

#[derive(Debug, Subcommand)]
pub enum Commande {
    /// Sert l'API (commande par défaut).
    Servir(ConfigServeur),
    /// Tâche planifiée : promeut les fascicules dont la date est passée (ADR 0029).
    PublierFascicules(ConfigParution),
    /// Tâche planifiée : purge les données à durée limitée (ADR 0024).
    Purger(ConfigBase),
    /// Applique les migrations de schéma de la base de progression.
    Migrer(ConfigBase),
    /// Écrit le contrat OpenAPI sur la sortie standard.
    Openapi,
}

#[derive(Debug, Clone, Args)]
pub struct ConfigBase {
    /// Adresse de la base de progression PostgreSQL.
    #[arg(long, env = "DATABASE_URL", hide_env_values = true)]
    pub database_url: String,
}

#[derive(Debug, Clone, Args)]
pub struct ConfigServeur {
    #[command(flatten)]
    pub base: ConfigBase,

    /// Port d'écoute ; Scaleway Serverless Containers le fixe par `PORT`.
    #[arg(long, env = "PORT", default_value_t = 8080)]
    pub port: u16,

    /// Point de terminaison du bucket du catalogue, ou `file:///dossier` en local.
    #[arg(long, env = "ETYMO_CATALOGUE_URL")]
    pub catalogue_url: String,

    /// Clé de signature des jetons de session, 32 octets au moins.
    #[arg(long, env = "ETYMO_CLE_SIGNATURE_SESSION", hide_env_values = true)]
    pub cle_signature: String,

    /// Origines autorisées par CORS, séparées par des virgules : celle de la PWA.
    #[arg(long, env = "ETYMO_ORIGINES_PWA", value_delimiter = ',')]
    pub origines: Vec<String>,

    /// Applique les migrations de schéma au démarrage.
    #[arg(long, env = "ETYMO_MIGRER_AU_DEMARRAGE", default_value_t = true, action = clap::ArgAction::Set)]
    pub migrer: bool,

    /// Intervalle de relecture de l'index du catalogue, en secondes.
    #[arg(long, env = "ETYMO_RELECTURE_CATALOGUE_S", default_value_t = 60)]
    pub relecture_s: u64,

    /// Durée d'une recharge de pli, en secondes : 12 h en production, moins hors production.
    #[arg(long, env = "ETYMO_RECHARGE_S", default_value_t = 43_200)]
    pub recharge_s: u32,

    /// Hors production seulement : ouvre `POST /dev/reset`, qui remet le joueur à zéro.
    /// Fermée par défaut ; ne jamais l'activer en production.
    #[arg(long, env = "ETYMO_REINITIALISATION", default_value_t = false, action = clap::ArgAction::Set)]
    pub reinitialisation: bool,
}

#[derive(Debug, Clone, Args)]
pub struct ConfigParution {
    /// Clé S3 de la tâche de parution, JSON `{"access_key", "secret_key"}`.
    /// Ignorée si le point de terminaison est un dossier local.
    #[arg(long, env = "ETYMO_S3", hide_env_values = true, default_value = "")]
    pub s3: String,

    /// Bucket du catalogue (ignoré si le point de terminaison est un dossier local).
    #[arg(long, env = "ETYMO_BUCKET_CATALOGUE", default_value = "")]
    pub bucket: String,

    #[arg(
        long,
        env = "ETYMO_S3_POINT",
        default_value = "https://s3.fr-par.scw.cloud"
    )]
    pub point_de_terminaison: String,

    #[arg(long, env = "ETYMO_S3_REGION", default_value = "fr-par")]
    pub region: String,

    /// Développement seulement : date à laquelle simuler la parution. Refusée
    /// hors d'un bucket simulé sur disque, pour ne jamais publier en avance.
    #[arg(long)]
    pub simuler_le: Option<chrono::DateTime<chrono::Utc>>,
}
