//! Contrat de l'API de jeu (ADR 0024) : requêtes et réponses échangées avec la
//! PWA. Ces types sont la source de vérité : `etymo-api openapi` en tire
//! `contrat/openapi.json`, dont la PWA génère ses types TypeScript.
//!
//! Toute requête refuse les propriétés inconnues.

use chrono::{DateTime, NaiveDate, Utc};
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
    /// Indices obtenus, par recette (ADR 0051).
    #[serde(default)]
    pub indices: Vec<IndiceObtenu>,
    /// Jalons atteints (ADR 0038), récompense récupérée ou non.
    #[serde(default)]
    pub jalons_atteints: Vec<IdCatalogue>,
    /// Jalons dont la récompense a été récupérée (ADR 0042) ; un jalon atteint
    /// absent de cette liste attend le joueur dans les quêtes.
    #[serde(default)]
    pub jalons_recuperes: Vec<IdCatalogue>,
    /// Prix de chaque indice, en gouttes : silhouette, sens littéral, définition.
    #[serde(default)]
    pub prix_indices: Vec<u32>,
    /// Jours GMT distincts où le joueur a joué, premier jour compris
    /// (ADR 0050). Absent des réponses enregistrées avant App#25.
    #[serde(default)]
    #[schema(minimum = 1)]
    pub jours_de_jeu: u32,
    /// Cartes qui ont un historique de ricochets (ADR 0044) ; une carte sans
    /// ligne est au niveau 0, à revoir aujourd'hui. Absent avant App#18.
    #[serde(default)]
    pub ricochets: Vec<RicochetEtat>,
    /// Réponses du jour GMT, pour les quêtes ; absent avant App#18.
    #[serde(default)]
    pub ricochets_du_jour: RicochetsDuJour,
    /// Progression de chaque quête au long cours, calculée par le serveur sur
    /// le codex (ADR 0045). Un palier est atteint quand elle franchit son seuil.
    #[serde(default)]
    pub progression_quetes: Vec<ProgressionQuete>,
    /// Paliers de quêtes au long cours dont la récompense a été récupérée.
    #[serde(default)]
    pub paliers_recuperes: Vec<IdCatalogue>,
    /// Les quêtes du jour GMT (ADR 0045), tirées par le serveur à la première
    /// visite du jour ; vide avant App#20 ou sans catalogue.
    #[serde(default)]
    pub quetes_du_jour: Vec<QueteDuJour>,
    /// Carte de lecteur (ADR 0045) ; absente avant App#21.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub carte_de_lecteur: Option<CarteDeLecteurEtat>,
    /// Cadeau de bienvenue déclaré par le catalogue (ADR 0046) ; absent s'il n'y en a pas.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cadeau_de_bienvenue: Option<CadeauEtat>,
    /// Quêtes initiales de la première semaine (ADR 0046) ; vide passé la semaine, une fois récupérées.
    #[serde(default)]
    pub quetes_initiales: Vec<QueteInitialeEtat>,
    /// Fascicules parus que le joueur a débloqués (ADR 0068), triés par
    /// fascicule. Vide dans une réponse enregistrée avant ce champ, ou sans
    /// catalogue : le client tient alors tous les fascicules parus pour débloqués.
    #[serde(default)]
    pub fascicules_debloques: Vec<FasciculeDebloque>,
    /// Compte facultatif (ADR 0070) ; absent pour une partie invitée.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compte: Option<CompteEtat>,
    /// Paires déjà essayées sans succès depuis la dernière parution (App#89),
    /// dans l'ordre des cases, triées. Vide avant ce champ ou après une parution.
    #[serde(default)]
    pub essais: Vec<Essai>,
    /// Quêtes de collection des fascicules débloqués (App#90) ; vide avant ce
    /// champ ou sans catalogue. Leur récupération passe par `paliers_recuperes`.
    #[serde(default)]
    pub progression_collections: Vec<ProgressionCollection>,
}

/// Une paire essayée sans succès (échec ou « presque ») : ni issue, ni date.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Essai {
    pub gauche: IdCatalogue,
    pub droite: IdCatalogue,
}

/// Compte du joueur (ADR 0070). L'adresse n'y figure jamais : le serveur ne
/// la garde pas.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CompteEtat {
    pub pseudo: String,
    /// Faux tant que le joueur n'a ni confirmé ni modifié son pseudo par
    /// défaut : il reste alors privé.
    pub pseudo_confirme: bool,
    /// Vrai si l'adresse du compte a un abonnement Ko-fi actif (ADR 0078) : la
    /// PWA ne présente alors plus la modale de soutien. Aucun avantage de jeu.
    #[serde(default)]
    pub soutien: bool,
}

