//! Erreurs de l'API, rendues dans le format du contrat. Les causes internes
//! sont journalisées, jamais renvoyées au client.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use etymo_contrat::{CodeErreur, Erreur};

#[derive(Debug, thiserror::Error)]
pub enum ErreurApi {
    #[error("requête invalide : {0}")]
    RequeteInvalide(String),
    #[error("corps de requête trop volumineux")]
    TropGros,
    #[error("authentification requise")]
    NonAuthentifie,
    #[error("trop de requêtes")]
    TropDeRequetes,
    #[error("base indisponible")]
    Base(#[from] sqlx::Error),
}

impl IntoResponse for ErreurApi {
    fn into_response(self) -> Response {
        let (statut, code, message) = match &self {
            Self::RequeteInvalide(m) => (
                StatusCode::BAD_REQUEST,
                CodeErreur::RequeteInvalide,
                m.clone(),
            ),
            Self::TropGros => (
                StatusCode::PAYLOAD_TOO_LARGE,
                CodeErreur::RequeteInvalide,
                self.to_string(),
            ),
            Self::NonAuthentifie => (
                StatusCode::UNAUTHORIZED,
                CodeErreur::NonAuthentifie,
                self.to_string(),
            ),
            Self::TropDeRequetes => (
                StatusCode::TOO_MANY_REQUESTS,
                CodeErreur::TropDeRequetes,
                self.to_string(),
            ),
            Self::Base(e) => {
                tracing::error!(erreur = %e, "erreur de base");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    CodeErreur::Indisponible,
                    self.to_string(),
                )
            }
        };
        (statut, Json(Erreur { code, message })).into_response()
    }
}
