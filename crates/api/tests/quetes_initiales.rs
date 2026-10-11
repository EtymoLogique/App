//! Quêtes initiales de la première semaine (ADR 0046) : faites une fois,
//! récompense à récupérer, plis offerts du fascicule choisi, sans énergie.

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{GEO, LOGIE};
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, post_fusion, session};

const FASCICULE: &str = "fsc_00000000";

fn quete<'a>(etat: &'a Value, code: &str) -> &'a Value {
    etat["quetes_initiales"]
        .as_array()
        .unwrap()
        .iter()
        .find(|q| q["code"] == code)
        .unwrap_or_else(|| panic!("pas de quête {code} : {}", etat["quetes_initiales"]))
}

async fn marquer_faite(base: &PgPool, code: &str) {
    sqlx::query("INSERT INTO quete_initiale (joueur_id, code) SELECT id, $1 FROM joueur")
        .bind(code)
        .execute(base)
        .await
        .unwrap();
}

#[sqlx::test(migrations = "../../migrations")]
async fn quatre_quetes_dont_la_progression_suit_les_decouvertes(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(etat["quetes_initiales"].as_array().unwrap().len(), 4);
    assert_eq!(quete(&etat, "trois_mots")["progres"], 0);
    assert_eq!(quete(&etat, "trois_mots")["cible"], 3);
    assert_eq!(quete(&etat, "trois_mots")["recompense"]["plis_offerts"], 2);
    let fusion = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (_, _, decouverte) = appeler(&banc.routeur, post_fusion(&jeton, &fusion)).await;
    let etat = &decouverte["etat"];
    assert_eq!(quete(etat, "trois_mots")["progres"], 1);
    assert_eq!(quete(etat, "trois_mots")["faite"], false);
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_quete_faite_se_recupere_une_fois(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    appeler(&banc.routeur, get_etat(&jeton)).await;
    marquer_faite(&base, "premiers_ricochets").await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(quete(&etat, "premiers_ricochets")["faite"], true);

    let demande = commande(&etat, json!({ "code": "premiers_ricochets" }));
    let (statut, _, reponse) =
        appeler(&banc.routeur, post(&jeton, "/quete-initiale", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(
        reponse["etat"]["sabliers"]["detenus"].as_i64().unwrap(),
        etat["sabliers"]["detenus"].as_i64().unwrap() + 3
    );
    assert_eq!(
        quete(&reponse["etat"], "premiers_ricochets")["recuperee"],
        true
    );
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/quete-initiale", &demande)).await;
    assert_eq!(rejouee, reponse);
    let autre = commande(&reponse["etat"], json!({ "code": "premiers_ricochets" }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/quete-initiale", &autre)).await;
    assert_eq!(statut, StatusCode::CONFLICT);
}

#[sqlx::test(migrations = "../../migrations")]
async fn les_plis_offerts_viennent_du_fascicule_choisi_sans_energie(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    appeler(&banc.routeur, get_etat(&jeton)).await;
    marquer_faite(&base, "trois_mots").await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let sans = commande(&etat, json!({ "code": "trois_mots" }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/quete-initiale", &sans)).await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);

    let demande = commande(
        &etat,
        json!({ "code": "trois_mots", "fascicule_id": FASCICULE }),
    );
    let (statut, _, reponse) =
        appeler(&banc.routeur, post(&jeton, "/quete-initiale", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["ouvertures"].as_array().unwrap().len(), 2);
    assert_eq!(
        reponse["etat"]["energie"]["charges"],
        etat["energie"]["charges"]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn pas_faite_pas_de_recompense_et_passe_la_semaine_plus_de_quete(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = commande(
        &etat,
        json!({ "code": "premiere_carte", "fascicule_id": FASCICULE }),
    );
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/quete-initiale", &demande)).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);

    sqlx::query("UPDATE joueur SET cree_le = now() - interval '10 days'")
        .execute(&base)
        .await
        .unwrap();
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(etat["quetes_initiales"], json!([]));
}
