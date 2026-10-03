//! Contrat de l'API de jeu (ADR 0024) : requêtes et réponses échangées avec la
//! PWA. Ces types sont la source de vérité : `etymo-api openapi` en tire
//! `contrat/openapi.json`, dont la PWA génère ses types TypeScript.
//!
//! Toute requête refuse les propriétés inconnues.

use chrono::{DateTime, Utc};
use etymo_domaine::IdCatalogue;
use etymo_domaine::fusion::MotifPresque;
use etymo_domaine::pli::{Regle, Resultat};
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Etat {
    /// Incrémentée à chaque mutation acceptée ; sert à détecter un conflit.
    pub version_etat: i64,
    /// Version du catalogue active pour ce joueur, `null` avant toute parution.
    pub version_catalogue: Option<String>,
    /// Briques connues et leurs exemplaires, triées par brique. Une brique à 0
    /// exemplaire est épuisée mais reste connue.
    pub reserve: Vec<Exemplaires>,
    /// Mots découverts, dans l'ordre de leur découverte.
    pub decouvertes: Vec<Decouverte>,
    /// Charges de pli, à l'horloge du serveur (ADR 0020).
    pub energie: EnergieEtat,
    /// Gouttes d'encre détenues.
    pub encre: u32,
    /// Garantie de nouveauté et filet d'utilité, par fascicule ; absents : à zéro.
    pub compteurs_plis: Vec<CompteurPli>,
    /// Derniers plis ouverts, du plus récent au plus ancien.
    pub historique_plis: Vec<OuverturePli>,
    /// Sabliers détenus et plafonds (ADR 0020). Absents des réponses
    /// enregistrées avant J4, comme les champs qui suivent.
    #[serde(default)]
    pub sabliers: SabliersEtat,
    /// Niveaux d'indice obtenus, par recette (ADR 0038).
    #[serde(default)]
    pub indices: Vec<IndiceObtenu>,
    /// Jalons atteints (ADR 0038), récompense récupérée ou non.
    #[serde(default)]
    pub jalons_atteints: Vec<IdCatalogue>,
    /// Jalons dont la récompense a été récupérée (ADR 0042) ; un jalon atteint
    /// absent de cette liste attend le joueur dans les quêtes.
    #[serde(default)]
    pub jalons_recuperes: Vec<IdCatalogue>,
    /// Prix de chaque niveau d'indice, en gouttes, du premier à la solution.
    #[serde(default)]
    pub prix_indices: Vec<u32>,
    /// Jours GMT distincts où le joueur a joué, premier jour compris
    /// (ADR 0050). Absent des réponses enregistrées avant App#25.
    #[serde(default)]
    #[schema(minimum = 1)]
    pub jours_de_jeu: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SabliersEtat {
    /// Sabliers détenus, sans plafond (ADR 0039).
    #[schema(minimum = 0)]
    pub detenus: u32,
    /// Prix d'un sablier, en gouttes.
    pub prix_gouttes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct IndiceObtenu {
    pub recette_id: IdCatalogue,
    #[schema(minimum = 1, maximum = 5)]
    pub niveau: u8,
}

/// Commande d'utilisation de sabliers détenus (ADR 0020, 0039).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeSablier {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    /// Au plus 24 : ceux qui remplissent une énergie vide.
    #[schema(minimum = 1, maximum = 24)]
    pub nombre: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseSablier {
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Commande d'échange d'encre contre des sabliers (ADR 0039) : 10 gouttes
/// chacun, sans plafond.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeAchatSablier {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    #[schema(minimum = 1, maximum = 1000)]
    pub nombre: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseAchatSablier {
    /// Gouttes payées.
    pub prix: u32,
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Commande d'achat d'un niveau d'indice (ADR 0038) : le niveau suivant.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeIndice {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    pub recette_id: IdCatalogue,
    #[schema(minimum = 1, maximum = 5)]
    pub niveau: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseIndice {
    /// Gouttes payées.
    pub prix: u32,
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Commande de récupération de la récompense d'un jalon atteint (ADR 0042).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeJalon {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    pub jalon_id: IdCatalogue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseJalon {
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Énergie à l'instant de la réponse.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EnergieEtat {
    #[schema(minimum = 0, maximum = 2)]
    pub charges: u8,
    pub capacite: u8,
    /// Retour de la prochaine charge ; `null` quand l'énergie est pleine : le temps s'arrête.
    pub prochaine_charge: Option<DateTime<Utc>>,
    /// Durée d'une recharge, en secondes.
    pub recharge_s: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CompteurPli {
    pub fascicule_id: IdCatalogue,
    /// Plis ouverts depuis la dernière brique nouvelle.
    pub plis_sans_nouveaute: u32,
    /// Plis consécutifs ouverts sans découverte possible.
    pub plis_sans_utilite: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct OuverturePli {
    pub fascicule_id: IdCatalogue,
    pub brique_id: IdCatalogue,
    pub resultat: Resultat,
    pub regle: Regle,
    /// Gouttes gagnées.
    pub encre: u32,
    pub ouvert_le: DateTime<Utc>,
}

/// Commande d'ouverture d'un pli (ADR 0011, 0016) : le fascicule choisi.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandePli {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    /// Version du catalogue dont le client a lu les chances.
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    pub fascicule_id: IdCatalogue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponsePli {
    pub ouverture: OuverturePli,
    /// Exemplaires de la brique après le pli.
    #[schema(minimum = 0, maximum = 5)]
    pub exemplaires: u8,
    /// Vrai si la brique était épuisée : « De retour ! ».
    pub etait_epuisee: bool,
    /// État confirmé après la commande.
    pub etat: Etat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Exemplaires {
    pub brique_id: IdCatalogue,
    #[schema(minimum = 0, maximum = 5)]
    pub exemplaires: u8,
    /// Première obtention de la brique : la réserve se trie par briques récentes.
    pub connue_le: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Decouverte {
    pub mot_id: IdCatalogue,
    pub recette_id: IdCatalogue,
    /// Rang de la découverte dans le codex du joueur, à partir de 1.
    pub numero: i32,
    pub decouverte_le: DateTime<Utc>,
}

/// Commande de fusion (ADR 0024) : la proposition ordonnée posée sur la table.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeFusion {
    /// Clé d'idempotence générée par le client (UUID v4) : une commande
    /// rejouée renvoie la réponse enregistrée sans rien modifier.
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    /// Version du catalogue avec laquelle la proposition a été préparée.
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    /// Briques posées sur la table, dans l'ordre.
    #[schema(min_items = 2, max_items = 2)]
    pub briques: Vec<IdCatalogue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseFusion {
    pub issue: IssueFusion,
    /// Jalons atteints par cette découverte, à annoncer.
    #[serde(default)]
    pub jalons: Vec<IdCatalogue>,
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Issue d'une fusion. Seule une découverte consomme des exemplaires.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum IssueFusion {
    /// Nouveau mot au codex : un exemplaire de chaque brique posée est consommé.
    Decouverte {
        recette_id: IdCatalogue,
        mot_id: IdCatalogue,
        /// Gouttes d'encre gagnées, selon la rareté du mot (ADR 0040).
        #[serde(default)]
        gouttes: u32,
    },
    /// Recette d'un mot déjà découvert : rien n'est consommé.
    Connue {
        recette_id: IdCatalogue,
        mot_id: IdCatalogue,
    },
    /// Combinaison attestée volontairement écartée, avec sa raison.
    Exclue { raison: String },
    /// Pertinente, mais mal ordonnée ou incomplète.
    Presque { motif: MotifPresque },
    /// Aucune correspondance.
    Echec,
    /// Recette exacte, mais la réserve ne contient pas un exemplaire de chaque brique.
    ReserveInsuffisante { briques: Vec<IdCatalogue> },
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Sante {
    pub statut: StatutSante,
    /// Version du catalogue chargée en mémoire, `null` si aucun index n'est publié.
    pub version_catalogue: Option<String>,
    /// Version du code de l'API.
    pub version_api: String,
    /// Commit à l'origine de l'image de l'API, vide hors déploiement. Sert à
    /// vérifier qu'un déploiement a bien pris (issue #7).
    #[serde(default)]
    pub revision_api: String,
    /// `true` hors production : la PWA affiche alors le bouton « Réinitialiser ».
    pub reinitialisation: bool,
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
