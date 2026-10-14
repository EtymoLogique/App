//! Compte facultatif (ADR 0070) : connexion sans mot de passe par un lien et
//! un code envoyés par e-mail, pseudo, déconnexion et suppression.
//!
//! La confirmation ne porte ni clé d'idempotence ni `version_etat` : le défi
//! est à usage unique, un rejeu reçoit `410` et le client rouvre sa session.

use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::routing::{delete, post, put};
use axum::{Json, Router};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use etymo_contrat::{
    AvertissementRemplacement, CompteEtat, DemandeCompte, DemandeConfirmation, DemandePseudo,
    DemandeSuppression, Erreur, IssueConfirmation, ReponseConfirmation, ReponseDemandeCompte,
};
use etymo_domaine::compte::{normaliser_courriel, pseudo_par_defaut, pseudo_valide};
use sha2::{Digest, Sha256};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::erreur::ErreurApi;
use crate::extraction::{Adresse, Joueur, JsonStrict, Session};
use crate::{EtatApp, debit, secret};

/// Essais de code par défi.
const ESSAIS: i16 = 5;
/// Délai avant de proposer « Renvoyer ».
const RENVOYER_DANS_S: u32 = 60;
/// Une demande ne porte qu'une adresse.
const DEMANDE_MAX: usize = 1024;

pub fn routes() -> Router<Arc<EtatApp>> {
    Router::new()
        .route(
            "/compte/demande",
            post(demander).layer(DefaultBodyLimit::max(DEMANDE_MAX)),
        )
        .route("/compte/confirmation", post(confirmer))
        .route("/compte/pseudo", put(changer_pseudo))
        .route("/compte/deconnexion", post(deconnecter))
        .route("/compte", delete(supprimer))
}

fn aleatoire() -> Result<u32, ErreurApi> {
    getrandom::u32().map_err(|e| ErreurApi::Interne(e.to_string()))
}

/// Code à 6 chiffres, tiré sans biais : on rejette la fin de l'intervalle.
fn code_aleatoire() -> Result<String, ErreurApi> {
    const PLAFOND: u32 = u32::MAX - u32::MAX % 1_000_000;
    loop {
        let n = aleatoire()?;
        if n < PLAFOND {
            return Ok(format!("{:06}", n % 1_000_000));
        }
    }
}

/// Racine d'un pseudo, sans ses chiffres finaux, pour en proposer un autre.
fn racine(pseudo: &str) -> String {
    let sans_chiffres = match pseudo.rsplit_once('-') {
        Some((r, fin)) if fin.bytes().all(|o| o.is_ascii_digit()) => r,
        _ => pseudo,
    };
    let mut r = sans_chiffres.to_owned();
    r.truncate(16);
    let r = r.trim_end_matches('-');
    if r.is_empty() { "lecteur" } else { r }.to_owned()
}

/// Pseudos de repli : 5 avec 4 chiffres, puis 5 avec 5 chiffres.
fn candidats(racine: &str) -> Result<Vec<String>, ErreurApi> {
    let mut liste = Vec::with_capacity(10);
    for _ in 0..5 {
        liste.push(format!("{racine}-{:04}", aleatoire()? % 10_000));
    }
    for _ in 0..5 {
        liste.push(format!("{racine}-{:05}", aleatoire()? % 100_000));
    }
    Ok(liste)
}

/// L'appareil du jeton appartient encore au joueur du jeton ; sinon le jeton
/// est périmé (appareil déconnecté ou rattaché à un autre joueur).
async fn verifier_appareil(tx: &mut PgConnection, session: &Session) -> Result<(), ErreurApi> {
    let joueur = sqlx::query_scalar!(
        "SELECT joueur_id FROM appareil WHERE id = $1",
        session.appareil
    )
    .fetch_optional(tx)
    .await?;
    (joueur == Some(session.joueur))
        .then_some(())
        .ok_or(ErreurApi::NonAuthentifie)
}