/// Demande d'un lien et d'un code de connexion par e-mail (ADR 0070). La même
/// demande crée un compte depuis la partie invitée ou ouvre un compte existant.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeCompte {
    /// Adresse électronique : elle sert à l'envoi, puis le serveur n'en garde qu'une empreinte.
    #[schema(max_length = 254)]
    pub courriel: String,
}

/// Réponse identique, que l'adresse ait déjà un compte ou non.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseDemandeCompte {
    /// Défi à confirmer par le code ou le lien de l'e-mail.
    pub defi: Uuid,
    /// Délai avant de proposer « Renvoyer », en secondes.
    pub renvoyer_dans_s: u32,
}

/// Confirmation d'un défi, par le jeton du lien ou par le code à 6 chiffres :
/// exactement l'un des deux.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeConfirmation {
    pub defi: Uuid,
    /// Jeton du lien, en base64url.
    #[serde(default)]
    #[schema(max_length = 43)]
    pub jeton: Option<String>,
    /// Code de l'e-mail, 6 chiffres.
    #[serde(default)]
    #[schema(pattern = "^[0-9]{6}$")]
    pub code: Option<String>,
    /// Remplace la partie invitée de cet appareil par celle du compte, après
    /// l'avertissement d'un `409`.
    #[serde(default)]
    pub remplacer_invite: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum IssueConfirmation {
    /// La partie invitée est devenue un compte, sans rien perdre.
    CompteCree,
    /// Cet appareil joue désormais la partie du compte.
    Connecte,
}

/// Défi confirmé : le client rouvre sa session, son ancien jeton ne vaut plus.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseConfirmation {
    pub issue: IssueConfirmation,
    pub pseudo: String,
    pub pseudo_confirme: bool,
}

/// Nouveau pseudo, ou pseudo par défaut confirmé tel quel.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandePseudo {
    /// 3 à 24 caractères : lettres minuscules sans accent, chiffres, traits d'union isolés.
    #[schema(min_length = 3, max_length = 24, pattern = "^[a-z0-9]+(-[a-z0-9]+)*$")]
    pub pseudo: String,
}

/// Suppression du compte et de toute la progression, sur tous les appareils.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeSuppression {
    /// Doit valoir `SUPPRIMER`.
    pub confirmation: String,
}

/// Ce que l'appareil perdrait en ouvrant le compte : sa partie invitée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AvertissementRemplacement {
    pub decouvertes: u32,
    pub gouttes: u32,
}

/// Un fascicule débloqué par le joueur (ADR 0068).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FasciculeDebloque {
    pub fascicule_id: IdCatalogue,
    pub debloque_le: DateTime<Utc>,
}

/// Les quatre quêtes initiales, liste fermée ; le client rend le texte de chacune.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CodeQueteInitiale {
    /// Découvrir trois mots.
    TroisMots,
    /// Découvrir un mot qui porte une transformation.
    Transformation,
    /// Cinq ricochets sans faute.
    PremiersRicochets,
    /// Remplir sa première carte de lecteur.
    PremiereCarte,
}

/// Récompense d'une quête initiale, annoncée d'avance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RecompenseInitiale {
    /// Plis ordinaires du fascicule que choisit le joueur, sans énergie ni garantie.
    pub plis_offerts: u32,
    pub plis_de_lecteur: u32,
    pub sabliers: u32,
    pub gouttes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct QueteInitialeEtat {
    pub code: CodeQueteInitiale,
    #[schema(minimum = 1)]
    pub cible: u8,
    pub progres: u8,
    /// Faite pendant la première semaine : la récompense peut se récupérer.
    pub faite: bool,
    pub recuperee: bool,
    pub recompense: RecompenseInitiale,
}

/// Commande de récupération d'une quête initiale ; le fascicule sert aux plis offerts et de lecteur.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeQueteInitiale {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    pub code: CodeQueteInitiale,
    /// Obligatoire si la récompense contient des plis.
    #[serde(default)]
    pub fascicule_id: Option<IdCatalogue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseQueteInitiale {
    /// Briques des plis offerts et de lecteur, dans l'ordre.
    pub ouvertures: Vec<OuverturePli>,
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Cadeau de bienvenue : une récompense unique par profil, annoncée d'avance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CadeauEtat {
    /// Une brique par pli de bienvenue.
    pub plis: Vec<IdCatalogue>,
    pub sabliers: u32,
    pub encre: u32,
    pub recupere: bool,
}

