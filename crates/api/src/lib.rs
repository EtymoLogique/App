//! API de jeu d'ÉtymoLogique (ADR 0024) : un seul service sans état, qui fait
//! foi pour toute mutation de la progression (ADR 0007).

pub mod carte_lecteur;
pub mod catalogue;
pub mod compte;
pub mod config;
pub mod courriel;
pub mod debit;
pub mod erreur;
pub mod extraction;
pub mod jeton;
pub mod openapi;
pub mod progression;
pub mod quetes_initiales;
pub mod quetes_jour;
pub mod ricochets;
pub mod routes;
pub mod secret;

use std::sync::Arc;

use axum::Router;
use axum::http::{HeaderValue, Method, header};
use sqlx::PgPool;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::set_header::SetResponseHeaderLayer;

pub use catalogue::CatalogueVivant;
pub use debit::Limiteurs;
pub use jeton::Signataire;

/// Taille maximale d'un corps de requête : les commandes sont petites.
pub const CORPS_MAX: usize = 8 * 1024;

pub static MIGRATIONS: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");

/// État partagé par toutes les requêtes.
pub struct EtatApp {
    pub base: PgPool,
    pub catalogue: CatalogueVivant,
    pub signataire: Signataire,
    pub limiteurs: Limiteurs,
    /// Durée d'une recharge de pli.
    pub recharge: chrono::TimeDelta,
    /// Route de réinitialisation du joueur : hors production seulement.
    pub reinitialisation: bool,
    /// E-mails de connexion des comptes (ADR 0070) ; `None` : comptes désactivés.
    pub courriel: Option<courriel::Courriel>,
}

pub fn routeur(etat: Arc<EtatApp>, origines: &[HeaderValue]) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origines.iter().cloned()))
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(std::time::Duration::from_secs(600));

    let mut routes = routes::routes();
    if etat.reinitialisation {
        routes = routes.merge(routes::routes_hors_prod());
    }
    routes
        .with_state(etat)
        .layer(RequestBodyLimitLayer::new(CORPS_MAX))
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=63072000; includeSubDomains"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'"),
        ))
}
