//! Contrat de l'API de jeu (ADR 0024) : requêtes et réponses échangées avec la
//! PWA. Ces types sont la source de vérité : `etymo-api openapi` en tire
//! `contrat/openapi.json`, dont la PWA génère ses types TypeScript.
//!
//! Toute requête refuse les propriétés inconnues.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// Longueur, en caractères base64url sans remplissage, d'un secret de 256 bits.
pub const LONGUEUR_SECRET: usize = 43;

/// Ouverture ou renouvellement de la session d'un profil invité.
///
/// Le client génère une fois pour toutes l'identifiant d'installation et le
/// secret, et les garde dans son stockage local. Le serveur n'en garde que
/// l'empreinte. Aucune donnée personnelle n'est demandée.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeSession {
    /// Identifiant aléatoire de l'installation (UUID v4).
    pub installation: Uuid,
    /// Secret aléatoire de 256 bits, en base64url sans remplissage.
    #[schema(min_length = 43, max_length = 43, pattern = "^[A-Za-z0-9_-]{43}$")]
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Session {
    /// Jeton signé, à présenter dans `Authorization: Bearer …`.
    pub jeton: String,
    /// Fin de validité du jeton (15 minutes).
    pub expire_le: DateTime<Utc>,
    /// Vrai si le profil vient d'être créé.
    pub nouveau: bool,
}

/// Projection de l'état confirmé du joueur : des identifiants et des nombres,
/// jamais de texte du catalogue (ADR 0027).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Etat {
    /// Incrémentée à chaque commande acceptée ; sert à détecter un conflit.
    pub version_etat: i64,
    /// Version du catalogue active pour ce joueur, `null` avant toute parution.
    pub version_catalogue: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Sante {
    pub statut: StatutSante,
    /// Version du catalogue chargée en mémoire, `null` si aucun index n'est publié.
    pub version_catalogue: Option<String>,
    /// Version du code de l'API.
    pub version_api: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum StatutSante {
    Ok,
    Degrade,
}

/// Erreur renvoyée par l'API. Le message est destiné au diagnostic, pas au joueur.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Erreur {
    pub code: CodeErreur,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CodeErreur {
    RequeteInvalide,
    NonAuthentifie,
    Interdit,
    Conflit,
    TropDeRequetes,
    Indisponible,
    Interne,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuse_les_proprietes_inconnues() {
        let texte = r#"{"installation":"6f9619ff-8b86-4d11-b42d-00c04fc964ff","secret":"x","role":"admin"}"#;
        assert!(serde_json::from_str::<DemandeSession>(texte).is_err());
    }
}