/// Commande de récupération du cadeau de bienvenue.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeCadeau {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseCadeau {
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Ce que donne une carte de lecteur pleine, annoncé d'avance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RecompenseCarte {
    pub gouttes: u32,
    pub sabliers: u32,
    /// Plis en attente de plus : une charge d'énergie, à ouvrir comme les autres.
    pub plis: u32,
}

/// Carte de lecteur : un tampon par jour GMT où les trois quêtes sont faites,
/// sans série ni expiration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CarteDeLecteurEtat {
    /// Jours des tampons de la carte affichée, du plus ancien au plus récent :
    /// la plus ancienne carte pleine à récupérer, sinon la carte en cours.
    pub tampons: Vec<NaiveDate>,
    /// Tampons d'une carte pleine.
    #[schema(minimum = 1)]
    pub taille: u8,
    /// Cartes pleines dont la récompense attend.
    pub a_recuperer: u32,
    /// Cartes pleines, récupérées ou non.
    pub remplies: u32,
    pub recompense: RecompenseCarte,
}

/// Commande de récupération d'une carte pleine.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeCarteDeLecteur {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseCarteDeLecteur {
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Sorte d'une quête du jour : une de chaque par jour (ADR 0045).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SorteQueteDuJour {
    Table,
    Memoire,
    Adresse,
}

/// Les six quêtes du jour, liste fermée ; le client rend le texte de chacune.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CodeQueteDuJour {
    /// Trouver le mot décrit par son seul sens (`mot_id`).
    TableSens,
    /// Cinq ricochets justes de suite.
    MemoireSansFaute,
    /// Trois mots retrouvés par leur sens littéral.
    MemoireLitteral,
    /// Maîtriser une carte.
    MemoireMaitrise,
    /// Découper trois mots sans erreur.
    AdresseDecouper,
    /// Relier quatre paires sans erreur.
    AdressePaires,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct QueteDuJour {
    #[schema(minimum = 0, maximum = 2)]
    pub rang: u8,
    pub sorte: SorteQueteDuJour,
    pub code: CodeQueteDuJour,
    /// Le mot à trouver, pour la quête de table.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mot_id: Option<IdCatalogue>,
    /// Ce qu'il faut atteindre.
    #[schema(minimum = 1)]
    pub cible: u8,
    /// Ce qui est fait ; une suite sans faute retombe à zéro à la première erreur.
    pub progres: u8,
    pub faite: bool,
    /// Jour GMT de la quête : une quête faite et pas récupérée survit à minuit (ADR 0063).
    #[serde(default)]
    pub jour: Option<NaiveDate>,
    /// La récompense est prise.
    #[serde(default)]
    pub recuperee: bool,
    /// Annoncée d'avance, selon la sorte de la quête.
    #[serde(default)]
    pub recompense: Option<RecompenseQuete>,
}

/// Ce que donne une quête du jour faite, annoncé d'avance (ADR 0063).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RecompenseQuete {
    pub gouttes: u32,
    pub sabliers: u32,
    /// Plis en attente de plus : une charge d'énergie, à ouvrir comme les autres.
    pub plis: u32,
}

/// Commande de récupération de la récompense d'une quête du jour faite.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeQueteDuJour {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    pub jour: NaiveDate,
    #[schema(minimum = 0, maximum = 2)]
    pub rang: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseQueteDuJour {
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Niveau de révision d'une carte trouvée : de quoi dessiner le signe de maîtrise.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RicochetEtat {
    /// Mot (`unt_…`) ou brique (`brq_…`).
    pub unite_id: IdCatalogue,
    #[schema(minimum = 0, maximum = 3)]
    pub niveau: u8,
    /// Perdue sur une erreur, regagnée par trois bonnes réponses sur trois jours (ADR 0065).
    pub maitrisee: bool,
    /// Vrai si une réponse d'aujourd'hui compterait.
    pub a_revoir: bool,
}

/// Les cinq premières réponses du jour comptent pour les quêtes (ADR 0045).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RicochetsDuJour {
    #[schema(minimum = 0, maximum = 5)]
    pub reponses: u8,
    #[schema(minimum = 0, maximum = 5)]
    pub bonnes: u8,
}