/// Envoie un lien et un code de connexion à l'adresse donnée. La réponse est
/// la même que l'adresse ait un compte ou non : seul un profil qui a déjà un
/// compte et en demande un autre reçoit `409`.
#[utoipa::path(post, path = "/compte/demande", tag = "compte", security(("session" = [])), request_body = DemandeCompte,
    responses(
        (status = 202, description = "E-mail envoyé si l'adresse peut ouvrir un compte", body = ReponseDemandeCompte),
        (status = 400, description = "Adresse invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 409, description = "Ce profil a déjà un compte", body = Erreur),
        (status = 413, description = "Corps de plus de 1 Kio", body = Erreur),
        (status = 429, description = "Trop de demandes", body = Erreur),
        (status = 503, description = "Envoi impossible ou désactivé", body = Erreur),
    ))]
pub async fn demander(
    State(app): State<Arc<EtatApp>>,
    Adresse(adresse): Adresse,
    session: Session,
    JsonStrict(demande): JsonStrict<DemandeCompte>,
) -> Result<(StatusCode, Json<ReponseDemandeCompte>), ErreurApi> {
    let courriel = app.courriel.as_ref().ok_or(ErreurApi::EnvoiImpossible)?;
    debit::verifier(&app.limiteurs.par_adresse, &adresse)?;
    let a = normaliser_courriel(&demande.courriel).ok_or_else(|| {
        ErreurApi::RequeteInvalide("courriel : adresse électronique attendue".into())
    })?;
    let empreinte = courriel.empreinte_adresse(&a);
    debit::verifier(&app.limiteurs.par_courriel, &empreinte)?;

    let mut tx = app.base.begin().await?;
    verifier_appareil(&mut tx, &session).await?;
    let connue = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM compte WHERE empreinte_courriel = $1) AS "connue!""#,
        &empreinte[..]
    )
    .fetch_one(&mut *tx)
    .await?;
    let (intention, pseudo_propose) = if connue {
        ("connexion", None)
    } else {
        let a_un_compte = sqlx::query_scalar!(
            r#"SELECT EXISTS (SELECT 1 FROM compte WHERE joueur_id = $1) AS "existe!""#,
            session.joueur
        )
        .fetch_one(&mut *tx)
        .await?;
        if a_un_compte {
            return Err(ErreurApi::Conflit("ce profil a déjà un compte"));
        }
        let locale = a.split_once('@').map_or("", |(l, _)| l);
        let chiffres = u16::try_from(aleatoire()? % 10_000).expect("moins de 10 000");
        ("creation", Some(pseudo_par_defaut(locale, chiffres)))
    };

    let defi = Uuid::new_v4();
    let mut octets = [0u8; 32];
    getrandom::fill(&mut octets).map_err(|e| ErreurApi::Interne(e.to_string()))?;
    let jeton = URL_SAFE_NO_PAD.encode(octets);
    let code = code_aleatoire()?;
    // Un nouveau code annule le précédent.
    sqlx::query!(
        "DELETE FROM defi_connexion WHERE empreinte_courriel = $1 AND utilise_le IS NULL",
        &empreinte[..]
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "INSERT INTO defi_connexion (id, appareil_id, intention, empreinte_courriel, pseudo_propose, empreinte_jeton, empreinte_code, expire_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '15 minutes')",
        defi,
        session.appareil,
        intention,
        &empreinte[..],
        pseudo_propose,
        &Sha256::digest(octets)[..],
        &courriel.empreinte_code(defi, &code)[..],
    )
    .execute(&mut *tx)
    .await?;
    // Envoi avant la validation : un échec ne laisse aucun défi, l'ancien code reste valable.
    courriel.envoyer(&a, defi, &jeton, &code).await?;
    tx.commit().await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(ReponseDemandeCompte {
            defi,
            renvoyer_dans_s: RENVOYER_DANS_S,
        }),
    ))
}

/// Confirme un défi par le code ou par le jeton du lien. Création : la partie
/// de l'appareil demandeur devient un compte. Connexion : cet appareil joue la
/// partie du compte ; s'il portait une partie invitée avec une progression,
/// il faut `remplacer_invite`, sinon `409` avec ce qui serait perdu.
#[utoipa::path(post, path = "/compte/confirmation", tag = "compte", security(("session" = [])), request_body = DemandeConfirmation,
    responses(
        (status = 200, description = "Compte créé ou ouvert : rouvrir la session", body = ReponseConfirmation),
        (status = 400, description = "Code faux (`essais_restants`) ou requête invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 409, description = "Partie invitée à remplacer (`avertissement`), ou profil qui a déjà un compte", body = Erreur),
        (status = 410, description = "Défi expiré, utilisé ou épuisé : demander un nouveau code", body = Erreur),
        (status = 503, description = "Comptes désactivés", body = Erreur),
    ))]
