//! Énergie et plis, de bout en bout (ADR 0011, 0012, 0019, 0020).

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{BIO, GEO, LOGIE};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use commun::{appeler, banc, get_etat, post_pli, session};

const FASCICULE: &str = "fsc_00000000";

fn pli(etat: &Value) -> Value {
    json!({
        "commande": Uuid::new_v4(),
        "version_etat": etat["version_etat"],
        "version_catalogue": etat["version_catalogue"],
        "fascicule_id": FASCICULE,
    })
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_nouveau_joueur_a_deux_plis_prets(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(
        etat["energie"],
        json!({ "charges": 2, "capacite": 2, "prochaine_charge": null, "recharge_s": 43_200 })
    );
    assert_eq!(etat["encre"], 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_pli_consomme_une_charge_et_se_rejoue(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let demande = pli(&etat);
    let (statut, _, reponse) = appeler(&banc.routeur, post_pli(&jeton, &demande)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    let brique = reponse["ouverture"]["brique_id"].as_str().unwrap();
    assert!([GEO, LOGIE, BIO].contains(&brique));
    let nouvelle = brique == BIO;
    assert_eq!(
        reponse["ouverture"]["resultat"],
        if nouvelle { "nouvelle" } else { "doublon" }
    );
    // Au moins la base de 2 gouttes ; un doublon commun en rapporte une de plus.
    assert_eq!(reponse["ouverture"]["encre"], if nouvelle { 2 } else { 3 });
    let etat = &reponse["etat"];
    assert_eq!(etat["energie"]["charges"], 1);
    assert!(etat["energie"]["prochaine_charge"].is_string());
    assert_eq!(etat["encre"], reponse["ouverture"]["encre"]);
    assert_eq!(etat["historique_plis"].as_array().unwrap().len(), 1);

    // Rejouée, la commande renvoie la même réponse sans rien consommer.
    let (_, _, rejouee) = appeler(&banc.routeur, post_pli(&jeton, &demande)).await;
    assert_eq!(rejouee, reponse);
    let charges: i64 =
        sqlx::query_scalar("SELECT count(*) FROM mouvement WHERE ressource = 'charge'")
            .fetch_one(&base)
            .await
            .unwrap();
    assert_eq!(charges, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn sans_charge_le_pli_est_refuse(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, mut etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    for _ in 0..2 {
        let (statut, _, reponse) = appeler(&banc.routeur, post_pli(&jeton, &pli(&etat))).await;
        assert_eq!(statut, StatusCode::OK, "{reponse}");
        etat = reponse["etat"].clone();
    }
    assert_eq!(etat["energie"]["charges"], 0);
    let (statut, _, erreur) = appeler(&banc.routeur, post_pli(&jeton, &pli(&etat))).await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "{erreur}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_garantie_donne_une_brique_nouvelle_au_sixieme_pli(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    // Cinq plis sans nouveauté déjà ouverts : le prochain doit donner bio-, seule brique inconnue.
    sqlx::query(
        "INSERT INTO compteur_pli (joueur_id, fascicule_id, plis_sans_nouveaute, plis_sans_utilite)
         SELECT id, $1, 5, 0 FROM joueur",
    )
    .bind(FASCICULE)
    .execute(&base)
    .await
    .unwrap();
    let (statut, _, reponse) = appeler(&banc.routeur, post_pli(&jeton, &pli(&etat))).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    assert_eq!(reponse["ouverture"]["brique_id"], BIO);
    assert_eq!(reponse["ouverture"]["regle"], "garantie");
    assert_eq!(
        reponse["etat"]["compteurs_plis"][0]["plis_sans_nouveaute"],
        0
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_pli_exige_un_etat_a_jour_et_un_fascicule_paru(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    let mut perime = pli(&etat);
    perime["version_etat"] = json!(0);
    let (statut, _, _) = appeler(&banc.routeur, post_pli(&jeton, &perime)).await;
    assert_eq!(statut, StatusCode::CONFLICT);
    let mut inconnu = pli(&etat);
    inconnu["fascicule_id"] = json!("fsc_0000000z");
    let (statut, _, _) = appeler(&banc.routeur, post_pli(&jeton, &inconnu)).await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);
}
