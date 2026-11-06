//! Quêtes du jour, de bout en bout (ADR 0045) : tirage à la première visite,
//! progression par les ricochets, quête de table faite par la découverte.

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{GEO, LOGIE, MOT, SENS_GEO};
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, post_fusion, session};

fn quete<'a>(etat: &'a Value, code: &str) -> &'a Value {
    etat["quetes_du_jour"]
        .as_array()
        .unwrap()
        .iter()
        .find(|q| q["code"] == code)
        .unwrap_or_else(|| panic!("pas de quête {code} : {}", etat["quetes_du_jour"]))
}

async fn repondre_juste(banc: &commun::Banc, jeton: &str, etat: &Value) -> Value {
    let demande = commande(
        etat,
        json!({ "format": "sens_brique", "unite_id": GEO, "reponse": SENS_GEO }),
    );
    let (statut, _, reponse) = appeler(&banc.routeur, post(jeton, "/ricochet", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    reponse["etat"].clone()
}

#[sqlx::test(migrations = "../../migrations")]
async fn le_tirage_du_jour_se_fait_une_fois_et_reste_stable(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, premier) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let quetes = premier["quetes_du_jour"].as_array().unwrap();
    assert!(!quetes.is_empty() && quetes.len() <= 3, "{quetes:?}");
    // Deux briques de graine : ni découpe ni paires, mais la table et la mémoire.
    assert_eq!(quete(&premier, "table_sens")["mot_id"], MOT);
    assert_eq!(quete(&premier, "memoire_sans_faute")["cible"], 5);
    let (_, _, second) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(premier["quetes_du_jour"], second["quetes_du_jour"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn cinq_ricochets_justes_font_la_quete_de_memoire(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, mut etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    for attendu in 1..=5 {
        etat = repondre_juste(&banc, &jeton, &etat).await;
        let q = quete(&etat, "memoire_sans_faute");
        assert_eq!(q["progres"], attendu, "{q}");
        assert_eq!(q["faite"], attendu == 5);
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_erreur_remet_la_suite_a_zero(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let etat = repondre_juste(&banc, &jeton, &etat).await;
    assert_eq!(quete(&etat, "memoire_sans_faute")["progres"], 1);
    let faux = commande(
        &etat,
        json!({ "format": "sens_brique", "unite_id": GEO, "reponse": etymo_catalogue::essai::SENS_LOGIE }),
    );
    let (_, _, reponse) = appeler(&banc.routeur, post(&jeton, "/ricochet", &faux)).await;
    assert_eq!(reponse["juste"], false, "{reponse}");
    assert_eq!(quete(&reponse["etat"], "memoire_sans_faute")["progres"], 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn decouvrir_le_mot_vise_fait_la_quete_de_table(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(quete(&etat, "table_sens")["faite"], false);
    let fusion = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (_, _, decouverte) = appeler(&banc.routeur, post_fusion(&jeton, &fusion)).await;
    assert_eq!(quete(&decouverte["etat"], "table_sens")["faite"], true);
}
