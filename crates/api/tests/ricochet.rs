//! Ricochets, de bout en bout (ADR 0044) : séance, réponse, maîtrise et idempotence.

mod commun;

use axum::http::StatusCode;
use chrono::{Days, Utc};
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{GEO, LOGIE, MOT, SENS_GEO, SENS_LOGIE};
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, post_fusion, session};

fn demain() -> String {
    Utc::now()
        .date_naive()
        .checked_add_days(Days::new(1))
        .unwrap()
        .to_string()
}

async fn repondre(
    banc: &commun::Banc,
    jeton: &str,
    etat: &Value,
    champs: Value,
) -> (StatusCode, Value) {
    let demande = commande(etat, champs);
    let (statut, _, reponse) = appeler(&banc.routeur, post(jeton, "/ricochet", &demande)).await;
    (statut, reponse)
}

fn sens_brique(unite: &str, reponse: &str) -> Value {
    json!({ "format": "sens_brique", "unite_id": unite, "reponse": reponse })
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_seance_ne_pose_que_des_cartes_trouvees(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    appeler(&banc.routeur, get_etat(&jeton)).await;

    let requete = axum::http::Request::get("/ricochets/seance")
        .header("authorization", format!("Bearer {jeton}"))
        .body(axum::body::Body::empty())
        .unwrap();
    let (statut, _, seance) = appeler(&banc.routeur, requete).await;
    assert_eq!(statut, StatusCode::OK, "{seance}");
    // Deux briques de graine, aucun mot découvert : deux questions de brique, jamais le mot.
    let questions = seance["questions"].as_array().unwrap();
    assert_eq!(questions.len(), 2, "{seance}");
    for q in questions {
        assert!(["sens_brique", "brique_sens"].contains(&q["format"].as_str().unwrap()));
        let cible = q["cartes"][0].as_str().unwrap();
        assert!([GEO, LOGIE].contains(&cible));
        assert_eq!(q["choix"].as_array().unwrap().len(), 2);
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_bonne_reponse_monte_d_un_niveau_et_ne_consomme_rien(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let (statut, reponse) = repondre(&banc, &jeton, &etat, sens_brique(GEO, SENS_GEO)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["juste"], true);
    assert_eq!(reponse["carte"]["niveau"], 1);
    assert_eq!(reponse["carte"]["maitrisee"], false);
    assert_eq!(reponse["carte"]["prochaine_revision"], demain());
    let apres = &reponse["etat"];
    assert_eq!(
        apres["version_etat"],
        etat["version_etat"].as_i64().unwrap() + 1
    );
    assert_eq!(
        apres["ricochets"],
        json!([{ "unite_id": GEO, "niveau": 1, "maitrisee": false, "a_revoir": false }])
    );
    assert_eq!(
        apres["ricochets_du_jour"],
        json!({ "reponses": 1, "bonnes": 1 })
    );
    // Rien n'est consommé : ni exemplaire, ni énergie, ni encre.
    for cle in ["reserve", "energie", "encre", "sabliers"] {
        assert_eq!(apres[cle], etat[cle], "{cle}");
    }

    // Une carte pas à revoir : le résultat est rendu, le niveau ne bouge pas.
    let (_, encore) = repondre(&banc, &jeton, apres, sens_brique(GEO, SENS_GEO)).await;
    assert_eq!(encore["juste"], true);
    assert_eq!(encore["carte"]["niveau"], 1);
    assert_eq!(
        encore["etat"]["ricochets_du_jour"],
        json!({ "reponses": 2, "bonnes": 2 })
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_mauvaise_reponse_ne_descend_pas_sous_zero(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let (statut, reponse) = repondre(&banc, &jeton, &etat, sens_brique(GEO, SENS_LOGIE)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["juste"], false);
    assert_eq!(reponse["carte"]["niveau"], 0);
    assert_eq!(reponse["carte"]["prochaine_revision"], demain());
    assert_eq!(
        reponse["etat"]["ricochets_du_jour"],
        json!({ "reponses": 1, "bonnes": 0 })
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_commande_rejouee_renvoie_la_meme_reponse(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = commande(&etat, sens_brique(GEO, SENS_GEO));

    let (_, _, premiere) = appeler(&banc.routeur, post(&jeton, "/ricochet", &demande)).await;
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/ricochet", &demande)).await;
    assert_eq!(rejouee, premiere);
    let comptes: i64 = sqlx::query_scalar("SELECT reponses::bigint FROM ricochet_jour")
        .fetch_one(&base)
        .await
        .unwrap();
    assert_eq!(comptes, 1);

    // Une nouvelle commande sur l'ancienne version : à resynchroniser.
    let (statut, _) = repondre(&banc, &jeton, &etat, sens_brique(GEO, SENS_GEO)).await;
    assert_eq!(statut, StatusCode::CONFLICT);
}

#[sqlx::test(migrations = "../../migrations")]
async fn cartes_inconnues_ou_pas_trouvees_et_reponses_mal_formees(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    // Brique inconnue du contenu.
    let (statut, _) = repondre(&banc, &jeton, &etat, sens_brique("brq_00000099", SENS_GEO)).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);
    // Mot que le joueur n'a pas encore découvert.
    let mot = json!({ "format": "decouper", "unite_id": MOT, "reponse": [3] });
    let (statut, _) = repondre(&banc, &jeton, &etat, mot).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);
    // Réponse incompatible avec le format.
    let (statut, _) = repondre(
        &banc,
        &jeton,
        &etat,
        json!({ "format": "sens_brique", "unite_id": GEO, "reponse": [3] }),
    )
    .await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);
    // Champ inconnu.
    let (statut, _) = repondre(
        &banc,
        &jeton,
        &etat,
        json!({ "format": "sens_brique", "unite_id": GEO, "reponse": SENS_GEO, "triche": true }),
    )
    .await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "../../migrations")]
async fn seules_les_cinq_premieres_reponses_du_jour_comptent(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, mut etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    for _ in 0..7 {
        let (statut, reponse) = repondre(&banc, &jeton, &etat, sens_brique(GEO, SENS_GEO)).await;
        assert_eq!(statut, StatusCode::OK, "{reponse}");
        etat = reponse["etat"].clone();
    }
    assert_eq!(
        etat["ricochets_du_jour"],
        json!({ "reponses": 5, "bonnes": 5 })
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_mot_decouvert_se_decoupe(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let fusion = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (_, _, decouverte) = appeler(&banc.routeur, post_fusion(&jeton, &fusion)).await;
    let etat = &decouverte["etat"];

    let faux = json!({ "format": "decouper", "unite_id": MOT, "reponse": [2] });
    let (statut, reponse) = repondre(&banc, &jeton, etat, faux).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["juste"], false);

    let bon = json!({ "format": "decouper", "unite_id": MOT, "reponse": [3] });
    let (_, reponse) = repondre(&banc, &jeton, &reponse["etat"], bon).await;
    assert_eq!(reponse["juste"], true);
    // La carte venait d'être ratée : à revoir demain, pas aujourd'hui.
    assert_eq!(reponse["carte"]["niveau"], 0);
}
