//! Non-régression du durcissement (J8, App#30) : corps bornés, requêtes mal
//! formées refusées sans erreur serveur, route de réinitialisation absente.

mod commun;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use etymo_api::Limiteurs;
use sqlx::PgPool;

use commun::{appeler, banc, session};

/// Toutes les routes `POST` de l'API (hors production).
const ROUTES_POST: [&str; 13] = [
    "/session",
    "/fusion",
    "/pli",
    "/sablier",
    "/sablier/achat",
    "/indice",
    "/jalon",
    "/ricochet",
    "/palier",
    "/carte-de-lecteur",
    "/cadeau",
    "/quete-initiale",
    "/quete-du-jour",
];

fn post_brut(jeton: &str, chemin: &str, corps: String) -> Request<Body> {
    Request::post(chemin)
        .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(corps))
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn le_corps_est_borne_sur_chaque_route(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let trop_gros = format!(r#"{{"x":"{}"}}"#, "a".repeat(20_000));
    for chemin in ROUTES_POST {
        let (statut, _, _) =
            appeler(&banc.routeur, post_brut(&jeton, chemin, trop_gros.clone())).await;
        assert_eq!(statut, StatusCode::PAYLOAD_TOO_LARGE, "{chemin}");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_requete_mal_formee_ou_a_proprietes_inconnues_est_refusee_sans_erreur_serveur(
    base: PgPool,
) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    for chemin in ROUTES_POST {
        for corps in [r#"{"intrus":true}"#, "[]", "null", "pas du json", ""] {
            let (statut, _, _) =
                appeler(&banc.routeur, post_brut(&jeton, chemin, corps.to_owned())).await;
            assert!(statut.is_client_error(), "{chemin} {corps:?} -> {statut}");
        }
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_reinitialisation_est_absente_en_production(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        post_brut(&jeton, "/dev/reset", String::new()),
    )
    .await;
    assert_eq!(statut, StatusCode::NOT_FOUND);
}

/// La liste ci-dessus suit les routes : une route `POST` ajoutée doit y figurer.
#[test]
fn la_liste_des_routes_post_est_complete() {
    let source = include_str!("../src/routes.rs");
    let declarees = source
        .lines()
        .filter(|l| l.trim_start().starts_with(".route(") && l.contains("post("))
        .filter(|l| !l.contains("/dev/reset"))
        .count();
    assert_eq!(declarees, ROUTES_POST.len());
}