pub async fn confirmer(
    State(app): State<Arc<EtatApp>>,
    session: Session,
    JsonStrict(demande): JsonStrict<DemandeConfirmation>,
) -> Result<Json<ReponseConfirmation>, ErreurApi> {
    let courriel = app.courriel.as_ref().ok_or(ErreurApi::EnvoiImpossible)?;
    let preuve = match (&demande.jeton, &demande.code) {
        (Some(jeton), None) => Ok(jeton),
        (None, Some(code)) if code.len() == 6 && code.bytes().all(|o| o.is_ascii_digit()) => {
            Err(code)
        }
        _ => {
            return Err(ErreurApi::RequeteInvalide(
                "jeton ou code à 6 chiffres : exactement l'un des deux".into(),
            ));
        }
    };

    let mut tx = app.base.begin().await?;
    verifier_appareil(&mut tx, &session).await?;
    let defi = sqlx::query!(
        r#"SELECT appareil_id, intention, empreinte_courriel, pseudo_propose, empreinte_jeton, empreinte_code, tentatives,
                  (expire_le > now() AND utilise_le IS NULL) AS "ouvert!"
           FROM defi_connexion WHERE id = $1 FOR UPDATE"#,
        demande.defi
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ErreurApi::Expire)?;
    if !defi.ouvert || defi.tentatives >= ESSAIS {
        return Err(ErreurApi::Expire);
    }
    let juste = match preuve {
        Ok(jeton) => URL_SAFE_NO_PAD
            .decode(jeton)
            .ok()
            .filter(|o| o.len() == 32)
            .is_some_and(|o| secret::egales(&Sha256::digest(&o), &defi.empreinte_jeton)),
        Err(code) => secret::egales(
            &courriel.empreinte_code(demande.defi, code),
            &defi.empreinte_code,
        ),
    };
    if !juste {
        let tentatives = sqlx::query_scalar!(
            "UPDATE defi_connexion SET tentatives = tentatives + 1 WHERE id = $1 RETURNING tentatives",
            demande.defi
        )
        .fetch_one(&mut *tx)
        .await?;
        // Validé avant de répondre : un essai faux compte toujours.
        tx.commit().await?;
        return Err(match u8::try_from(ESSAIS - tentatives) {
            Ok(restants) if restants > 0 => ErreurApi::CodeFaux {
                essais_restants: restants,
            },
            _ => ErreurApi::Expire,
        });
    }

    let (issue, joueur) = if defi.intention == "creation" {
        (
            IssueConfirmation::CompteCree,
            creer(
                &mut tx,
                defi.appareil_id,
                &defi.empreinte_courriel,
                defi.pseudo_propose,
            )
            .await?,
        )
    } else {
        let Some(compte) = sqlx::query_scalar!(
            "SELECT joueur_id FROM compte WHERE empreinte_courriel = $1",
            &defi.empreinte_courriel
        )
        .fetch_optional(&mut *tx)
        .await?
        else {
            // Compte supprimé depuis la demande.
            return Err(ErreurApi::Expire);
        };
        rattacher(&mut tx, &session, compte, demande.remplacer_invite).await?;
        (IssueConfirmation::Connecte, compte)
    };
    sqlx::query!(
        "UPDATE defi_connexion SET utilise_le = now() WHERE id = $1",
        demande.defi
    )
    .execute(&mut *tx)
    .await?;
    let compte = sqlx::query!(
        "SELECT pseudo, pseudo_confirme FROM compte WHERE joueur_id = $1",
        joueur
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(ReponseConfirmation {
        issue,
        pseudo: compte.pseudo,
        pseudo_confirme: compte.pseudo_confirme,
    }))
}

