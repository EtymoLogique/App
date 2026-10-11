//! Tests de bout en bout du routeur, contre une base PostgreSQL neuve par test
//! (`#[sqlx::test]`, migrations appliquées) et un catalogue fictif sur disque.

mod commun;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use etymo_api::{Limiteurs, Signataire};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use commun::{ORIGINE, appeler, banc, get_etat, post_pli, post_session, secret, session};

#[sqlx::test(migrations = "../../migrations")]
async fn sante_donne_la_version_du_catalogue(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let (statut, entetes, corps) = appeler(
        &banc.routeur,
        Request::get("/sante").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(corps["statut"], "ok");
    assert_eq!(corps["version_catalogue"], "v-essai");
    assert_eq!(entetes[header::CACHE_CONTROL], "no-store");
    assert_eq!(entetes[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
}

#[sqlx::test(migrations = "../../migrations")]
async fn cree_puis_reprend_un_profil_invite(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    let demande = json!({ "installation": installation, "secret": secret(1) });

    let (statut, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    assert_eq!(corps["nouveau"], true);
    let jeton = corps["jeton"].as_str().unwrap().to_owned();

    let (statut, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(corps["nouveau"], false);

    // Le secret n'est jamais stocké, seulement son empreinte.
    let empreinte: Vec<u8> =
        sqlx::query_scalar("SELECT empreinte_secret FROM joueur WHERE id = $1")
            .bind(installation)
            .fetch_one(&base)
            .await
            .unwrap();
    assert_eq!(empreinte.len(), 32);
    assert_ne!(empreinte, [1u8; 32]);

    let (statut, _, corps) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(corps["version_catalogue"], "v-essai");
}

#[sqlx::test(migrations = "../../migrations")]
async fn refuse_un_mauvais_secret(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    appeler(
        &banc.routeur,
        post_session(&json!({ "installation": installation, "secret": secret(1) })),
    )
    .await;

    let (statut, _, corps) = appeler(
        &banc.routeur,
        post_session(&json!({ "installation": installation, "secret": secret(2) })),
    )
    .await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);
    assert_eq!(corps["code"], "non_authentifie");
    assert!(corps.get("jeton").is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn refuse_les_requetes_mal_formees(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    for demande in [
        json!({ "installation": installation, "secret": "court" }),
        json!({ "installation": installation, "secret": secret(1), "nom": "inconnu" }),
        json!({ "installation": "pas-un-uuid", "secret": secret(1) }),
        // UUID v1 : l'identifiant d'installation doit être aléatoire.
        json!({ "installation": "6fa459ea-ee8a-11d1-b8c5-00a0c91e6bf6", "secret": secret(1) }),
    ] {
        let (statut, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
        assert_eq!(statut, StatusCode::BAD_REQUEST, "{demande}");
        assert_eq!(corps["code"], "requete_invalide");
    }

    let trop_gros = Request::post("/session")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(format!(
            r#"{{"secret":"{}"}}"#,
            "a".repeat(20_000)
        )))
        .unwrap();
    let (statut, _, _) = appeler(&banc.routeur, trop_gros).await;
    assert_eq!(statut, StatusCode::PAYLOAD_TOO_LARGE);
}

#[sqlx::test(migrations = "../../migrations")]
async fn etat_exige_un_jeton_valide(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        Request::get("/etat").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);

    let (statut, _, _) = appeler(&banc.routeur, get_etat("abc.def")).await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);

    // Un jeton bien signé pour un profil inexistant ne donne rien non plus.
    let (jeton, _) = Signataire::nouveau(&[3; 32])
        .unwrap()
        .emettre(Uuid::new_v4(), chrono::Utc::now());
    let (statut, _, _) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "../../migrations")]
async fn limite_le_debit_des_sessions(base: PgPool) {
    let banc = banc(base, Limiteurs::nouveau(2, 100)).await;
    let demande = json!({ "installation": Uuid::new_v4(), "secret": secret(1) });
    let mut statuts = Vec::new();
    for _ in 0..3 {
        let requete = Request::post("/session")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-forwarded-for", "203.0.113.7")
            .body(Body::from(demande.to_string()))
            .unwrap();
        statuts.push(appeler(&banc.routeur, requete).await.0);
    }
    assert_eq!(
        statuts,
        [
            StatusCode::OK,
            StatusCode::OK,
            StatusCode::TOO_MANY_REQUESTS
        ]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn cors_limite_a_l_origine_de_la_pwa(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let preflight = |origine: &'static str| {
        Request::options("/session")
            .header(header::ORIGIN, origine)
            .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
            .body(Body::empty())
            .unwrap()
    };
    let (_, entetes, _) = appeler(&banc.routeur, preflight(ORIGINE)).await;
    assert_eq!(entetes[header::ACCESS_CONTROL_ALLOW_ORIGIN], ORIGINE);
    let (_, entetes, _) = appeler(&banc.routeur, preflight("https://intrus.exemple.test")).await;
    assert!(entetes.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn purge_les_commandes_de_plus_de_30_jours(base: PgPool) {
    let joueur = Uuid::new_v4();
    sqlx::query("INSERT INTO joueur (id, empreinte_secret) VALUES ($1, $2)")
        .bind(joueur)
        .bind(vec![0u8; 32])
        .execute(&base)
        .await
        .unwrap();
    for jours in [31, 29] {
        sqlx::query(
            "INSERT INTO commande (joueur_id, id, type, statut, reponse, recue_le)
             VALUES ($1, $2, 'fusion', 'acceptee', '{}', now() - make_interval(days => $3))",
        )
        .bind(joueur)
        .bind(Uuid::new_v4())
        .bind(jours)
        .execute(&base)
        .await
        .unwrap();
    }
    let rapport = etymo_taches::purger(&base).await.unwrap();
    assert_eq!(rapport.commandes, 1);
    assert_eq!(rapport.quetes_du_jour, 0);
    let restantes: i64 = sqlx::query_scalar("SELECT count(*) FROM commande")
        .fetch_one(&base)
        .await
        .unwrap();
    assert_eq!(restantes, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn compte_les_jours_de_jeu_en_jours_gmt(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    let demande = json!({ "installation": installation, "secret": secret(1) });
    let reculer = || async {
        sqlx::query("UPDATE joueur SET derniere_activite = derniere_activite - interval '1 day' WHERE id = $1")
            .bind(installation)
            .execute(&base)
            .await
            .unwrap();
    };
    let jours = || async {
        let (_, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
        let jeton = corps["jeton"].as_str().unwrap().to_owned();
        let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
        (etat["jours_de_jeu"].as_u64().unwrap(), jeton, etat)
    };

    // Premier jour, puis une autre venue le même jour.
    assert_eq!(jours().await.0, 1);
    assert_eq!(jours().await.0, 1);

    // Une venue le lendemain compte un jour de plus, une seule fois.
    reculer().await;
    assert_eq!(jours().await.0, 2);
    let (n, jeton, etat) = jours().await;
    assert_eq!(n, 2);

    // Une commande d'un nouveau jour compte aussi ; son rejeu ne recompte pas.
    reculer().await;
    let pli = json!({
        "commande": Uuid::new_v4(),
        "version_etat": etat["version_etat"],
        "version_catalogue": etat["version_catalogue"],
        "fascicule_id": "fsc_00000000",
    });
    let (statut, _, reponse) = appeler(&banc.routeur, post_pli(&jeton, &pli)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["etat"]["jours_de_jeu"], 3);
    reculer().await;
    let (_, _, rejeu) = appeler(&banc.routeur, post_pli(&jeton, &pli)).await;
    assert_eq!(rejeu["etat"]["jours_de_jeu"], 3);
}

#[sqlx::test(migrations = "../../migrations")]
async fn purge_les_donnees_du_jour_de_plus_de_trente_jours(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    appeler(&banc.routeur, get_etat(&jeton)).await;
    for jours in [1, 29, 31, 90] {
        sqlx::query(
            "INSERT INTO quete_jour (joueur_id, jour, rang, code) SELECT id, current_date - $1::int, 0, 'memoire_sans_faute' FROM joueur",
        )
        .bind(jours)
        .execute(&base)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO ricochet_jour (joueur_id, jour, reponses, bonnes) SELECT id, current_date - $1::int, 5, 5 FROM joueur",
        )
        .bind(jours)
        .execute(&base)
        .await
        .unwrap();
    }
    let rapport = etymo_taches::purger(&base).await.unwrap();
    assert_eq!(rapport.quetes_du_jour, 2);
    assert_eq!(rapport.ricochets_du_jour, 2);
    // Les quêtes du jour tirées aujourd'hui, elles, restent.
    let restantes: i64 =
        sqlx::query_scalar("SELECT count(*) FROM quete_jour WHERE jour >= current_date - 30")
            .fetch_one(&base)
            .await
            .unwrap();
    assert!(restantes >= 2);
}
