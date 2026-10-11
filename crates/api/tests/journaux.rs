//! Les journaux ne portent aucune donnée personnelle (ADR 0010, AGENTS.md) :
//! ni secret, ni jeton, ni identifiant de joueur, ni adresse réseau, ni corps
//! de requête. On capture tout ce que l'API écrit pendant des requêtes qui
//! portent ces valeurs, y compris en erreur, et on vérifie qu'aucune n'y figure.

mod commun;

use std::io::Write;
use std::sync::{Arc, Mutex};

use axum::http::{Request, header};
use axum::response::IntoResponse;
use etymo_api::Limiteurs;
use etymo_api::erreur::ErreurApi;
use serde_json::json;
use sqlx::PgPool;
use tracing_subscriber::fmt::MakeWriter;
use uuid::Uuid;

use commun::{appeler, banc, commande, get_etat, post, post_session, secret};

#[derive(Clone, Default)]
struct Capture(Arc<Mutex<Vec<u8>>>);

impl Write for Capture {
    fn write(&mut self, octets: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(octets);
        Ok(octets.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl MakeWriter<'_> for Capture {
    type Writer = Self;
    fn make_writer(&self) -> Self {
        self.clone()
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn aucune_donnee_personnelle_dans_les_journaux(base: PgPool) {
    let journal = Capture::default();
    let _garde = tracing::subscriber::set_default(
        tracing_subscriber::fmt()
            .with_writer(journal.clone())
            .with_max_level(tracing::Level::TRACE)
            .finish(),
    );
    let banc = banc(base, Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    let secret_joueur = secret(7);
    let adresse = "203.0.113.77";

    let ouverture = Request::post("/session")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", adresse)
        .body(axum::body::Body::from(
            json!({ "installation": installation, "secret": secret_joueur }).to_string(),
        ))
        .unwrap();
    let (_, _, corps) = appeler(&banc.routeur, ouverture).await;
    let jeton = corps["jeton"].as_str().unwrap().to_owned();
    let (_, _, etat) = appeler(&banc.routeur, get_etat(&jeton)).await;

    // Des requêtes en erreur qui répètent ces valeurs dans leur corps et leurs en-têtes.
    let piege =
        json!({ "installation": installation, "secret": secret_joueur, "inconnu": adresse });
    appeler(&banc.routeur, post_session(&piege)).await;
    appeler(&banc.routeur, post(&jeton, "/fusion", &piege)).await;
    let mauvaise = commande(&etat, json!({ "briques": [secret_joueur, installation] }));
    appeler(&banc.routeur, post(&jeton, "/fusion", &mauvaise)).await;
    appeler(&banc.routeur, get_etat(&format!("{jeton}x"))).await;
    // Les deux erreurs qui écrivent dans le journal.
    drop(ErreurApi::Interne("cause interne".into()).into_response());
    drop(ErreurApi::Base(sqlx::Error::PoolClosed).into_response());

    let ecrit = String::from_utf8_lossy(&journal.0.lock().unwrap()).into_owned();
    assert!(
        ecrit.contains("erreur interne"),
        "le journal capture bien : {ecrit}"
    );
    for (nom, valeur) in [
        ("secret", secret_joueur.as_str()),
        ("jeton", jeton.as_str()),
        ("identifiant", &installation.to_string()),
        ("adresse réseau", adresse),
    ] {
        assert!(!ecrit.contains(valeur), "{nom} dans le journal : {ecrit}");
    }
}
