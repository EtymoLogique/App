//! Contrat OpenAPI, généré depuis les types Rust (`etymo-api openapi`).

use utoipa::openapi::security::{Http, HttpAuthScheme, SecurityScheme};
use utoipa::{Modify, OpenApi};

use crate::routes;

#[derive(OpenApi)]
#[openapi(
    info(title = "API de jeu d'ÉtymoLogique", description = "Commandes de la PWA. Le serveur fait foi (ADR 0007)."),
    paths(routes::sante, routes::session, routes::etat),
    // Formats de l'artefact du catalogue, lus par la PWA sur le CDN (ADR 0027).
    components(schemas(etymo_catalogue::Calendrier, etymo_catalogue::Manifeste)),
    modifiers(&Session),
    tags((name = "service"), (name = "profil", description = "Profil invité, sans donnée personnelle"))
)]
pub struct Contrat;

struct Session;

impl Modify for Session {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let composants = openapi.components.get_or_insert_with(Default::default);
        composants.add_security_scheme(
            "session",
            SecurityScheme::Http(Http::new(HttpAuthScheme::Bearer)),
        );
    }
}

/// Contrat en JSON stable (clés dans l'ordre de déclaration), terminé par un saut de ligne.
#[must_use]
pub fn json() -> String {
    let mut contrat = Contrat::openapi();
    "1".clone_into(&mut contrat.info.version);
    let mut texte = contrat.to_pretty_json().expect("contrat sérialisable");
    texte.push('\n');
    texte
}
