//! Jalons, de bout en bout (ADR 0038). Le fascicule fictif donne, à la
//! première découverte, un pli de jalon (bio-) et 3 sabliers.

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{BIO, GEO, LOGIE, MOT, RECETTE};
use serde_json::json;
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post_fusion, session, somme_mouvements};

const JALON: &str = "jal_0000000a";

#[sqlx::test(migrations = "../../migrations")]
async fn la_decouverte_qui_atteint_le_jalon_l_accorde_une_fois(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let demande = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (statut, _, reponse) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["jalons"], json!([JALON]));
    let etat = &reponse["etat"];
    assert_eq!(etat["jalons_atteints"], json!([JALON]));
    assert_eq!(etat["sabliers"]["detenus"], 3);
    let bio = etat["reserve"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["brique_id"] == BIO)
        .unwrap();
    assert_eq!(bio["exemplaires"], 1);
    assert_eq!(etat["historique_plis"][0]["regle"], "deterministe");

    let (_, _, rejouee) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    assert_eq!(rejouee, reponse);
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
async fn un_jalon_publie_apres_coup_s_accorde_a_la_synchronisation(base: PgPool) {
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
    assert_eq!(etat["sabliers"]["detenus"], 3);
}