/// Crée le compte sur le joueur de l'appareil qui a fait la demande.
async fn creer(
    tx: &mut PgConnection,
    appareil: Uuid,
    empreinte: &[u8],
    pseudo_propose: Option<String>,
) -> Result<Uuid, ErreurApi> {
    let joueur = sqlx::query_scalar!("SELECT joueur_id FROM appareil WHERE id = $1", appareil)
        .fetch_one(&mut *tx)
        .await?;
    let etat = sqlx::query!(
        r#"SELECT EXISTS (SELECT 1 FROM compte WHERE empreinte_courriel = $1) AS "adresse_prise!",
                  EXISTS (SELECT 1 FROM compte WHERE joueur_id = $2) AS "a_un_compte!""#,
        empreinte,
        joueur
    )
    .fetch_one(&mut *tx)
    .await?;
    if etat.adresse_prise {
        // Un compte a été créé pour cette adresse entre-temps : un nouveau code ouvrira une connexion.
        return Err(ErreurApi::Expire);
    }
    if etat.a_un_compte {
        return Err(ErreurApi::Conflit("ce profil a déjà un compte"));
    }
    let propose = pseudo_propose.unwrap_or_else(|| "lecteur-0000".to_owned());
    let mut essais = vec![propose.clone()];
    essais.extend(candidats(&racine(&propose))?);
    for pseudo in essais {
        let cree = sqlx::query_scalar!(
            "INSERT INTO compte (joueur_id, empreinte_courriel, pseudo) VALUES ($1, $2, $3)
             ON CONFLICT (pseudo) DO NOTHING RETURNING joueur_id",
            joueur,
            empreinte,
            pseudo,
        )
        .fetch_optional(&mut *tx)
        .await?;
        if cree.is_some() {
            return Ok(joueur);
        }
    }
    Err(ErreurApi::Interne("aucun pseudo libre".into()))
}

/// Rattache l'appareil de la session au joueur du compte. Une partie invitée
/// avec une progression n'est remplacée que sur demande explicite, puis
/// effacée : jamais fusionnée (ADR 0070).
async fn rattacher(
    tx: &mut PgConnection,
    session: &Session,
    compte: Uuid,
    remplacer_invite: bool,
) -> Result<(), ErreurApi> {
    if session.joueur == compte {
        return Ok(());
    }
    let ancien = sqlx::query!(
        r#"SELECT EXISTS (SELECT 1 FROM compte WHERE joueur_id = $1) AS "a_un_compte!",
                  (SELECT count(*) FROM decouverte WHERE joueur_id = $1) AS "decouvertes!",
                  (SELECT count(*) FROM ouverture_pli WHERE joueur_id = $1) AS "plis!",
                  COALESCE((SELECT gouttes FROM encre WHERE joueur_id = $1), 0) AS "gouttes!""#,
        session.joueur
    )
    .fetch_one(&mut *tx)
    .await?;
    if !ancien.a_un_compte && (ancien.decouvertes > 0 || ancien.plis > 0) && !remplacer_invite {
        // Ni le défi ni un essai ne sont consommés : la transaction est annulée.
        return Err(ErreurApi::Remplacement(AvertissementRemplacement {
            decouvertes: u32::try_from(ancien.decouvertes).unwrap_or(u32::MAX),
            gouttes: u32::try_from(ancien.gouttes).unwrap_or(0),
        }));
    }
    sqlx::query!(
        "UPDATE appareil SET joueur_id = $2 WHERE id = $1",
        session.appareil,
        compte
    )
    .execute(&mut *tx)
    .await?;
    supprimer_si_orphelin(tx, session.joueur).await
}

/// Efface un joueur qui n'a plus ni appareil ni compte : sa partie est perdue
/// pour tout le monde.
async fn supprimer_si_orphelin(tx: &mut PgConnection, joueur: Uuid) -> Result<(), ErreurApi> {
    sqlx::query!(
        "DELETE FROM joueur j WHERE j.id = $1
           AND NOT EXISTS (SELECT 1 FROM appareil a WHERE a.joueur_id = j.id)
           AND NOT EXISTS (SELECT 1 FROM compte c WHERE c.joueur_id = j.id)",
        joueur
    )
    .execute(tx)
    .await?;
    Ok(())
}

/// Confirme ou change le pseudo ; il devient alors public quand une vue
/// compétitive existera. Un pseudo pris reçoit `409` avec une proposition.
#[utoipa::path(put, path = "/compte/pseudo", tag = "compte", security(("session" = [])), request_body = DemandePseudo,
    responses(
        (status = 200, description = "Pseudo confirmé", body = CompteEtat),
        (status = 400, description = "Pseudo invalide", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
        (status = 403, description = "Partie invitée : aucun compte", body = Erreur),
        (status = 409, description = "Pseudo déjà pris (`proposition`)", body = Erreur),
    ))]
