//! Cohortes de rétention (ADR 0050) : agrégats sans donnée personnelle,
//! groupes de moins de 50 joueurs masqués, mois d'activité précédent.

mod commun;

use chrono::NaiveDate;
use etymo_api::Limiteurs;
use etymo_taches::cohortes::{agreger_jour, agreger_mois, statistiques};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use commun::{appeler, banc, post_session, secret};

fn jour(texte: &str) -> NaiveDate {
    texte.parse().unwrap()
}

/// `n` profils créés le `cree`, dont `actifs` dont la dernière activité date du `derniere`
/// (les autres, du jour de leur création) ; `precedent` : leur mois d'activité d'avant.
async fn profils(
    base: &PgPool,
    n: i32,
    cree: &str,
    actifs: i32,
    derniere: &str,
    precedent: Option<&str>,
) {
    sqlx::query(
        "INSERT INTO joueur (id, cree_le, derniere_activite, mois_activite_precedente)
         SELECT gen_random_uuid(), $1::date::timestamptz,
                CASE WHEN g <= $3 THEN $4::date::timestamptz + interval '10 hours' ELSE $1::date::timestamptz END,
                CASE WHEN g <= $3 THEN $5::date END
         FROM generate_series(1, $2) AS g",
    )
    .bind(cree)
    .bind(n)
    .bind(actifs)
    .bind(derniere)
    .bind(precedent)
    .execute(base)
    .await
    .unwrap();
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_retention_mensuelle_et_le_passage_d_un_mois_a_l_autre(base: PgPool) {
    // Cohorte de septembre : 60 joueurs, 30 actifs en octobre dont 20 déjà actifs en septembre.
    profils(
        &base,
        60,
        "2026-09-10",
        30,
        "2026-10-05",
        Some("2026-09-01"),
    )
    .await;
    sqlx::query("UPDATE joueur SET mois_activite_precedente = NULL WHERE id IN (SELECT id FROM joueur WHERE mois_activite_precedente IS NOT NULL OFFSET 20)")
        .execute(&base)
        .await
        .unwrap();
    // Cohorte d'août : trop petite pour sortir.
    profils(&base, 10, "2026-08-02", 4, "2026-10-07", None).await;

    agreger_mois(&base, jour("2026-10-01")).await.unwrap();
    // Idempotente : la relancer ne double rien.
    agreger_mois(&base, jour("2026-10-15")).await.unwrap();
    let s = statistiques(&base).await.unwrap();

    let sept = s
        .retention
        .iter()
        .find(|r| r.mois_arrivee == jour("2026-09-01"))
        .unwrap();
    assert_eq!((sept.cohorte, sept.actifs), (Some(60), Some(30)));
    let aout = s
        .retention
        .iter()
        .find(|r| r.mois_arrivee == jour("2026-08-01"))
        .unwrap();
    assert_eq!(
        (aout.cohorte, aout.actifs),
        (None, None),
        "moins de 50 : masqué"
    );
    assert_eq!(s.passages.len(), 1);
    // Actifs en octobre : 30 + 4 = 34 < 50, donc masqués ; le passage ne sort pas non plus.
    assert_eq!(s.passages[0].actifs, None);
    assert_eq!(s.passages[0].venus_du_mois_precedent, None);
    let brut: (i32, i32) =
        sqlx::query_as("SELECT actifs, venus_du_mois_precedent FROM passage_mois")
            .fetch_one(&base)
            .await
            .unwrap();
    assert_eq!(brut, (34, 20));
}

#[sqlx::test(migrations = "../../migrations")]
async fn les_retours_et_indicateurs_du_jour(base: PgPool) {
    // 55 profils créés le 5 octobre, 40 revenus le 6.
    profils(&base, 55, "2026-10-05", 40, "2026-10-06", None).await;
    agreger_jour(&base, jour("2026-10-06")).await.unwrap();
    let s = statistiques(&base).await.unwrap();
    let un_jour = s.retours.iter().find(|r| r.delai == 1).unwrap();
    assert_eq!((un_jour.cohorte, un_jour.revenus), (Some(55), Some(40)));
    let sept_jours = s.retours.iter().find(|r| r.delai == 7).unwrap();
    assert_eq!((sept_jours.cohorte, sept_jours.revenus), (None, None));
    // 40 actifs ce jour-là : sous le seuil, aucun indicateur ne sort.
    assert_eq!(s.indicateurs[0].joueurs_actifs, None);
    let brut: (i32,) = sqlx::query_as("SELECT joueurs_actifs FROM indicateurs_jour")
        .fetch_one(&base)
        .await
        .unwrap();
    assert_eq!(brut.0, 40);
    // Aucun identifiant de joueur dans les agrégats.
    let colonnes: Vec<String> = sqlx::query_scalar(
        "SELECT column_name FROM information_schema.columns
         WHERE table_name IN ('indicateurs_jour', 'retour_jour', 'retention_mois', 'passage_mois')",
    )
    .fetch_all(&base)
    .await
    .unwrap();
    assert!(
        colonnes
            .iter()
            .all(|c| !c.contains("joueur_id") && c != "id")
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn le_mois_d_activite_precedent_suit_le_changement_de_mois(base: PgPool) {
    let banc = banc(base.clone(), Limiteurs::default()).await;
    let installation = Uuid::new_v4();
    let demande = json!({ "installation": installation, "secret": secret(1) });
    appeler(&banc.routeur, post_session(&demande)).await;
    let precedent = || async {
        sqlx::query_scalar::<_, Option<NaiveDate>>(
            "SELECT mois_activite_precedente FROM joueur WHERE id = $1",
        )
        .bind(installation)
        .fetch_one(&base)
        .await
        .unwrap()
    };
    assert_eq!(precedent().await, None);
    // Même mois : rien ne change.
    appeler(&banc.routeur, post_session(&demande)).await;
    assert_eq!(precedent().await, None);
    // La dernière activité date de septembre 2020 : le mois d'activité d'avant devient septembre 2020.
    sqlx::query("UPDATE joueur SET derniere_activite = '2020-09-15T10:00:00Z' WHERE id = $1")
        .bind(installation)
        .execute(&base)
        .await
        .unwrap();
    appeler(&banc.routeur, post_session(&demande)).await;
    assert_eq!(precedent().await, Some(jour("2020-09-01")));
}
