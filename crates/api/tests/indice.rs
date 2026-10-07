//! Indices, de bout en bout (ADR 0038).

mod commun;

use axum::http::StatusCode;
use etymo_api::Limiteurs;
use etymo_catalogue::essai::{GEO, LOGIE, RECETTE};
use serde_json::{Value, json};
use sqlx::PgPool;

use commun::{appeler, banc, commande, get_etat, post, post_fusion, session, somme_mouvements};

async fn donner_encre(base: &PgPool, gouttes: i32) {
    sqlx::query(
        "INSERT INTO encre (joueur_id, gouttes) SELECT id, $1 FROM joueur
         ON CONFLICT (joueur_id) DO UPDATE SET gouttes = encre.gouttes + EXCLUDED.gouttes",
    )
    .bind(gouttes)
    .execute(base)
    .await
    .unwrap();
    sqlx::query("INSERT INTO mouvement (joueur_id, ressource, delta, motif) SELECT id, 'encre', $1, 'pli' FROM joueur")
        .bind(gouttes)
        .execute(base)
        .await
        .unwrap();
}

fn indice(etat: &Value, niveau: u8) -> Value {
    commande(etat, json!({ "recette_id": RECETTE, "niveau": niveau }))
}

#[sqlx::test(migrations = "../../migrations")]
async fn les_indices_s_achetent_dans_n_importe_quel_ordre_une_fois_chacun(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, mut etat) = appeler(&banc.routeur, get_etat(&jeton)).await;
    donner_encre(&base, 50).await;
    assert_eq!(etat["prix_indices"], json!([4, 8, 12]));

    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/indice", &indice(&etat, 4))).await;
    assert_eq!(statut, StatusCode::BAD_REQUEST, "indice hors barème");

    let premier = indice(&etat, 3);
    for (niveau, prix) in [(3, 12), (1, 4), (2, 8)] {
        let demande = if niveau == 3 {
            premier.clone()
        } else {
            indice(&etat, niveau)
        };
        let (statut, _, reponse) = appeler(&banc.routeur, post(&jeton, "/indice", &demande)).await;
        assert_eq!(statut, StatusCode::OK, "{reponse}");
        assert_eq!(reponse["prix"], prix);
        etat = reponse["etat"].clone();
    }
    assert_eq!(etat["encre"], 50 - 24);
    assert_eq!(etat["indices"].as_array().unwrap().len(), 3);
    assert_eq!(somme_mouvements(&base, "encre").await, 50 - 24);

    // Rejouée, la commande ne paie pas deux fois.
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/indice", &premier)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(somme_mouvements(&base, "encre").await, 50 - 24);

    // Une nouvelle commande pour un indice déjà obtenu est refusée, sans débit.
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/indice", &indice(&etat, 1))).await;
    assert_eq!(statut, StatusCode::CONFLICT, "indice déjà obtenu");
    assert_eq!(somme_mouvements(&base, "encre").await, 50 - 24);
}

#[sqlx::test(migrations = "../../migrations")]
async fn refus_encre_recette_inconnue_ou_decouverte(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let jeton = session(&banc.routeur).await;
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/indice", &indice(&etat, 1))).await;
    assert_eq!(statut, StatusCode::FORBIDDEN, "encre insuffisante");

    let inconnue = commande(&etat, json!({ "recette_id": "rct_0000000z", "niveau": 1 }));
    let (statut, _, _) = appeler(&banc.routeur, post(&jeton, "/indice", &inconnue)).await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);

    let fusion = commande(&etat, json!({ "briques": [GEO, LOGIE] }));
    let (statut, _, reponse) = appeler(&banc.routeur, post_fusion(&jeton, &fusion)).await;
    assert_eq!(statut, StatusCode::OK, "{reponse}");
    donner_encre(&base, 50).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(&jeton, "/indice", &indice(&reponse["etat"], 1)),
    )
    .await;
    assert_eq!(statut, StatusCode::CONFLICT, "recette découverte");
}
