use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use axum::http::HeaderValue;
use clap::Parser;
use etymo_api::config::{Cli, Commande, ConfigBase, ConfigParution, ConfigServeur};
use etymo_api::{CatalogueVivant, EtatApp, Limiteurs, MIGRATIONS, Signataire, openapi, routeur};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

/// Sans sous-commande, la configuration du serveur vient de l'environnement seul.
#[derive(Parser)]
struct ServeurSeul {
    #[command(flatten)]
    config: ConfigServeur,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Journaux structurés en JSON pour Cockpit, sans corps de requête ni
    // en-tête : ni secret, ni jeton, ni adresse réseau (ADR 0010).
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_current_span(false)
        .init();

    match Cli::parse().commande {
        None => servir(ServeurSeul::parse_from(["etymo-api"]).config).await,
        Some(Commande::Servir(config)) => servir(config).await,
        Some(Commande::PublierFascicules(config)) => publier(config).await,
        Some(Commande::Purger(config)) => {
            let rapport = etymo_taches::purger(&connecter(&config)?).await?;
            tracing::info!(commandes = rapport.commandes, "purges terminées");
            Ok(())
        }
        Some(Commande::Migrer(config)) => {
            MIGRATIONS.run(&connecter(&config)?).await?;
            tracing::info!("migrations appliquées");
            Ok(())
        }
        Some(Commande::Openapi) => {
            print!("{}", openapi::json());
            Ok(())
        }
    }
}

fn connecter(config: &ConfigBase) -> anyhow::Result<PgPool> {
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .connect_lazy(&config.database_url)
        .context("adresse de base invalide")
}

async fn servir(config: ConfigServeur) -> anyhow::Result<()> {
    let base = connecter(&config.base)?;
    if config.migrer {
        MIGRATIONS.run(&base).await.context("migrations")?;
    }
    let signataire = Signataire::nouveau(config.cle_signature.as_bytes())?;
    let origines = config
        .origines
        .iter()
        .filter(|o| !o.trim().is_empty())
        .map(|o| HeaderValue::from_str(o.trim()))
        .collect::<Result<Vec<_>, _>>()
        .context("ETYMO_ORIGINES_PWA")?;

    let catalogue = CatalogueVivant::depuis_url(&config.catalogue_url)?;
    if let Err(e) = catalogue.rafraichir().await {
        tracing::error!(erreur = %e, "catalogue illisible au démarrage");
    }
    let etat = Arc::new(EtatApp {
        base,
        catalogue,
        signataire,
        limiteurs: Limiteurs::default(),
    });

    let relecture = Arc::clone(&etat);
    let periode = Duration::from_secs(config.relecture_s.max(5));
    tokio::spawn(async move {
        let mut intervalle = tokio::time::interval(periode);
        intervalle.tick().await;
        loop {
            intervalle.tick().await;
            if let Err(e) = relecture.catalogue.rafraichir().await {
                tracing::warn!(erreur = %e, "relecture du catalogue impossible, version précédente conservée");
            }
            relecture.limiteurs.oublier();
        }
    });

    let adresse = SocketAddr::from(([0, 0, 0, 0], config.port));
    let ecoute = tokio::net::TcpListener::bind(adresse).await?;
    tracing::info!(%adresse, "API à l'écoute");
    axum::serve(
        ecoute,
        routeur(etat, &origines).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(arret())
    .await?;
    Ok(())
}

async fn arret() {
    let interruption = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminaison = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminaison = std::future::pending::<()>();
    tokio::select! {
        () = interruption => {}
        () = terminaison => {}
    }
}

async fn publier(config: ConfigParution) -> anyhow::Result<()> {
    let (bucket, cible) = etymo_taches::stockage::bucket_catalogue(
        &config.s3,
        &config.point_de_terminaison,
        &config.region,
        &config.bucket,
    )?;
    let maintenant = match (config.simuler_le, cible) {
        (None, _) => chrono::Utc::now(),
        (Some(date), etymo_taches::Cible::Dossier) => date,
        (Some(_), etymo_taches::Cible::Bucket) => {
            anyhow::bail!(
                "--simuler-le n'est accepté qu'avec un bucket simulé (ETYMO_S3_POINT=file://…)"
            )
        }
    };
    let rapport = etymo_taches::publier_fascicules(bucket.as_ref(), cible, maintenant).await?;
    tracing::info!(
        parus = ?rapport.parus,
        a_venir = rapport.a_venir,
        copies = rapport.copies,
        index_ecrit = rapport.index_ecrit,
        conserves = ?rapport.conserves,
        "parution terminée"
    );
    Ok(())
}
