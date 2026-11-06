//! Déblocage progressif des fascicules, de bout en bout (ADR 0068).

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::INDEX;
use etymo_catalogue::essai::{self, BIO, GEO, LOGIE};
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{Banc, appeler, banc, commande, get_etat, post, post_fusion, post_pli, session};

const PREMIER: &str = "fsc_00000000";
const SUIVANT: &str = "fsc_00000001";
const PARUTION_0: &str = "2026-10-01T08:00:00+02:00";
const PARUTION_1: &str = "2026-10-15T08:00:00+02:00";

/// Publie le premier fascicule, à deux jalons, et éventuellement le suivant.
async fn publier(banc: &Banc, avec_suivant: bool) {
    let racine = banc.dossier.path();
    let m0 = essai::fascicule_avec_jalons(
        racine,
        0,
        PARUTION_0,
        &json!([
            { "id": "jal_0000000a", "decouvertes": 1, "pli": [BIO], "sabliers": 3 },
            { "id": "jal_0000000b", "decouvertes": 1, "sabliers": 1 }
        ]),
    );
    let m1 = essai::fascicule_avec_jalons(
        racine,
        1,
        PARUTION_1,
        &json!([{ "id": "jal_0000000c", "decouvertes": 1, "sabliers": 1 }]),
    );
    let mut parus = vec![(0, PARUTION_0, m0.as_str())];
    if avec_suivant {
        parus.push((1, PARUTION_1, m1.as_str()));
    }
    let version = if avec_suivant { "v-deux" } else { "v-un" };
    essai::calendrier(racine, INDEX, version, &parus);
    assert!(banc.app.catalogue.rafraichir().await.unwrap());
}

fn debloques(etat: &Value) -> Vec<&str> {
    etat["fascicules_debloques"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["fascicule_id"].as_str().unwrap())
        .collect()
}

fn exemplaires(etat: &Value, brique: &str) -> u64 {
    etat["reserve"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["brique_id"] == brique)
        .map_or(0, |e| e["exemplaires"].as_u64().unwrap())
}

fn decouvrir(etat: &Value) -> Value {
    commande(etat, json!({ "briques": [GEO, LOGIE] }))
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_nouveau_profil_n_a_que_le_premier_fascicule(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    publier(&banc, true).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(debloques(&etat), vec![PREMIER]);

    // Le pli d'un fascicule verrouillé ne s'ouvre pas, même avec une charge.
    let demande = commande(&etat, json!({ "fascicule_id": SUIVANT }));
    let (statut, _, corps) = appeler(&banc.routeur, post_pli(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "{corps}");
    let demande = commande(&etat, json!({ "fascicule_id": PREMIER }));
    let (statut, _, corps) = appeler(&banc.routeur, post_pli(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn le_deuxieme_jalon_debloque_le_suivant_et_ses_graines(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    publier(&banc, true).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let geo_avant = exemplaires(&etat, GEO);

    let (statut, _, jouee) = appeler(&banc.routeur, post_fusion(&jeton, &decouvrir(&etat))).await;
    assert_eq!(statut, StatusCode::OK, "{jouee}");
    assert_eq!(jouee["fascicules_debloques"], json!([SUIVANT]));
    let apres = &jouee["etat"];
    assert_eq!(debloques(apres), vec![PREMIER, SUIVANT]);
    // Le mot, déjà trouvé, compte aussitôt pour le fascicule débloqué.
    let atteints = apres["jalons_atteints"].as_array().unwrap();
    assert!(atteints.contains(&json!("jal_0000000c")), "{atteints:?}");
    // Les graines du suivant arrivent dans la même transaction : GEO −1 +2.
    assert_eq!(exemplaires(apres, GEO), geo_avant + 1);

    let demande = commande(apres, json!({ "fascicule_id": SUIVANT }));
    let (statut, _, corps) = appeler(&banc.routeur, post_pli(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_droit_acquis_debloque_le_suivant_a_sa_parution(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    publier(&banc, false).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let (_, _, jouee) = appeler(&banc.routeur, post_fusion(&jeton, &decouvrir(&etat))).await;
    assert_eq!(jouee["fascicules_debloques"], json!([]));

    publier(&banc, true).await;
    let (_, _, sync) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(debloques(&sync), vec![PREMIER, SUIVANT]);
    let (_, _, encore) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(encore["version_etat"], sync["version_etat"]);
    assert_eq!(encore["reserve"], sync["reserve"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_seul_jalon_ne_debloque_rien(base: PgPool) {
    // Le fascicule d'essai par défaut n'a qu'un jalon.
    let banc = banc(base, Limiteurs::default()).await;
    let racine = banc.dossier.path();
    let m0 = essai::fascicule(racine, 0, PARUTION_0);
    let m1 = essai::fascicule_avec_jalons(racine, 1, PARUTION_1, &json!([]));
    essai::calendrier(
        racine,
        INDEX,
        "v-deux",
        &[(0, PARUTION_0, &m0), (1, PARUTION_1, &m1)],
    );
    assert!(banc.app.catalogue.rafraichir().await.unwrap());
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let (_, _, jouee) = appeler(&banc.routeur, post_fusion(&jeton, &decouvrir(&etat))).await;
    assert_eq!(debloques(&jouee["etat"]), vec![PREMIER]);
    let demande = commande(&jouee["etat"], json!({ "jalon_id": "jal_0000000a" }));
    let (statut, _, corps) = appeler(&banc.routeur, post(&jeton, "/jalon", &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    assert_eq!(debloques(&corps["etat"]), vec![PREMIER]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn les_collections_d_un_fascicule_verrouille_ne_se_montrent_pas(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    publier(&banc, true).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(debloques(&etat), vec![PREMIER]);
    // Aucun total d'un fascicule verrouillé (ADR 0069, App#90).
    let fascicules: Vec<&str> = etat["progression_collections"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["fascicule_id"].as_str().unwrap())
        .collect();
    assert!(!fascicules.is_empty());
    assert!(fascicules.iter().all(|f| *f == PREMIER), "{fascicules:?}");
}
