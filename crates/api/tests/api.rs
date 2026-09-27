//! Tests de bout en bout du routeur, contre une base PostgreSQL neuve par test
//! (`#[sqlx::test]`, migrations appliquées) et un catalogue fictif sur disque.

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderValue, Request, StatusCode, header};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use etymo_api::{CatalogueVivant, EtatApp, Limiteurs, Signataire, routeur};
use etymo_catalogue::{INDEX, LecteurDossier, essai};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

const ORIGINE: &str = "https://pwa.exemple.test";

struct Banc {
    routeur: Router,
    _dossier: tempfile::TempDir,
}

async fn banc(base: PgPool, limiteurs: Limiteurs) -> Banc {
    let dossier = tempfile::tempdir().unwrap();
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
    });
    Banc {
        routeur: routeur(etat, &[HeaderValue::from_static(ORIGINE)]),
        _dossier: dossier,
    }
}

async fn appeler(
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

fn post_session(corps: &Value) -> Request<Body> {
    Request::post("/session")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(corps.to_string()))
        .unwrap()
}

fn get_etat(jeton: &str) -> Request<Body> {
    Request::get("/etat")
        .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
        .body(Body::empty())
        .unwrap()
}

fn secret(octet: u8) -> String {
    URL_SAFE_NO_PAD.encode([octet; 32])
}

#[sqlx::test(migrations = "../../migrations")]
async fn sante_donne_la_version_du_catalogue(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let (statut, entetes, corps) = appeler(
        &banc.routeur,
        Request::get("/sante").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(corps["statut"], "ok");
    assert_eq!(corps["version_catalogue"], "v-essai");
    assert_eq!(entetes[header::CACHE_CONTROL], "no-store");
    assert_eq!(entetes[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
}

#[sqlx::test(migrations = "../../migrations")]
async fn cree_puis_reprend_un_profil_invite(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    let demande = json!({ "installation": installation, "secret": secret(1) });

    let (statut, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    assert_eq!(corps["nouveau"], true);
    let jeton = corps["jeton"].as_str().unwrap().to_owned();

    let (statut, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(corps["nouveau"], false);

    // Le secret n'est jamais stocké, seulement son empreinte.
    let empreinte: Vec<u8> =
        sqlx::query_scalar("SELECT empreinte_secret FROM joueur WHERE id = $1")
            .bind(installation)
            .fetch_one(&base)
            .await
            .unwrap();
    assert_eq!(empreinte.len(), 32);
    assert_ne!(empreinte, [1u8; 32]);

    let (statut, _, corps) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(
        corps,
        json!({ "version_etat": 0, "version_catalogue": "v-essai" })
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn refuse_un_mauvais_secret(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    appeler(
        &banc.routeur,
        post_session(&json!({ "installation": installation, "secret": secret(1) })),
    )
    .await;

    let (statut, _, corps) = appeler(
        &banc.routeur,
        post_session(&json!({ "installation": installation, "secret": secret(2) })),
    )
    .await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);
    assert_eq!(corps["code"], "non_authentifie");
    assert!(corps.get("jeton").is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn refuse_les_requetes_mal_formees(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    for demande in [
        json!({ "installation": installation, "secret": "court" }),
        json!({ "installation": installation, "secret": secret(1), "nom": "inconnu" }),
        json!({ "installation": "pas-un-uuid", "secret": secret(1) }),
        // UUID v1 : l'identifiant d'installation doit être aléatoire.
        json!({ "installation": "6fa459ea-ee8a-11d1-b8c5-00a0c91e6bf6", "secret": secret(1) }),
    ] {
        let (statut, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
        assert_eq!(statut, StatusCode::BAD_REQUEST, "{demande}");
        assert_eq!(corps["code"], "requete_invalide");
    }

    let trop_gros = Request::post("/session")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(format!(
            r#"{{"secret":"{}"}}"#,
            "a".repeat(20_000)
        )))
        .unwrap();
    let (statut, _, _) = appeler(&banc.routeur, trop_gros).await;
    assert_eq!(statut, StatusCode::PAYLOAD_TOO_LARGE);
}

#[sqlx::test(migrations = "../../migrations")]
async fn etat_exige_un_jeton_valide(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        Request::get("/etat").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);

    let (statut, _, _) = appeler(&banc.routeur, get_etat("abc.def")).await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);

    // Un jeton bien signé pour un profil inexistant ne donne rien non plus.
    let (jeton, _) = Signataire::nouveau(&[3; 32])
        .unwrap()
        .emettre(Uuid::new_v4(), chrono::Utc::now());
    let (statut, _, _) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "../../migrations")]
async fn limite_le_debit_des_sessions(base: PgPool) {
    let banc = banc(base, Limiteurs::nouveau(2, 100)).await;
    let demande = json!({ "installation": Uuid::new_v4(), "secret": secret(1) });
    let mut statuts = Vec::new();
    for _ in 0..3 {
        let requete = Request::post("/session")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-forwarded-for", "203.0.113.7")
            .body(Body::from(demande.to_string()))
            .unwrap();
        statuts.push(appeler(&banc.routeur, requete).await.0);
    }
    assert_eq!(
        statuts,
        [
            StatusCode::OK,
            StatusCode::OK,
            StatusCode::TOO_MANY_REQUESTS
        ]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn cors_limite_a_l_origine_de_la_pwa(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let preflight = |origine: &'static str| {
        Request::options("/session")
            .header(header::ORIGIN, origine)
            .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
            .body(Body::empty())
            .unwrap()
    };
    let (_, entetes, _) = appeler(&banc.routeur, preflight(ORIGINE)).await;
    assert_eq!(entetes[header::ACCESS_CONTROL_ALLOW_ORIGIN], ORIGINE);
    let (_, entetes, _) = appeler(&banc.routeur, preflight("https://intrus.exemple.test")).await;
    assert!(entetes.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn purge_les_commandes_de_plus_de_30_jours(base: PgPool) {
    let joueur = Uuid::new_v4();
    sqlx::query("INSERT INTO joueur (id, empreinte_secret) VALUES ($1, $2)")
        .bind(joueur)
        .bind(vec![0u8; 32])
        .execute(&base)
        .await
        .unwrap();
    for jours in [31, 29] {
        sqlx::query(
            "INSERT INTO commande (joueur_id, id, type, statut, reponse, recue_le)
             VALUES ($1, $2, 'fusion', 'acceptee', '{}', now() - make_interval(days => $3))",
        )
        .bind(joueur)
        .bind(Uuid::new_v4())
        .bind(jours)
        .execute(&base)
        .await
        .unwrap();
    }
    let rapport = etymo_taches::purger(&base).await.unwrap();
    assert_eq!(rapport.commandes, 1);
    let restantes: i64 = sqlx::query_scalar("SELECT count(*) FROM commande")
        .fetch_one(&base)
        .await
        .unwrap();
    assert_eq!(restantes, 1);
}
