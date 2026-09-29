//! Réserve de départ et commande de fusion, de bout en bout (ADR 0012, ADR 0030).

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{BIO, GEO, LOGIE, MOT, RECETTE};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use commun::{appeler, banc, get_etat, post_fusion, session};

fn reserve(etat: &Value) -> Vec<(String, u64)> {
    etat["reserve"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| {
            (
                e["brique_id"].as_str().unwrap().to_owned(),
                e["exemplaires"].as_u64().unwrap(),
            )
        })
        .collect()
}

fn fusion(etat: &Value, briques: &[&str]) -> Value {
    json!({
        "commande": Uuid::new_v4(),
        "version_etat": etat["version_etat"],
        "version_catalogue": etat["version_catalogue"],
        "briques": briques,
    })
}

#[sqlx::test(migrations = "../../migrations")]
async fn les_graines_sont_accordees_une_seule_fois(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;

    let (statut, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(statut, StatusCode::OK, "{etat}");
    assert_eq!(
        reserve(&etat),
        vec![(GEO.to_owned(), 2), (LOGIE.to_owned(), 1)]
    );
    assert_eq!(etat["version_etat"], 1);

    let (_, _, encore) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(encore, etat, "un fascicule ne sème qu'une fois");

    let departs: i64 = sqlx::query_scalar("SELECT count(*) FROM mouvement WHERE motif = 'depart'")
        .fetch_one(&base)
        .await
        .unwrap();
    assert_eq!(departs, 2);
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_decouverte_consomme_une_fois_et_se_rejoue(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let demande = fusion(&etat, &[GEO, LOGIE]);
    let (statut, _, reponse) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(
        reponse["issue"],
        json!({ "type": "decouverte", "recette_id": RECETTE, "mot_id": MOT, "gouttes": 3 })
    );
    // géo- et -logie sont communes : le mot l'est aussi et rapporte 3 gouttes (ADR 0040).
    assert_eq!(reponse["etat"]["encre"], 3);
    // bio- : un du pli du jalon atteint par cette première découverte, un du mot lui-même
    // (le banc déclare le mot posable comme brique bio-).
    assert_eq!(
        reserve(&reponse["etat"]),
        vec![
            (BIO.to_owned(), 2),
            (GEO.to_owned(), 1),
            (LOGIE.to_owned(), 0)
        ]
    );
    assert_eq!(reponse["etat"]["decouvertes"][0]["numero"], 1);
    assert_eq!(reponse["etat"]["version_etat"], 2);

    // Rejouée, la commande renvoie la même réponse sans rien consommer.
    let (statut, _, rejouee) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(rejouee, reponse);
    let (_, _, apres) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(
        reserve(&apres),
        vec![
            (BIO.to_owned(), 2),
            (GEO.to_owned(), 1),
            (LOGIE.to_owned(), 0)
        ]
    );

    // Une nouvelle commande pour le même mot : connue, rien n'est consommé.
    let (_, _, connue) = appeler(
        &banc.routeur,
        post_fusion(&jeton, &fusion(&apres, &[GEO, LOGIE])),
    )
    .await;
    assert_eq!(connue["issue"]["type"], "connue");
    assert_eq!(connue["etat"], apres);

    let consommes: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM mouvement WHERE motif = 'decouverte' AND ressource = 'exemplaire'",
    )
    .fetch_one(&base)
    .await
    .unwrap();
    assert_eq!(consommes, 3, "deux consommés, un exemplaire du mot offert");
    let commandes: i64 = sqlx::query_scalar("SELECT count(*) FROM commande")
        .fetch_one(&base)
        .await
        .unwrap();
    assert_eq!(commandes, 1, "seule la découverte est enregistrée");
}

#[sqlx::test(migrations = "../../migrations")]
async fn les_essais_rates_ne_coutent_rien(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    for (briques, issue) in [
        (
            vec![LOGIE, GEO],
            json!({ "type": "presque", "motif": "ordre" }),
        ),
        (
            vec![BIO, GEO],
            json!({ "type": "exclue", "raison": "rare" }),
        ),
        (vec![GEO, GEO], json!({ "type": "echec" })),
    ] {
        let (statut, _, reponse) =
            appeler(&banc.routeur, post_fusion(&jeton, &fusion(&etat, &briques))).await;
        assert_eq!(statut, StatusCode::OK, "{reponse}");
        assert_eq!(reponse["issue"], issue, "{briques:?}");
        assert_eq!(reponse["etat"], etat, "rien ne change");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_decouverte_exige_un_etat_et_un_catalogue_a_jour(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let mut perimee = fusion(&etat, &[GEO, LOGIE]);
    perimee["version_etat"] = json!(0);
    let (statut, _, corps) = appeler(&banc.routeur, post_fusion(&jeton, &perimee)).await;
    assert_eq!(statut, StatusCode::CONFLICT);
    assert_eq!(corps["code"], "conflit");

    let mut autre_catalogue = fusion(&etat, &[GEO, LOGIE]);
    autre_catalogue["version_catalogue"] = json!("v-ancienne");
    let (statut, _, _) = appeler(&banc.routeur, post_fusion(&jeton, &autre_catalogue)).await;
    assert_eq!(statut, StatusCode::CONFLICT);
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_reserve_doit_contenir_chaque_brique(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    appeler(&banc.routeur, get_etat(&jeton)).await;
    sqlx::query("UPDATE exemplaire SET nombre = 0 WHERE brique_id = $1")
        .bind(LOGIE)
        .execute(&base)
        .await
        .unwrap();
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let (statut, _, reponse) = appeler(
        &banc.routeur,
        post_fusion(&jeton, &fusion(&etat, &[GEO, LOGIE])),
    )
    .await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(
        reponse["issue"],
        json!({ "type": "reserve_insuffisante", "briques": [LOGIE] })
    );
    assert_eq!(reponse["etat"], etat);
}

#[sqlx::test(migrations = "../../migrations")]
async fn refuse_les_propositions_mal_formees(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let mut inconnue = fusion(&etat, &[GEO, LOGIE]);
    inconnue["indice"] = json!(true);
    for demande in [
        fusion(&etat, &[GEO]),
        fusion(&etat, &[GEO, GEO, GEO, GEO]),
        fusion(&etat, &[GEO, "brq_INVALIDE"]),
        fusion(&etat, &[GEO, "../../etc"]),
        inconnue,
    ] {
        let (statut, _, corps) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
        assert_eq!(statut, StatusCode::BAD_REQUEST, "{demande} → {corps}");
    }

    let (statut, _, _) = appeler(
        &banc.routeur,
        post_fusion("faux", &fusion(&etat, &[GEO, LOGIE])),
    )
    .await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_parution_resynchronise_sans_rien_perdre(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let demande = fusion(&etat, &[GEO, LOGIE]);
    let (_, _, jouee) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    let apres = jouee["etat"].clone();

    // Un 2ᵉ fascicule paraît : le catalogue change.
    let racine = banc.dossier.path();
    let m0 = etymo_catalogue::essai::fascicule(racine, 0, "2026-10-01T08:00:00+02:00");
    let m1 = etymo_catalogue::essai::fascicule(racine, 1, "2026-10-15T08:00:00+02:00");
    etymo_catalogue::essai::calendrier(
        racine,
        etymo_catalogue::INDEX,
        "v-essai-2",
        &[
            (0, "2026-10-01T08:00:00+02:00", &m0),
            (1, "2026-10-15T08:00:00+02:00", &m1),
        ],
    );
    assert!(banc.app.catalogue.rafraichir().await.unwrap());

    // La commande rejouée passe avant les contrôles de version : même réponse.
    let (statut, _, rejouee) = appeler(&banc.routeur, post_fusion(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(rejouee, jouee);

    // Une commande neuve avec l'ancienne version de catalogue : 409.
    let neuve = commun::commande(&apres, json!({ "fascicule_id": "fsc_00000000" }));
    let (statut, _, _) = appeler(&banc.routeur, commun::post_pli(&jeton, &neuve)).await;
    assert_eq!(statut, StatusCode::CONFLICT);

    // La resynchronisation accorde les graines du 2ᵉ fascicule, une seule fois.
    let (_, _, sync) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(sync["version_catalogue"], "v-essai-2");
    assert_eq!(
        reserve(&sync),
        vec![
            (BIO.to_owned(), 2),
            (GEO.to_owned(), 3),
            (LOGIE.to_owned(), 1)
        ]
    );
    assert_eq!(sync["encre"], apres["encre"]);
    assert_eq!(sync["decouvertes"], apres["decouvertes"]);
    let (_, _, encore) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(encore["reserve"], sync["reserve"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_brique_de_mot_perdue_est_rendue_a_la_synchronisation(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    appeler(
        &banc.routeur,
        post_fusion(&jeton, &fusion(&etat, &[GEO, LOGIE])),
    )
    .await;
    // Mot découvert, brique du mot épuisée (état d'avant le correctif).
    sqlx::query("UPDATE exemplaire SET nombre = 0 WHERE brique_id = $1")
        .bind(BIO)
        .execute(&base)
        .await
        .unwrap();

    let (_, _, sync) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert!(reserve(&sync).contains(&(BIO.to_owned(), 1)));
}
