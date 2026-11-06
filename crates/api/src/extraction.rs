//! Extracteurs : corps JSON strict, adresse réseau (pour la limitation de
//! débit seulement) et joueur authentifié.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::{ConnectInfo, FromRequest, FromRequestParts, Request};
use axum::http::request::Parts;
use axum::http::{StatusCode, header};
use chrono::Utc;
use serde::de::DeserializeOwned;
use uuid::Uuid;

use crate::EtatApp;
use crate::debit;
use crate::erreur::ErreurApi;

/// Corps JSON dont les erreurs suivent le format du contrat.
pub struct JsonStrict<T>(pub T);

impl<T: DeserializeOwned, S: Send + Sync> FromRequest<S> for JsonStrict<T> {
    type Rejection = ErreurApi;

    async fn from_request(requete: Request, etat: &S) -> Result<Self, Self::Rejection> {
        match axum::Json::<T>::from_request(requete, etat).await {
            Ok(axum::Json(valeur)) => Ok(Self(valeur)),
            Err(e) if e.status() == StatusCode::PAYLOAD_TOO_LARGE => Err(ErreurApi::TropGros),
            Err(e) => Err(ErreurApi::RequeteInvalide(e.body_text())),
        }
    }
}

/// Adresse du client, gardée en mémoire le temps de la limitation de débit.
/// Derrière le proxy de Scaleway, c'est la dernière entrée de
/// `X-Forwarded-For`, ajoutée par le proxy lui-même.
pub struct Adresse(pub String);

impl<S: Send + Sync> FromRequestParts<S> for Adresse {
    type Rejection = ErreurApi;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let transmise = parts
            .headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit(',').next())
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let directe = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.ip().to_string());
        Ok(Self(transmise.or(directe).unwrap_or_default()))
    }
}

/// Joueur authentifié par un jeton de session valide.
pub struct Joueur(pub Uuid);

impl FromRequestParts<Arc<EtatApp>> for Joueur {
    type Rejection = ErreurApi;

    async fn from_request_parts(
        parts: &mut Parts,
        etat: &Arc<EtatApp>,
    ) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, etat).await?;
        Ok(Self(session.joueur))
    }
}

/// Joueur et appareil de la session (ADR 0070) : les routes du compte
/// agissent sur l'appareil qui appelle.
pub struct Session {
    pub joueur: Uuid,
    pub appareil: Uuid,
}

impl FromRequestParts<Arc<EtatApp>> for Session {
    type Rejection = ErreurApi;

    async fn from_request_parts(
        parts: &mut Parts,
        etat: &Arc<EtatApp>,
    ) -> Result<Self, Self::Rejection> {
        let jeton = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(ErreurApi::NonAuthentifie)?;
        let (joueur, appareil) = etat
            .signataire
            .verifier_appareil(jeton, Utc::now())
            .ok_or(ErreurApi::NonAuthentifie)?;
        debit::verifier(&etat.limiteurs.par_profil, &joueur)?;
        Ok(Self { joueur, appareil })
    }
}
