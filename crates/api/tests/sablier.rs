//! Sabliers, de bout en bout (ADR 0018, 0020).

mod commun;

use axum::http::StatusCode;
use chrono::{DateTime, TimeDelta, Utc};
use etymo_api::Limiteurs;
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, post_pli, session, somme_mouvements};

/// Ouvre un pli pour que l'énergie ne soit plus pleine, et donne 20 gouttes.
async fn preparer(base: &PgPool, routeur: &axum::Router, jeton: &str) -> Value {
    let (_, _, etat) = appeler(routeur, get_etat(jeton)).await;
    let demande = commande(&etat, json!({ "fascicule_id": "fsc_00000000" }));
    let (statut, _, reponse) = appeler(routeur, post_pli(jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    sqlx::query("UPDATE encre SET gouttes = gouttes + 20")
        .execute(base)
        .await
        .unwrap();
    sqlx::query("INSERT INTO mouvement (joueur_id, ressource, delta, motif) SELECT id, 'encre', 20, 'pli' FROM joueur")
        .execute(base)
        .await
        .unwrap();
    appeler(routeur, get_etat(jeton)).await.2
}

fn instant(valeur: &Value) -> DateTime<Utc> {
    valeur.as_str().unwrap().parse().unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_sablier_avance_la_recharge_d_une_heure_et_se_rejoue(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let etat = preparer(&base, &banc.routeur, &jeton).await;
    let encre = etat["encre"].as_u64().unwrap();
    let avant = instant(&etat["energie"]["prochaine_charge"]);

    let demande = commande(&etat, json!({ "nombre": 3 }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/sablier", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["depuis_encre"], 3);
    assert_eq!(reponse["etat"]["encre"].as_u64().unwrap(), encre - 3);
    assert_eq!(
        instant(&reponse["etat"]["energie"]["prochaine_charge"]),
        avant - TimeDelta::hours(3)
    );
    assert_eq!(reponse["etat"]["sabliers"]["utilises_24h"], 3);
    assert_eq!(reponse["etat"]["sabliers"]["detenus"], 0);

    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/sablier", &demande)).await;
    assert_eq!(rejouee, reponse);
    assert_eq!(
        somme_mouvements(&base, "encre").await,
        i64::try_from(encre - 3).unwrap()
    );
    assert_eq!(somme_mouvements(&base, "sablier").await, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn les_sabliers_detenus_passent_avant_l_encre(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    preparer(&base, &banc.routeur, &jeton).await;
    sqlx::query("INSERT INTO sablier (joueur_id, detenus) SELECT id, 2 FROM joueur")
        .execute(&base)
        .await
        .unwrap();
    sqlx::query("INSERT INTO mouvement (joueur_id, ressource, delta, motif) SELECT id, 'sablier', 2, 'jalon' FROM joueur")
        .execute(&base)
        .await
        .unwrap();
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = commande(&etat, json!({ "nombre": 3 }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/sablier", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(
        (&reponse["depuis_detenus"], &reponse["depuis_encre"]),
        (&json!(2), &json!(1))
    );
    assert_eq!(reponse["etat"]["sabliers"]["detenus"], 0);
    assert_eq!(somme_mouvements(&base, "sablier").await, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn refus_energie_pleine_plafond_et_encre(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(&jeton, "/sablier", &commande(&etat, json!({ "nombre": 1 }))),
    )
    .await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "énergie pleine");

    let etat = preparer(&base, &banc.routeur, &jeton).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(
            &jeton,
            "/sablier",
            &commande(&etat, json!({ "nombre": 13 })),
        ),
    )
    .await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);

    // Dix sabliers utilisés il y a 23 h comptent encore ; il y a 25 h, plus.
    sqlx::query("INSERT INTO mouvement (joueur_id, ressource, delta, motif, le) SELECT id, 'sablier', -10, 'sablier', now() - interval '23 hours' FROM joueur")
        .execute(&base)
        .await
        .unwrap();
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(&jeton, "/sablier", &commande(&etat, json!({ "nombre": 3 }))),
    )
    .await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "plafond quotidien");
    sqlx::query("UPDATE mouvement SET le = now() - interval '25 hours' WHERE delta = -10")
        .execute(&base)
        .await
        .unwrap();
    let (statut, _, reponse) = appeler(
        &banc.routeur,
        post(&jeton, "/sablier", &commande(&etat, json!({ "nombre": 3 }))),
    )
    .await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");

    sqlx::query("UPDATE encre SET gouttes = 0")
        .execute(&base)
        .await
        .unwrap();
    let etat = &reponse["etat"];
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(&jeton, "/sablier", &commande(etat, json!({ "nombre": 1 }))),
    )
    .await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "encre insuffisante");
}
