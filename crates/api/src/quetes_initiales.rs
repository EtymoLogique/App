//! Quêtes initiales de la première semaine (ADR 0046) : faites une seule fois,
//! généreuses au début. Mêmes règles que les quêtes du jour : un acte de
//! réflexion, jamais un simple geste. Elles ne comptent pas pour le tampon.
//!
//! La liste fermée des quatre quêtes est écrite ici (écart noté dans la
//! roadmap : l'ADR 0046 les veut dans l'équilibrage du catalogue).

use chrono::{DateTime, TimeDelta, Utc};
use etymo_catalogue::Jeu;
use etymo_contrat::{CodeQueteInitiale as Code, QueteInitialeEtat, RecompenseInitiale};
use etymo_domaine::quete::{Codex, Sorte, TYPES_TRANSFORMATION};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::carte_lecteur;
use crate::erreur::ErreurApi;
use crate::progression;

/// Durée de la première semaine du profil.
const SEMAINE: TimeDelta = TimeDelta::days(7);

const CODES: [Code; 4] = [
    Code::TroisMots,
    Code::Transformation,
    Code::PremiersRicochets,
    Code::PremiereCarte,
];

const fn texte(code: Code) -> &'static str {
    match code {
        Code::TroisMots => "trois_mots",
        Code::Transformation => "transformation",
        Code::PremiersRicochets => "premiers_ricochets",
        Code::PremiereCarte => "premiere_carte",
    }
}

fn depuis(t: &str) -> Option<Code> {
    CODES.into_iter().find(|c| texte(*c) == t)
}

const fn cible(code: Code) -> u8 {
    match code {
        Code::TroisMots => 3,
        _ => 1,
    }
}

/// Récompenses de départ de l'ADR 0046, à simuler.
#[must_use]
pub const fn recompense(code: Code) -> RecompenseInitiale {
    let (plis_offerts, plis_de_lecteur, sabliers, gouttes) = match code {
        Code::TroisMots => (2, 0, 0, 0),
        Code::Transformation => (1, 0, 0, 10),
        Code::PremiersRicochets => (0, 0, 3, 0),
        Code::PremiereCarte => (0, 1, 0, 0),
    };
    RecompenseInitiale {
        plis_offerts,
        plis_de_lecteur,
        sabliers,
        gouttes,
    }
}

/// Ce que le joueur a déjà fait pour chaque quête, plafonné à la cible.
async fn progres(
    tx: &mut PgConnection,
    joueur: Uuid,
    jeu: &Jeu,
) -> Result<Vec<(Code, u8)>, ErreurApi> {
    let mots = progression::mots_decouverts(&mut *tx, joueur).await?;
    let briques = progression::briques_connues(&mut *tx, joueur).await?;
    let codex = Codex {
        mots: &mots,
        briques: &briques,
    };
    let transformations: u32 = TYPES_TRANSFORMATION
        .iter()
        .map(|t| {
            jeu.mesures.progression(
                &Sorte::Transformation {
                    type_code: (*t).to_owned(),
                },
                &codex,
            )
        })
        .sum();
    let ricochets = sqlx::query_scalar!(
        "SELECT true FROM ricochet_jour WHERE joueur_id = $1 AND reponses = 5 AND bonnes = 5 LIMIT 1",
        joueur
    )
    .fetch_optional(&mut *tx)
    .await?
    .is_some();
    let cartes = carte_lecteur::remplies(&mut *tx, joueur).await?;
    let plafonne = |n: usize, code: Code| u8::try_from(n).unwrap_or(u8::MAX).min(cible(code));
    Ok(vec![
        (Code::TroisMots, plafonne(mots.len(), Code::TroisMots)),
        (
            Code::Transformation,
            plafonne(transformations as usize, Code::Transformation),
        ),
        (
            Code::PremiersRicochets,
            plafonne(usize::from(ricochets), Code::PremiersRicochets),
        ),
        (
            Code::PremiereCarte,
            plafonne(cartes as usize, Code::PremiereCarte),
        ),
    ])
}

/// Quêtes initiales du joueur : une quête faite pendant la première semaine
/// est enregistrée pour de bon (la récompense attend, rien n'expire) ; passé
/// la semaine, seules les quêtes déjà faites et pas encore récupérées restent.
pub async fn etat(
    tx: &mut PgConnection,
    joueur: Uuid,
    jeu: Option<&Jeu>,
    maintenant: DateTime<Utc>,
) -> Result<Vec<QueteInitialeEtat>, ErreurApi> {
    let Some(jeu) = jeu else {
        return Ok(Vec::new());
    };
    let cree_le = sqlx::query_scalar!("SELECT cree_le FROM joueur WHERE id = $1", joueur)
        .fetch_one(&mut *tx)
        .await?;
    let semaine = maintenant < cree_le + SEMAINE;
    let progres = progres(&mut *tx, joueur, jeu).await?;
    if semaine {
        for (code, fait) in &progres {
            if *fait >= cible(*code) {
                sqlx::query!(
                    "INSERT INTO quete_initiale (joueur_id, code, faite_le) VALUES ($1, $2, $3)
                     ON CONFLICT DO NOTHING",
                    joueur,
                    texte(*code),
                    maintenant
                )
                .execute(&mut *tx)
                .await?;
            }
        }
    }
    let lignes = sqlx::query!(
        "SELECT code, recupere_le FROM quete_initiale WHERE joueur_id = $1",
        joueur
    )
    .fetch_all(&mut *tx)
    .await?;
    Ok(progres
        .into_iter()
        .filter_map(|(code, fait)| {
            let ligne = lignes.iter().find(|l| depuis(&l.code) == Some(code));
            (semaine || ligne.is_some()).then(|| QueteInitialeEtat {
                code,
                cible: cible(code),
                progres: if ligne.is_some() { cible(code) } else { fait },
                faite: ligne.is_some(),
                recuperee: ligne.is_some_and(|l| l.recupere_le.is_some()),
                recompense: recompense(code),
            })
        })
        .collect())
}

/// Marque la récompense comme prise. `403` : quête pas faite pendant la
/// première semaine ; `409` : déjà récupérée.
pub async fn reclamer(
    tx: &mut PgConnection,
    joueur: Uuid,
    code: Code,
    maintenant: DateTime<Utc>,
) -> Result<(), ErreurApi> {
    let prise = sqlx::query_scalar!(
        "UPDATE quete_initiale SET recupere_le = $3
         WHERE joueur_id = $1 AND code = $2 AND recupere_le IS NULL RETURNING true",
        joueur,
        texte(code),
        maintenant
    )
    .fetch_optional(&mut *tx)
    .await?;
    if prise.is_some() {
        return Ok(());
    }
    let existe = sqlx::query_scalar!(
        "SELECT true FROM quete_initiale WHERE joueur_id = $1 AND code = $2",
        joueur,
        texte(code)
    )
    .fetch_optional(tx)
    .await?
    .is_some();
    Err(if existe {
        ErreurApi::Conflit("quête initiale déjà récupérée")
    } else {
        ErreurApi::Interdit("quête initiale pas faite")
    })
}
