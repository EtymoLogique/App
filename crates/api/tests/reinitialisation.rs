//! Réinitialisation du joueur, hors production seulement.

mod commun;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use etymo_api::Limiteurs;
use serde_json::json;
use sqlx::PgPool;

use etymo_catalogue::essai::{GEO, LOGIE};

use commun::{
    appeler, banc, banc_avec, commande, get_etat, post, post_fusion, post_pli, session,
    somme_mouvements,
};

fn post_reset(jeton: &str) -> Request<Body> {
    Request::post("/dev/reset")
        .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
        .body(Body::empty())
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn en_production_la_route_n_existe_pas(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let (statut, _, _) = appeler(&banc.routeur, post_reset(&jeton)).await;
    assert_eq!(statut, StatusCode::NOT_FOUND);
    let (_, _, apres) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(apres, etat, "la progression n'a pas bougé");

    let (_, _, sante) = appeler(
        &banc.routeur,
        Request::get("/sante").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(sante["reinitialisation"], false);
}

#[sqlx::test(migrations = "../../migrations")]
async fn hors_production_le_joueur_repart_de_zero(base: PgPool) {
    let banc = banc_avec(base.clone(), Limiteurs::default(), true).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        Request::post("/dev/reset").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED, "session exigée");

    let jeton = session(&banc.routeur).await;
    let (_, _, depart) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = commande(&depart, json!({ "fascicule_id": "fsc_00000000" }));
    let (statut, _, _) = appeler(&banc.routeur, post_pli(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK);

    let (statut, _, etat) = appeler(&banc.routeur, post_reset(&jeton)).await;
    assert_eq!(statut, StatusCode::OK, "{etat}");
    assert_eq!(etat["encre"], 10_000);
    assert_eq!(etat["decouvertes"], json!([]));
    assert_eq!(etat["energie"]["charges"], etat["energie"]["capacite"]);
    assert_eq!(etat["historique_plis"], json!([]));
    assert_ne!(depart["reserve"], json!([]), "graines reçues au départ");
    assert_eq!(
        etat["reserve"],
        json!([]),
        "codex vide : graines non rendues"
    );
    let (_, _, synchronise) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(
        synchronise["reserve"],
        json!([]),
        "la synchronisation ne ressème pas"
    );
    assert_eq!(somme_mouvements(&base, "encre").await, 10_000);
    assert!(etat["version_etat"].as_i64() > depart["version_etat"].as_i64());

    let (_, _, sante) = appeler(
        &banc.routeur,
        Request::get("/sante").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(sante["reinitialisation"], true);
}

/// Pour recetter les quêtes (ADR 0042) : après la réinitialisation, une
/// récompense de jalon déjà récupérée redevient à récupérer dès que le jalon
/// est de nouveau atteint.
#[sqlx::test(migrations = "../../migrations")]
async fn la_reinitialisation_remet_les_recompenses_de_jalon_a_recuperer(base: PgPool) {
    const JALON: &str = "jal_0000000a";
    let banc = banc_avec(base.clone(), Limiteurs::default(), true).await;
    let jeton = session(&banc.routeur).await;
    let atteindre = async || {
        let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
        let demande = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
        let (statut, _, reponse) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
        assert_eq!(statut, StatusCode::OK, "{reponse}");
        assert_eq!(reponse["jalons"], json!([JALON]));
        reponse["etat"].clone()
    };
    let recuperer = async |etat: &serde_json::Value| {
        let demande = commande(etat, json!({ "jalon_id": JALON }));
        let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/jalon", &demande)).await;
        assert_eq!(statut, StatusCode::OK, "{reponse}");
        assert_eq!(reponse["etat"]["jalons_recuperes"], json!([JALON]));
    };

    let etat = atteindre().await;
    recuperer(&etat).await;

    let (statut, _, etat) = appeler(&banc.routeur, post_reset(&jeton)).await;
    assert_eq!(statut, StatusCode::OK, "{etat}");
    assert_eq!(etat["jalons_atteints"], json!([]));
    assert_eq!(etat["jalons_recuperes"], json!([]));

    // La réinitialisation ne rend pas les graines : les deux briques reviennent à la main.
    sqlx::query(
        "INSERT INTO exemplaire (joueur_id, brique_id, nombre)
         SELECT id, b, 1 FROM joueur, unnest($1::text[]) AS b",
    )
    .bind([GEO, LOGIE])
    .execute(&base)
    .await
    .unwrap();
    let etat = atteindre().await;
    assert_eq!(etat["jalons_atteints"], json!([JALON]));
    assert_eq!(etat["jalons_recuperes"], json!([]));
    recuperer(&etat).await;
}

/// Les paliers de quêtes au long cours (ADR 0045) se recettent de même : la
/// réinitialisation efface les récompenses récupérées.
#[sqlx::test(migrations = "../../migrations")]
async fn la_reinitialisation_remet_les_paliers_a_recuperer(base: PgPool) {
    const PALIER: &str = "pal_0000000a";
    let banc = banc_avec(base.clone(), Limiteurs::default(), true).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (_, _, reponse) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    let demande = commande(&reponse["etat"], json!({ "palier_id": PALIER }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/palier", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["etat"]["paliers_recuperes"], json!([PALIER]));

    let (statut, _, etat) = appeler(&banc.routeur, post_reset(&jeton)).await;
    assert_eq!(statut, StatusCode::OK, "{etat}");
    assert_eq!(etat["paliers_recuperes"], json!([]));
}
