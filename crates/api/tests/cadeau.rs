//! Cadeau de bienvenue, de bout en bout (ADR 0046) : une fois par profil,
//! plis fixes sans énergie, sabliers et encre, rejeu idempotent.

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{BIO, GEO};
use serde_json::json;
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, session};

fn exemplaires(etat: &serde_json::Value, brique: &str) -> i64 {
    etat["reserve"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["brique_id"] == brique)
        .map_or(0, |e| e["exemplaires"].as_i64().unwrap())
}

#[sqlx::test(migrations = "../../migrations")]
async fn le_cadeau_est_annonce_puis_recupere_une_seule_fois(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let cadeau = &etat["cadeau_de_bienvenue"];
    assert_eq!(cadeau["plis"], json!([GEO, GEO, BIO]));
    assert_eq!(cadeau["recupere"], false);

    let demande = commande(&etat, json!({}));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/cadeau", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    let apres = &reponse["etat"];
    assert_eq!(apres["cadeau_de_bienvenue"]["recupere"], true);
    assert_eq!(exemplaires(apres, GEO), exemplaires(&etat, GEO) + 2);
    assert_eq!(exemplaires(apres, BIO), exemplaires(&etat, BIO) + 1);
    assert_eq!(
        apres["sabliers"]["detenus"].as_i64().unwrap(),
        etat["sabliers"]["detenus"].as_i64().unwrap() + 12
    );
    assert_eq!(
        apres["encre"].as_i64().unwrap(),
        etat["encre"].as_i64().unwrap() + 40
    );
    // Aucune énergie n'est consommée.
    assert_eq!(apres["energie"]["charges"], etat["energie"]["charges"]);

    // Rejouée : même réponse. Une autre commande : déjà récupéré.
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/cadeau", &demande)).await;
    assert_eq!(&rejouee, &reponse);
    let autre = commande(apres, json!({}));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/cadeau", &autre)).await;
    assert_eq!(statut, StatusCode::CONFLICT);
}
