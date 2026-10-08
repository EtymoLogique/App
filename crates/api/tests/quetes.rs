//! Quêtes au long cours, de bout en bout (ADR 0045). L'artefact d'essai
//! déclare une quête de langue (paliers à 1 et 3 formes), une quête
//! d'élision et une quête de ricochets, que rien ne fait encore avancer.

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{
    GEO, LOGIE, PALIER_ELISION, PALIER_LANGUE_1, PALIER_LANGUE_3, PALIER_RICOCHETS, QUETE_LANGUE,
};
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, post_fusion, session, somme_mouvements};

fn progression(etat: &Value, quete: &str) -> u64 {
    etat["progression_quetes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["quete_id"] == quete)
        .map_or(u64::MAX, |p| p["progression"].as_u64().unwrap())
}

async fn recuperer(
    banc: &commun::Banc,
    jeton: &str,
    etat: &Value,
    palier: &str,
) -> (StatusCode, Value) {
    let demande = commande(etat, json!({ "palier_id": palier }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(jeton, "/palier", &demande)).await;
    (statut, reponse)
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_progression_est_calculee_par_le_serveur(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(progression(&etat, QUETE_LANGUE), 0);
    assert_eq!(etat["paliers_recuperes"], json!([]));

    let demande = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (_, _, reponse) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    let etat = &reponse["etat"];
    assert_eq!(progression(etat, QUETE_LANGUE), 1);
    assert_eq!(progression(etat, "qlc_0000000b"), 1);
    // Les ricochets n'existent pas encore : la quête reste à zéro.
    assert_eq!(progression(etat, "qlc_0000000c"), 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn recuperer_un_palier_atteint_l_accorde_une_seule_fois(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (_, _, reponse) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    let etat = reponse["etat"].clone();
    let avant = etat["encre"].as_i64().unwrap();

    let demande = commande(&etat, json!({ "palier_id": PALIER_LANGUE_1 }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/palier", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    let apres = &reponse["etat"];
    assert_eq!(apres["paliers_recuperes"], json!([PALIER_LANGUE_1]));
    assert_eq!(apres["encre"].as_i64().unwrap(), avant + 5);
    assert_eq!(apres["sabliers"]["detenus"], 2);

    // Rejouée, la commande renvoie la même réponse sans rien accorder de plus.
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/palier", &demande)).await;
    assert_eq!(rejouee, reponse);
    // Une nouvelle commande sur le même palier : déjà récupéré.
    let (statut, _) = recuperer(&banc, &jeton, apres, PALIER_LANGUE_1).await;
    assert_eq!(statut, StatusCode::CONFLICT);
    assert_eq!(somme_mouvements(&base, "sablier").await, 2);
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_palier_pas_encore_atteint_ou_inconnu_est_refuse(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let (statut, _) = recuperer(&banc, &jeton, &etat, PALIER_LANGUE_1).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);

    let demande = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (_, _, reponse) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    let etat = &reponse["etat"];
    // Une seule forme trouvée : le palier à trois formes attend.
    let (statut, _) = recuperer(&banc, &jeton, etat, PALIER_LANGUE_3).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);
    // Les ricochets n'avancent pas encore.
    let (statut, _) = recuperer(&banc, &jeton, etat, PALIER_RICOCHETS).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);
    let (statut, _) = recuperer(&banc, &jeton, etat, "pal_0000000z").await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);
    let (statut, _) = recuperer(&banc, &jeton, etat, PALIER_ELISION).await;
    assert_eq!(statut, StatusCode::OK);
}
