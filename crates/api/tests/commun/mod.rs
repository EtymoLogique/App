//! Banc d'essai commun : routeur complet, base neuve par test (`#[sqlx::test]`)
//! et catalogue fictif sur disque.
#![allow(dead_code)]

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderValue, Request, StatusCode, header};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use etymo_api::courriel::{Courriel, Expediteur};
use etymo_api::{CatalogueVivant, EtatApp, Limiteurs, Signataire, routeur};
use etymo_catalogue::{INDEX, LecteurDossier, essai};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

pub const ORIGINE: &str = "https://pwa.exemple.test";

pub struct Banc {
    pub routeur: Router,
    pub app: Arc<EtatApp>,
    pub dossier: tempfile::TempDir,
}

pub async fn banc(base: PgPool, limiteurs: Limiteurs) -> Banc {
    banc_avec(base, limiteurs, false).await
}

pub async fn banc_avec(base: PgPool, limiteurs: Limiteurs, reinitialisation: bool) -> Banc {
    banc_complet(base, limiteurs, reinitialisation, false).await
}

/// Banc dont les e-mails de connexion s'écrivent dans `dossier/courriels`.
pub async fn banc_courriel(base: PgPool) -> Banc {
    banc_complet(base, Limiteurs::default(), false, true).await
}

async fn banc_complet(
    base: PgPool,
    limiteurs: Limiteurs,
    reinitialisation: bool,
    courriel: bool,
) -> Banc {
    let dossier = tempfile::tempdir().unwrap();
    let courriel = courriel.then(|| {
        Courriel::nouveau(
            &[5; 32],
            "https://pwa.exemple.test",
            Expediteur::Fichier(dossier.path().join("courriels")),
        )
        .unwrap()
    });
    let manifeste = essai::fascicule(dossier.path(), 0, "2026-10-01T08:00:00+02:00");
    essai::calendrier(
        dossier.path(),
        INDEX,
        "v-essai",
        &[(0, "2026-10-01T08:00:00+02:00", &manifeste)],
    );
    let catalogue = CatalogueVivant::nouveau(Box::new(LecteurDossier::nouveau(dossier.path())));
    catalogue.rafraichir().await.unwrap();
    let etat = Arc::new(EtatApp {
        base,
        catalogue,
        signataire: Signataire::nouveau(&[3; 32]).unwrap(),
        limiteurs,
        recharge: etymo_domaine::energie::RECHARGE,
        reinitialisation,
        courriel,
        kofi_token: Some("jeton-kofi-essai".into()),
    });
    Banc {
        routeur: routeur(etat.clone(), &[HeaderValue::from_static(ORIGINE)]),
        app: etat,
        dossier,
    }
}

pub async fn appeler(
    routeur: &Router,
    requete: Request<Body>,
) -> (StatusCode, axum::http::HeaderMap, Value) {
    let reponse = routeur.clone().oneshot(requete).await.unwrap();
    let statut = reponse.status();
    let entetes = reponse.headers().clone();
    let octets = reponse.into_body().collect().await.unwrap().to_bytes();
    let corps = serde_json::from_slice(&octets).unwrap_or(Value::Null);
    (statut, entetes, corps)
}

pub fn post_session(corps: &Value) -> Request<Body> {
    Request::post("/session")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(corps.to_string()))
        .unwrap()
}

pub fn get_etat(jeton: &str) -> Request<Body> {
    Request::get("/etat")
        .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
        .body(Body::empty())
        .unwrap()
}

pub fn secret(octet: u8) -> String {
    URL_SAFE_NO_PAD.encode([octet; 32])
}

pub fn post_fusion(jeton: &str, corps: &Value) -> Request<Body> {
    Request::post("/fusion")
        .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(corps.to_string()))
        .unwrap()
}

pub fn post_pli(jeton: &str, corps: &Value) -> Request<Body> {
    Request::post("/pli")
        .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(corps.to_string()))
        .unwrap()
}

/// Ouvre la session d'un profil neuf et renvoie son jeton.
pub async fn session(routeur: &Router) -> String {
    let demande = json!({ "installation": Uuid::new_v4(), "secret": secret(9) });
    let (statut, _, corps) = appeler(routeur, post_session(&demande)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    corps["jeton"].as_str().unwrap().to_owned()
}

pub fn post(jeton: &str, chemin: &str, corps: &Value) -> Request<Body> {
    Request::post(chemin)
        .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(corps.to_string()))
        .unwrap()
}

/// Commande idempotente à jour de l'état, complétée par `champs`.
pub fn commande(etat: &Value, champs: Value) -> Value {
    let mut corps = json!({
        "commande": Uuid::new_v4(),
        "version_etat": etat["version_etat"],
        "version_catalogue": etat["version_catalogue"],
    });
    if let Value::Object(champs) = champs {
        corps.as_object_mut().unwrap().extend(champs);
    }
    corps
}

/// Solde tenu égal à la somme de ses mouvements.
pub async fn somme_mouvements(base: &PgPool, ressource: &str) -> i64 {
    sqlx::query_scalar("SELECT COALESCE(SUM(delta), 0)::bigint FROM mouvement WHERE ressource = $1")
        .bind(ressource)
        .fetch_one(base)
        .await
        .unwrap()
}
