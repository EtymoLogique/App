//! Sabliers, de bout en bout (ADR 0018, 0020, 0039).

mod commun;

use axum::http::StatusCode;
use chrono::{DateTime, TimeDelta, Utc};
use etymo_api::Limiteurs;
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, post_pli, session, somme_mouvements};

/// Ouvre un pli pour que l'énergie ne soit plus pleine, et donne 200 gouttes.
async fn preparer(base: &PgPool, routeur: &axum::Router, jeton: &str) -> Value {
    let (_, _, etat) = appeler(routeur, get_etat(jeton)).await;
    let demande = commande(&etat, json!({ "fascicule_id": "fsc_00000000" }));
    let (statut, _, reponse) = appeler(routeur, post_pli(jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    sqlx::query("UPDATE encre SET gouttes = gouttes + 200")
        .execute(base)
        .await
        .unwrap();
    sqlx::query("INSERT INTO mouvement (joueur_id, ressource, delta, motif) SELECT id, 'encre', 200, 'pli' FROM joueur")
        .execute(base)
        .await
        .unwrap();
    appeler(routeur, get_etat(jeton)).await.2
}

fn instant(valeur: &Value) -> DateTime<Utc> {
    valeur.as_str().unwrap().parse().unwrap()
}

/// Donne `n` sabliers détenus, tracés comme ceux d'un jalon.
async fn donner(base: &PgPool, n: i32) {
    sqlx::query("INSERT INTO sablier (joueur_id, detenus) SELECT id, $1 FROM joueur")
        .bind(n)
        .execute(base)
        .await
        .unwrap();
    sqlx::query("INSERT INTO mouvement (joueur_id, ressource, delta, motif) SELECT id, 'sablier', $1, 'jalon' FROM joueur")
        .bind(n)
        .execute(base)
        .await
        .unwrap();
}

#[sqlx::test(migrations = "../../migrations")]
async fn dix_gouttes_le_sablier_puis_une_heure_chacun(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let etat = preparer(&base, &banc.routeur, &jeton).await;
    let encre = etat["encre"].as_u64().unwrap();
    let avant = instant(&etat["energie"]["prochaine_charge"]);

    let achat = commande(&etat, json!({ "nombre": 3 }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/sablier/achat", &achat)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["prix"], 30);
    assert_eq!(reponse["etat"]["encre"].as_u64().unwrap(), encre - 30);
    assert_eq!(reponse["etat"]["sabliers"]["detenus"], 3);
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/sablier/achat", &achat)).await;
    assert_eq!(rejouee, reponse);

    let usage = commande(&reponse["etat"], json!({ "nombre": 3 }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/sablier", &usage)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(
        instant(&reponse["etat"]["energie"]["prochaine_charge"]),
        avant - TimeDelta::hours(3)
    );
    assert_eq!(reponse["etat"]["sabliers"]["detenus"], 0);
    assert_eq!(reponse["etat"]["encre"].as_u64().unwrap(), encre - 30);
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/sablier", &usage)).await;
    assert_eq!(rejouee, reponse);
    assert_eq!(
        somme_mouvements(&base, "encre").await,
        i64::try_from(encre - 30).unwrap()
    );
    assert_eq!(somme_mouvements(&base, "sablier").await, 0);

    let (statut, _, _) = appeler(
        &banc.routeur,
        post(
            &jeton,
            "/sablier",
            &commande(&reponse["etat"], json!({ "nombre": 1 })),
        ),
    )
    .await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "aucun sablier détenu");
}

#[sqlx::test(migrations = "../../migrations")]
async fn refus_energie_pleine_bornes_et_encre(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    donner(&base, 5).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(&jeton, "/sablier", &commande(&etat, json!({ "nombre": 1 }))),
    )
    .await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "énergie pleine");

    let etat = preparer(&base, &banc.routeur, &jeton).await;
    for (chemin, nombre) in [("/sablier", 121), ("/sablier/achat", 1001)] {
        let (statut, _, _) = appeler(
            &banc.routeur,
            post(
                &jeton,
                chemin,
                &commande(&etat, json!({ "nombre": nombre })),
            ),
        )
        .await;
        assert_eq!(statut, StatusCode::BAD_REQUEST, "{chemin}");
    }

    // Aucun plafond d'échange : 15 sabliers d'un coup, au-delà des 12 de l'ancien plafond.
    let (statut, _, reponse) = appeler(
        &banc.routeur,
        post(
            &jeton,
            "/sablier/achat",
            &commande(&etat, json!({ "nombre": 15 })),
        ),
    )
    .await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["etat"]["sabliers"]["detenus"], 20);

    sqlx::query("UPDATE encre SET gouttes = 9")
        .execute(&base)
        .await
        .unwrap();
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(
            &jeton,
            "/sablier/achat",
            &commande(&reponse["etat"], json!({ "nombre": 1 })),
        ),
    )
    .await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "encre insuffisante");
}

#[sqlx::test(migrations = "../../migrations")]
async fn les_sabliers_detenus_ne_sont_pas_plafonnes(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    preparer(&base, &banc.routeur, &jeton).await;
    // 100 sabliers détenus : ni la détention ni l'usage ne sont plafonnés.
    donner(&base, 100).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = commande(&etat, json!({ "nombre": 5 }));
    let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/sablier", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["etat"]["sabliers"]["detenus"], 95);
}