/// Les cinq formats d'une question de ricochet (ADR 0044).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FormatRicochet {
    /// Quel sens pour cette brique ? Cible `brq_…`, réponse un `sns_…`.
    SensBrique,
    /// Quelle brique pour ce sens ? Cible `brq_…`, réponse un `brq_…`.
    BriqueSens,
    /// Quel mot pour ce sens littéral ? Cible `unt_…`, réponse un `unt_…`.
    MotSens,
    /// Où couper ce mot ? Cible `unt_…`, réponse les positions de coupe.
    Decouper,
    /// Relier une brique à son sens, une commande par brique. Cible `brq_…`,
    /// réponse le premier `sns_…` essayé pour elle.
    Paires,
    /// Quel préfixe et quel suffixe forment le mot de cette définition ? Cible
    /// `unt_…`, choix les briques des deux colonnes, réponse deux `brq_…` (ADR 0067).
    Assembler,
}

/// Une question de la séance, par identifiants : le client rend les textes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct QuestionRicochet {
    pub format: FormatRicochet,
    /// La carte visée ; quatre briques pour les paires.
    pub cartes: Vec<IdCatalogue>,
    /// Choix possibles, dans le désordre : des `sns_…`, `brq_…` ou `unt_…`
    /// selon le format. Vide pour *découper* et *paires*.
    #[serde(default)]
    pub choix: Vec<IdCatalogue>,
}

/// Séance de ricochets : cinq questions au plus, aucune chronologie, rien n'est écrit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SeanceRicochets {
    pub questions: Vec<QuestionRicochet>,
}

/// Réponse du joueur : un choix, les positions de coupe d'un mot, ou le préfixe puis le suffixe d'un assemblage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum ReponseJoueur {
    Choix(IdCatalogue),
    /// Huit positions au plus.
    Coupes(Vec<u32>),
    /// Deux briques : préfixe, suffixe.
    Briques(Vec<IdCatalogue>),
}

/// Commande de réponse à une question de ricochet : une commande, une carte.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandeRicochet {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    pub format: FormatRicochet,
    pub unite_id: IdCatalogue,
    pub reponse: ReponseJoueur,
}

/// Carte après la réponse : de quoi annoncer son retour (« Demain », « Maîtrisée »).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CarteRicochet {
    #[schema(minimum = 0, maximum = 3)]
    pub niveau: u8,
    pub maitrisee: bool,
    /// Jour GMT du prochain ricochet qui compte.
    pub prochaine_revision: NaiveDate,
    /// Bonnes réponses données au niveau 3 ; trois maîtrisent la carte.
    #[schema(minimum = 0, maximum = 3)]
    pub bonnes_niveau_3: u8,
    /// Vrai si cette erreur a fait perdre la maîtrise de la carte (ADR 0065).
    #[serde(default)]
    pub maitrise_perdue: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponseRicochet {
    /// Vrai si la réponse est la bonne, que la carte ait été à revoir ou non.
    pub juste: bool,
    pub carte: CarteRicochet,
    /// État confirmé après la commande.
    pub etat: Etat,
}

/// Progression d'une quête de collection (App#90), d'un fascicule débloqué
/// seulement : un fascicule verrouillé n'expose aucun total (ADR 0069).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ProgressionCollection {
    pub palier_id: IdCatalogue,
    pub fascicule_id: IdCatalogue,
    pub progression: u32,
    pub total: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ProgressionQuete {
    pub quete_id: IdCatalogue,
    pub progression: u32,
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
    #[schema(minimum = 1, maximum = 3)]
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

/// Commande d'achat d'un indice à la carte (ADR 0051) : `niveau` identifie
/// l'indice, 1 silhouette, 2 sens littéral, 3 définition.
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
    #[schema(minimum = 1, maximum = 3)]
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

/// Commande de récupération de la récompense d'un palier de quête au long cours (ADR 0045).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DemandePalier {
    /// Clé d'idempotence générée par le client (UUID v4).
    pub commande: Uuid,
    /// `version_etat` connue du client.
    pub version_etat: i64,
    #[schema(max_length = 64)]
    pub version_catalogue: String,
    pub palier_id: IdCatalogue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReponsePalier {
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
    /// Fascicules débloqués par cette découverte, à annoncer (ADR 0068).
    #[serde(default)]
    pub fascicules_debloques: Vec<IdCatalogue>,
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
    /// Code de connexion faux : essais restants avant d'en demander un nouveau.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub essais_restants: Option<u8>,
    /// Connexion refusée sans `remplacer_invite` : la partie invitée qui serait effacée.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avertissement: Option<AvertissementRemplacement>,
    /// Pseudo déjà pris : un pseudo libre proche.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proposition: Option<String>,
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
    /// Défi de connexion expiré, déjà utilisé ou épuisé (`410`).
    Expire,
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
