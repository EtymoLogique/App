//! Export des données d'un joueur (RGPD art. 15 et 20) : retrouvé par
//! l'empreinte de son adresse, sans aucun identifiant de connexion.

mod commun;

use axum::http::StatusCode;
use etymo_api::export::exporter;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use commun::{appeler, banc_courriel, post_session, secret};

#[sqlx::test(migrations = "../../migrations")]
async fn export_complet_retrouve_par_l_adresse(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let courriel = banc.app.courriel.as_ref().unwrap();
    let installation = Uuid::new_v4();
    let demande = json!({ "installation": installation, "secret": secret(1) });
    let (statut, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");

    let empreinte = courriel.empreinte_adresse("camille@exemple.fr");
    sqlx::query!(
        "INSERT INTO compte (joueur_id, empreinte_courriel, pseudo) VALUES ($1, $2, 'camille')",
        installation,
        &empreinte[..]
    )
    .execute(&base)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO reglage (joueur_id, cle, valeur) VALUES ($1, 'theme', 'nocturne')",
        installation
    )
    .execute(&base)
    .await
    .unwrap();

    // Casse et espaces : la même adresse normalisée.
    let donnees = exporter(&base, courriel, "  Camille@Exemple.FR ")
        .await
        .unwrap();
    assert_eq!(donnees["joueur"]["id"], installation.to_string());
    assert_eq!(donnees["compte"]["pseudo"], "camille");
    assert_eq!(donnees["reglages"][0]["valeur"], "nocturne");
    assert_eq!(donnees["appareils"].as_array().unwrap().len(), 1);
    let texte = donnees.to_string();
    assert!(
        !texte.contains("empreinte_secret"),
        "l'identifiant de connexion ne sort pas"
    );

    let inconnue = exporter(&base, courriel, "autre@exemple.fr").await;
    assert!(inconnue.is_err());
}
