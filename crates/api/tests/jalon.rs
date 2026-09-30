//! Jalons, de bout en bout (ADR 0038, 0042). Le fascicule fictif atteint un
//! jalon à la première découverte ; sa récompense, un pli de jalon (bio-) et
//! 3 sabliers, attend que le joueur vienne la récupérer.

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{BIO, GEO, LOGIE, MOT, RECETTE};
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, post_fusion, session, somme_mouvements};

const JALON: &str = "jal_0000000a";

/// Découvre le mot du banc, qui atteint le jalon ; renvoie la réponse de la fusion.
async fn atteindre(banc: &commun::Banc, jeton: &str) -> Value {
    let (_, _, etat) = appeler(&banc.routeur, get_etat(jeton)).await;
    let demande = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (statut, _, reponse) = appeler(&banc.routeur, post_fusion(jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    reponse
}

fn exemplaires(etat: &Value, brique: &str) -> u64 {
    etat["reserve"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["brique_id"] == brique)
        .map_or(0, |e| e["exemplaires"].as_u64().unwrap())
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_decouverte_atteint_le_jalon_sans_rien_accorder(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let reponse = atteindre(&banc, &jeton).await;
    assert_eq!(reponse["jalons"], json!([JALON]));
    let etat = &reponse["etat"];
    assert_eq!(etat["jalons_atteints"], json!([JALON]));
    assert_eq!(etat["jalons_recuperes"], json!([]));
    // Rien n'est accordé : la récompense attend le joueur dans les quêtes (ADR 0042).
    assert_eq!(etat["sabliers"]["detenus"], 0);
    // Seul le mot lui-même donne sa brique bio- (le banc le déclare posable).
    assert_eq!(exemplaires(etat, BIO), 1);
    assert_eq!(etat["historique_plis"], json!([]));
}

#[sqlx::test(migrations = "../../migrations")]
async fn recuperer_la_recompense_l_accorde_une_seule_fois(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let etat = atteindre(&banc, &jeton).await["etat"].clone();

    let demande = commande(&etat, json!({ "jalon_id": JALON }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/jalon", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    let etat = &reponse["etat"];
    assert_eq!(etat["jalons_recuperes"], json!([JALON]));
    assert_eq!(etat["sabliers"]["detenus"], 3);
    assert_eq!(exemplaires(etat, BIO), 2);
    assert_eq!(etat["historique_plis"][0]["regle"], "deterministe");

    // Rejouée, la commande renvoie la même réponse sans rien accorder de plus.
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/jalon", &demande)).await;
    assert_eq!(rejouee, reponse);
    // Une nouvelle commande sur le même jalon : déjà récupéré.
    let encore = commande(etat, json!({ "jalon_id": JALON }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/jalon", &encore)).await;
    assert_eq!(statut, StatusCode::CONFLICT);

    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(etat["sabliers"]["detenus"], 3);
    assert_eq!(somme_mouvements(&base, "sablier").await, 3);
    let origines: i64 =
        sqlx::query_scalar("SELECT count(*) FROM ouverture_pli WHERE origine = 'jalon'")
            .fetch_one(&base)
            .await
            .unwrap();
    assert_eq!(origines, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_jalon_pas_encore_atteint_ou_inconnu_est_refuse(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let demande = commande(&etat, json!({ "jalon_id": JALON }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/jalon", &demande)).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);

    let inconnu = commande(&etat, json!({ "jalon_id": "jal_zzzzzzzz" }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/jalon", &inconnu)).await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);

    let (_, _, apres) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(apres["version_etat"], etat["version_etat"]);
    assert_eq!(apres["sabliers"]["detenus"], 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_jalon_publie_apres_coup_s_atteint_a_la_synchronisation(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    appeler(&banc.routeur, get_etat(&jeton)).await;
    // Mot découvert avant que le catalogue ne déclare ce jalon.
    sqlx::query(
        "INSERT INTO decouverte (joueur_id, mot_id, recette_id, numero) SELECT id, $1, $2, 1 FROM joueur",
    )
    .bind(MOT)
    .bind(RECETTE)
    .execute(&base)
    .await
    .unwrap();
    let (statut, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(etat["jalons_atteints"], json!([JALON]));
    assert_eq!(etat["jalons_recuperes"], json!([]));
    assert_eq!(etat["sabliers"]["detenus"], 0);

    let demande = commande(&etat, json!({ "jalon_id": JALON }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/jalon", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["etat"]["sabliers"]["detenus"], 3);
}