pub async fn changer_pseudo(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandePseudo>,
) -> Result<Json<CompteEtat>, ErreurApi> {
    if !pseudo_valide(&demande.pseudo) {
        return Err(ErreurApi::RequeteInvalide(
            "pseudo : 3 à 24 caractères, lettres minuscules, chiffres et traits d'union".into(),
        ));
    }
    let mise_a_jour = sqlx::query!(
        "UPDATE compte SET pseudo = $2, pseudo_confirme = true WHERE joueur_id = $1",
        joueur,
        demande.pseudo
    )
    .execute(&app.base)
    .await;
    match mise_a_jour {
        Ok(r) if r.rows_affected() == 0 => Err(ErreurApi::Interdit("aucun compte")),
        Ok(_) => Ok(Json(CompteEtat {
            pseudo: demande.pseudo,
            pseudo_confirme: true,
        })),
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => {
            for proposition in candidats(&racine(&demande.pseudo))? {
                let prise = sqlx::query_scalar!(
                    r#"SELECT EXISTS (SELECT 1 FROM compte WHERE pseudo = $1) AS "prise!""#,
                    proposition
                )
                .fetch_one(&app.base)
                .await?;
                if !prise {
                    return Err(ErreurApi::PseudoPris { proposition });
                }
            }
            Err(ErreurApi::Interne("aucun pseudo libre".into()))
        }
        Err(e) => Err(e.into()),
    }
}

/// Détache cet appareil : le client repart d'un profil invité neuf. La partie
/// reste sur le compte ; une partie invitée sans autre appareil est effacée.
#[utoipa::path(post, path = "/compte/deconnexion", tag = "compte", security(("session" = [])),
    responses(
        (status = 204, description = "Appareil détaché"),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
    ))]
pub async fn deconnecter(
    State(app): State<Arc<EtatApp>>,
    session: Session,
) -> Result<StatusCode, ErreurApi> {
    let mut tx = app.base.begin().await?;
    sqlx::query!(
        "DELETE FROM appareil WHERE id = $1 AND joueur_id = $2",
        session.appareil,
        session.joueur
    )
    .execute(&mut *tx)
    .await?;
    supprimer_si_orphelin(&mut tx, session.joueur).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Supprime le joueur et toute sa progression, sur tous ses appareils :
/// compte, appareils, codex, réserve, encre… Définitif.
#[utoipa::path(delete, path = "/compte", tag = "compte", security(("session" = [])), request_body = DemandeSuppression,
    responses(
        (status = 204, description = "Compte et progression effacés"),
        (status = 400, description = "Confirmation absente", body = Erreur),
        (status = 401, description = "Session absente ou expirée", body = Erreur),
    ))]
pub async fn supprimer(
    State(app): State<Arc<EtatApp>>,
    Joueur(joueur): Joueur,
    JsonStrict(demande): JsonStrict<DemandeSuppression>,
) -> Result<StatusCode, ErreurApi> {
    if demande.confirmation != "SUPPRIMER" {
        return Err(ErreurApi::RequeteInvalide(
            "confirmation : « SUPPRIMER » attendu".into(),
        ));
    }
    sqlx::query!("DELETE FROM joueur WHERE id = $1", joueur)
        .execute(&app.base)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn racine_sans_chiffres_finaux() {
        assert_eq!(racine("camille-martin-4821"), "camille-martin");
        assert_eq!(racine("camille-martin"), "camille-martin");
        assert_eq!(racine("abcdefghijklmnopqrstu"), "abcdefghijklmnop");
        assert_eq!(racine("abcdefghijklmno-pq"), "abcdefghijklmno");
        assert_eq!(racine("1234"), "1234");
    }

    #[test]
    fn candidats_valides() {
        for pseudo in candidats("abcdefghijklmnop").unwrap() {
            assert!(pseudo_valide(&pseudo), "{pseudo}");
        }
        assert!(
            code_aleatoire()
                .unwrap()
                .bytes()
                .all(|o| o.is_ascii_digit())
        );
        assert_eq!(code_aleatoire().unwrap().len(), 6);
    }
}
