//! Carte de lecteur, de bout en bout (ADR 0045) : un tampon par jour, la
//! septième récompense, sa récupération idempotente et sa nouvelle carte.

mod commun;

use axum::http::StatusCode;
use chrono::{Days, NaiveDate, Utc};
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{BIO, GEO, LOGIE, SENS_GEO};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use commun::{appeler, banc, commande, get_etat, post, post_fusion, session};

const FASCICULE: &str = "fsc_00000000";

/// Fait les deux quêtes du jour du banc : la table (la découverte) et la mémoire (cinq ricochets).
async fn faire_les_quetes(banc: &commun::Banc, jeton: &str) -> Value {
    let (_, _, etat) = appeler(&banc.routeur, get_etat(jeton)).await;
    let fusion = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (_, _, decouverte) = appeler(&banc.routeur, post_fusion(jeton, &fusion)).await;
    let mut etat = decouverte["etat"].clone();
    for _ in 0..5 {
        let demande = commande(
            &etat,
            json!({ "format": "sens_brique", "unite_id": GEO, "reponse": SENS_GEO }),
        );
        let (statut, _, reponse) = appeler(&banc.routeur, post(jeton, "/ricochet", &demande)).await;
        assert_eq!(statut, StatusCode::OK, "{reponse}");
        etat = reponse["etat"].clone();
    }
    etat
}

async fn joueur_id(base: &PgPool) -> Uuid {
    sqlx::query_scalar("SELECT id FROM joueur")
        .fetch_one(base)
        .await
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn le_tampon_vient_avec_la_derniere_quete_et_un_seul_par_jour(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(etat["carte_de_lecteur"]["tampons"], json!([]));
    assert_eq!(etat["carte_de_lecteur"]["taille"], 7);
    assert_eq!(etat["carte_de_lecteur"]["recompense"]["plis_de_lecteur"], 1);

    let etat = faire_les_quetes(&banc, &jeton).await;
    let aujourd_hui = Utc::now().date_naive().to_string();
    assert_eq!(etat["carte_de_lecteur"]["tampons"], json!([aujourd_hui]));
    // Revenir plus tard le même jour n'ajoute rien.
    let (_, _, encore) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(encore["carte_de_lecteur"]["tampons"], json!([aujourd_hui]));
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_septieme_carte_se_recupere_une_fois_et_une_nouvelle_commence(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    appeler(&banc.routeur, get_etat(&jeton)).await;
    let joueur = joueur_id(&base).await;
    // Six tampons anciens, non consécutifs : aucune série n'est exigée.
    for i in 0..6u64 {
        let jour = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap() + Days::new(i * 3);
        sqlx::query("INSERT INTO tampon (joueur_id, jour) VALUES ($1, $2)")
            .bind(joueur)
            .bind(jour)
            .execute(&base)
            .await
            .unwrap();
    }
    let etat = faire_les_quetes(&banc, &jeton).await;
    let carte = &etat["carte_de_lecteur"];
    assert_eq!(carte["tampons"].as_array().unwrap().len(), 7, "{carte}");
    assert_eq!(carte["a_recuperer"], 1);

    let encre = etat["encre"].as_i64().unwrap();
    let sabliers = etat["sabliers"]["detenus"].as_i64().unwrap();
    let demande = commande(&etat, json!({ "fascicule_id": FASCICULE }));
    let (statut, _, reponse) =
        appeler(&banc.routeur, post(&jeton, "/carte-de-lecteur", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    // Seule la rare BIO est tirable : peu communes et rares, jamais les communes.
    assert_eq!(reponse["ouverture"]["brique_id"], BIO);
    let apres = &reponse["etat"];
    assert_eq!(apres["encre"].as_i64().unwrap(), encre + 20);
    assert_eq!(apres["sabliers"]["detenus"].as_i64().unwrap(), sabliers + 1);
    assert_eq!(apres["carte_de_lecteur"]["a_recuperer"], 0);
    assert_eq!(apres["carte_de_lecteur"]["tampons"], json!([]));
    assert_eq!(apres["carte_de_lecteur"]["remplies"], 1);

    // Rejouée : même réponse, rien n'est accordé deux fois.
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/carte-de-lecteur", &demande)).await;
    assert_eq!(rejouee, reponse);
    // Une autre commande : plus de carte pleine.
    let autre = commande(apres, json!({ "fascicule_id": FASCICULE }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/carte-de-lecteur", &autre)).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "../../migrations")]
async fn pas_de_carte_pleine_pas_de_recompense(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = commande(&etat, json!({ "fascicule_id": FASCICULE }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/carte-de-lecteur", &demande)).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "../../migrations")]
async fn chaque_quete_faite_rapporte_sa_recompense_une_seule_fois(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let etat = faire_les_quetes(&banc, &jeton).await;
    let jour = Utc::now().date_naive().to_string();
    let quetes = etat["quetes_du_jour"].as_array().unwrap();
    assert!(
        quetes
            .iter()
            .all(|q| q["faite"] == true && q["recuperee"] == false)
    );
    let rang_de =
        |sorte: &str| quetes.iter().find(|q| q["sorte"] == sorte).unwrap()["rang"].clone();

    // Table : 5 gouttes d'encre.
    let encre = etat["encre"].as_i64().unwrap();
    let demande = commande(&etat, json!({ "jour": jour, "rang": rang_de("table") }));
    let (statut, _, reponse) =
        appeler(&banc.routeur, post(&jeton, "/quete-du-jour", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["etat"]["encre"].as_i64().unwrap(), encre + 5);
    // Rejouée : même réponse ; une autre commande sur la même quête : conflit.
    let (_, _, rejouee) = appeler(&banc.routeur, post(&jeton, "/quete-du-jour", &demande)).await;
    assert_eq!(rejouee, reponse);
    let autre = commande(
        &reponse["etat"],
        json!({ "jour": jour, "rang": rang_de("table") }),
    );
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/quete-du-jour", &autre)).await;
    assert_eq!(statut, StatusCode::CONFLICT);

    // Mémoire : 1 sablier.
    let sabliers = reponse["etat"]["sabliers"]["detenus"].as_i64().unwrap();
    let demande = commande(
        &reponse["etat"],
        json!({ "jour": jour, "rang": rang_de("memoire") }),
    );
    let (statut, _, reponse) =
        appeler(&banc.routeur, post(&jeton, "/quete-du-jour", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(
        reponse["etat"]["sabliers"]["detenus"].as_i64().unwrap(),
        sabliers + 1
    );

    // Une quête qui n'existe pas n'est pas faite.
    let demande = commande(&reponse["etat"], json!({ "jour": jour, "rang": 2 }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/quete-du-jour", &demande)).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);
}
