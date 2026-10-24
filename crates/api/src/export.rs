//! Export des données d'un joueur (RGPD art. 15 et 20), pour la procédure
//! manuelle de `docs/procedure-acces-donnees.md` : on retrouve le compte par
//! l'empreinte HMAC de l'adresse, jamais par l'adresse stockée.

use anyhow::{Context, bail};
use etymo_domaine::compte::normaliser_courriel;
use serde_json::Value;
use sqlx::PgPool;

use crate::courriel::Courriel;

/// Toutes les données du joueur en un objet JSON, une clé par table.
/// Exclus : l'empreinte du secret de chaque appareil (un identifiant de
/// connexion, pas une donnée du joueur) et les défis de connexion (purgés au bout d'un jour).
pub async fn exporter(base: &PgPool, courriel: &Courriel, adresse: &str) -> anyhow::Result<Value> {
    let Some(normalisee) = normaliser_courriel(adresse) else {
        bail!("adresse électronique invalide");
    };
    let empreinte = courriel.empreinte_adresse(&normalisee);
    let ligne = sqlx::query!(
        r#"SELECT jsonb_build_object(
            'joueur', to_jsonb(j),
            'compte', (SELECT to_jsonb(c) - 'joueur_id' FROM compte c WHERE c.joueur_id = j.id),
            'appareils', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'empreinte_secret' - 'joueur_id'), '[]') FROM appareil t WHERE t.joueur_id = j.id),
            'reglages', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM reglage t WHERE t.joueur_id = j.id),
            'commandes', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM commande t WHERE t.joueur_id = j.id),
            'exemplaires', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM exemplaire t WHERE t.joueur_id = j.id),
            'decouvertes', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM decouverte t WHERE t.joueur_id = j.id),
            'mouvements', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM mouvement t WHERE t.joueur_id = j.id),
            'graines_accordees', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM graine_accordee t WHERE t.joueur_id = j.id),
            'energie', (SELECT to_jsonb(t) - 'joueur_id' FROM energie t WHERE t.joueur_id = j.id),
            'encre', (SELECT to_jsonb(t) - 'joueur_id' FROM encre t WHERE t.joueur_id = j.id),
            'compteurs_pli', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM compteur_pli t WHERE t.joueur_id = j.id),
            'ouvertures_pli', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM ouverture_pli t WHERE t.joueur_id = j.id),
            'sablier', (SELECT to_jsonb(t) - 'joueur_id' FROM sablier t WHERE t.joueur_id = j.id),
            'indices', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM indice t WHERE t.joueur_id = j.id),
            'jalons_atteints', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM jalon_atteint t WHERE t.joueur_id = j.id),
            'ricochets', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM ricochet t WHERE t.joueur_id = j.id),
            'ricochets_du_jour', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM ricochet_jour t WHERE t.joueur_id = j.id),
            'paliers_recuperes', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM palier_recupere t WHERE t.joueur_id = j.id),
            'essais', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM essai t WHERE t.joueur_id = j.id),
            'quetes_du_jour', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM quete_jour t WHERE t.joueur_id = j.id),
            'tampons', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM tampon t WHERE t.joueur_id = j.id),
            'cartes_lecteur_recuperees', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM carte_lecteur_recuperee t WHERE t.joueur_id = j.id),
            'cadeau_recupere', (SELECT to_jsonb(t) - 'joueur_id' FROM cadeau_recupere t WHERE t.joueur_id = j.id),
            'quetes_initiales', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM quete_initiale t WHERE t.joueur_id = j.id),
            'fascicules_debloques', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'joueur_id'), '[]') FROM fascicule_debloque t WHERE t.joueur_id = j.id)
        ) AS "donnees!: Value"
        FROM compte c JOIN joueur j ON j.id = c.joueur_id WHERE c.empreinte_courriel = $1"#,
        &empreinte[..]
    )
    .fetch_optional(base)
    .await?
    .context("aucun compte pour cette adresse")?;
    Ok(ligne.donnees)
}
