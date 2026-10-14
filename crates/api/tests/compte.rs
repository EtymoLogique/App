//! Comptes facultatifs (ADR 0070) : demande, confirmation par code ou par
//! lien, appareils, pseudo, déconnexion, suppression et purges. Les e-mails
//! s'écrivent dans un dossier, d'où l'on relit le code et le lien.

mod commun;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use etymo_api::Limiteurs;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use commun::{Banc, appeler, banc, banc_courriel, get_etat, post, post_session, secret};

/// Ouvre la session d'une installation donnée.
async fn session_de(routeur: &Router, installation: Uuid, octet: u8) -> String {
    let demande = json!({ "installation": installation, "secret": secret(octet) });
    let (statut, _, corps) = appeler(routeur, post_session(&demande)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    corps["jeton"].as_str().unwrap().to_owned()
}

async fn demander(banc: &Banc, jeton: &str, courriel: &str) -> (StatusCode, Value) {
    let (statut, _, corps) = appeler(
        &banc.routeur,
        post(jeton, "/compte/demande", &json!({ "courriel": courriel })),
    )
    .await;
    (statut, corps)
}

async fn confirmer(banc: &Banc, jeton: &str, corps: &Value) -> (StatusCode, Value) {
    let (statut, _, corps) =
        appeler(&banc.routeur, post(jeton, "/compte/confirmation", corps)).await;
    (statut, corps)
}

/// Le code et le jeton du lien de l'e-mail envoyé pour ce défi.
fn courriel_du_defi(banc: &Banc, defi: &str) -> (String, String, String) {
    for entree in std::fs::read_dir(banc.dossier.path().join("courriels")).unwrap() {
        let texte = std::fs::read_to_string(entree.unwrap().path()).unwrap();
        let marque = format!("#/connexion?defi={defi}&jeton=");
        let Some(debut) = texte.find(&marque) else {
            continue;
        };
        let jeton: String = texte[debut + marque.len()..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        let ligne = texte.lines().find(|l| l.starts_with("Subject:")).unwrap();
        let code: String = ligne.chars().filter(char::is_ascii_digit).collect();
        return (code, jeton, texte);
    }
    panic!("aucun e-mail pour le défi {defi}");
}

/// Demande puis confirme par code : renvoie la réponse de confirmation.
async fn creer_compte(banc: &Banc, jeton: &str, courriel: &str) -> Value {
    let (statut, reponse) = demander(banc, jeton, courriel).await;
    assert_eq!(statut, StatusCode::ACCEPTED, "{reponse}");
    let defi = reponse["defi"].as_str().unwrap();
    let (code, _, _) = courriel_du_defi(banc, defi);
    let (statut, corps) = confirmer(banc, jeton, &json!({ "defi": defi, "code": code })).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    corps
}

async fn etat(banc: &Banc, jeton: &str) -> Value {
    let (statut, _, corps) = appeler(&banc.routeur, get_etat(jeton)).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    corps
}

/// Ajoute une découverte : la partie invitée a une progression.
async fn decouvrir(base: &PgPool, joueur: Uuid) {
    sqlx::query("INSERT INTO decouverte (joueur_id, mot_id, recette_id, numero) VALUES ($1, 'unt_00000000', 'rct_00000000', 1)")
        .bind(joueur)
        .execute(base)
        .await
        .unwrap();
}

async fn nombre(base: &PgPool, requete: &str, id: Uuid) -> i64 {
    sqlx::query_scalar(requete)
        .bind(id)
        .fetch_one(base)
        .await
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_reponse_ne_dit_pas_si_l_adresse_est_connue(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let premier = session_de(&banc.routeur, Uuid::new_v4(), 1).await;
    creer_compte(&banc, &premier, "camille.martin@exemple.fr").await;

    let second = session_de(&banc.routeur, Uuid::new_v4(), 2).await;
    let (connue, a) = demander(&banc, &second, "Camille.Martin@Exemple.fr ").await;
    let (inconnue, b) = demander(&banc, &second, "elodie@exemple.fr").await;
    assert_eq!(
        (connue, inconnue),
        (StatusCode::ACCEPTED, StatusCode::ACCEPTED)
    );
    let cles = |v: &Value| v.as_object().unwrap().keys().cloned().collect::<Vec<_>>();
    assert_eq!(cles(&a), cles(&b));
    assert_eq!(a["renvoyer_dans_s"], b["renvoyer_dans_s"]);

    // Seul un profil qui a déjà un compte et en demande un autre le sait : c'est le sien.
    let (statut, _) = demander(&banc, &premier, "autre@exemple.fr").await;
    assert_eq!(statut, StatusCode::CONFLICT);
    let (statut, _) = demander(&banc, &second, "pas une adresse").await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);

    // Aucune adresse en clair en base.
    for table in ["compte", "defi_connexion"] {
        let lignes: Vec<String> =
            sqlx::query_scalar(&format!("SELECT row_to_json(t)::text FROM {table} t"))
                .fetch_all(&base)
                .await
                .unwrap();
        assert!(!lignes.is_empty());
        for ligne in lignes {
            assert!(!ligne.contains("exemple"), "{table} : {ligne}");
        }
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_invite_cree_son_compte_par_code(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let installation = Uuid::new_v4();
    let jeton = session_de(&banc.routeur, installation, 1).await;
    assert!(etat(&banc, &jeton).await.get("compte").is_none());
    decouvrir(&base, installation).await;

    let (statut, reponse) = demander(&banc, &jeton, "Camille.Martin+jeu@exemple.fr").await;
    assert_eq!(statut, StatusCode::ACCEPTED);
    let defi = reponse["defi"].as_str().unwrap();
    let (code, lien, texte) = courriel_du_defi(&banc, defi);
    assert_eq!(code.len(), 6);
    assert_eq!(lien.len(), 43);
    assert!(texte.starts_with("To: camille.martin+jeu@exemple.fr\r\n"));
    assert!(texte.contains("valables 15 minutes et ne servent qu’une fois"));

    let (statut, corps) = confirmer(&banc, &jeton, &json!({ "defi": defi, "code": code })).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    assert_eq!(corps["issue"], "compte_cree");
    assert_eq!(corps["pseudo_confirme"], false);
    let pseudo = corps["pseudo"].as_str().unwrap();
    assert!(
        pseudo.starts_with("camille-martin-") && pseudo.len() == 19,
        "{pseudo}"
    );

    // La progression reste : même joueur, même jeton.
    let apres = etat(&banc, &jeton).await;
    assert_eq!(
        apres["compte"],
        json!({ "pseudo": pseudo, "pseudo_confirme": false })
    );
    assert_eq!(apres["decouvertes"].as_array().unwrap().len(), 1);

    // Usage unique : un rejeu reçoit 410, par code comme par lien.
    let (statut, corps) = confirmer(&banc, &jeton, &json!({ "defi": defi, "code": code })).await;
    assert_eq!(statut, StatusCode::GONE);
    assert_eq!(corps["code"], "expire");
    let (statut, _) = confirmer(&banc, &jeton, &json!({ "defi": defi, "jeton": lien })).await;
    assert_eq!(statut, StatusCode::GONE);
    let (statut, _) = confirmer(
        &banc,
        &jeton,
        &json!({ "defi": defi, "code": code, "jeton": lien }),
    )
    .await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_seconde_installation_retrouve_la_partie_par_le_lien(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let premiere = Uuid::new_v4();
    let jeton = session_de(&banc.routeur, premiere, 1).await;
    decouvrir(&base, premiere).await;
    let cree = creer_compte(&banc, &jeton, "camille@exemple.fr").await;

    let seconde = Uuid::new_v4();
    let jeton2 = session_de(&banc.routeur, seconde, 2).await;
    let (_, reponse) = demander(&banc, &jeton2, "camille@exemple.fr").await;
    let defi = reponse["defi"].as_str().unwrap();
    let (_, lien, _) = courriel_du_defi(&banc, defi);
    let (statut, corps) = confirmer(&banc, &jeton2, &json!({ "defi": defi, "jeton": lien })).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    assert_eq!(corps["issue"], "connecte");
    assert_eq!(corps["pseudo"], cree["pseudo"]);

    // L'ancien jeton désigne la partie invitée effacée ; la session rouverte, celle du compte.
    let (statut, _, _) = appeler(&banc.routeur, get_etat(&jeton2)).await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);
    let jeton2 = session_de(&banc.routeur, seconde, 2).await;
    let partagee = etat(&banc, &jeton2).await;
    assert_eq!(partagee["compte"]["pseudo"], cree["pseudo"]);
    assert_eq!(
        partagee["decouvertes"],
        etat(&banc, &jeton).await["decouvertes"]
    );
    assert_eq!(
        nombre(
            &base,
            "SELECT count(*) FROM appareil WHERE joueur_id = $1",
            premiere
        )
        .await,
        2
    );
    assert_eq!(
        nombre(&base, "SELECT count(*) FROM joueur WHERE id = $1", seconde).await,
        0
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn une_partie_invitee_n_est_remplacee_qu_apres_avertissement(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let jeton = session_de(&banc.routeur, Uuid::new_v4(), 1).await;
    creer_compte(&banc, &jeton, "camille@exemple.fr").await;

    let invite = Uuid::new_v4();
    let jeton2 = session_de(&banc.routeur, invite, 2).await;
    decouvrir(&base, invite).await;
    let (_, reponse) = demander(&banc, &jeton2, "camille@exemple.fr").await;
    let defi = reponse["defi"].as_str().unwrap();
    let (code, _, _) = courriel_du_defi(&banc, defi);

    let (statut, corps) = confirmer(&banc, &jeton2, &json!({ "defi": defi, "code": code })).await;
    assert_eq!(statut, StatusCode::CONFLICT, "{corps}");
    assert_eq!(
        corps["avertissement"],
        json!({ "decouvertes": 1, "gouttes": 0 })
    );
    // Rien n'est consommé : ni le défi, ni un essai.
    let tentatives: i16 =
        sqlx::query_scalar("SELECT tentatives FROM defi_connexion WHERE utilise_le IS NULL")
            .fetch_one(&base)
            .await
            .unwrap();
    assert_eq!(tentatives, 0);

    let (statut, corps) = confirmer(
        &banc,
        &jeton2,
        &json!({ "defi": defi, "code": code, "remplacer_invite": true }),
    )
    .await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    assert_eq!(
        nombre(&base, "SELECT count(*) FROM joueur WHERE id = $1", invite).await,
        0
    );
    assert_eq!(
        nombre(
            &base,
            "SELECT count(*) FROM decouverte WHERE joueur_id = $1",
            invite
        )
        .await,
        0
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn cinq_codes_faux_epuisent_le_defi(base: PgPool) {
    let banc = banc_courriel(base).await;
    let jeton = session_de(&banc.routeur, Uuid::new_v4(), 1).await;
    let (_, reponse) = demander(&banc, &jeton, "camille@exemple.fr").await;
    let defi = reponse["defi"].as_str().unwrap();
    let (code, _, _) = courriel_du_defi(&banc, defi);
    let faux = if code == "000000" { "111111" } else { "000000" };
    for restants in (1..=4).rev() {
        let (statut, corps) =
            confirmer(&banc, &jeton, &json!({ "defi": defi, "code": faux })).await;
        assert_eq!(statut, StatusCode::BAD_REQUEST, "{corps}");
        assert_eq!(corps["essais_restants"], restants);
    }
    let (statut, _) = confirmer(&banc, &jeton, &json!({ "defi": defi, "code": faux })).await;
    assert_eq!(statut, StatusCode::GONE);
    let (statut, _) = confirmer(&banc, &jeton, &json!({ "defi": defi, "code": code })).await;
    assert_eq!(statut, StatusCode::GONE);
}

#[sqlx::test(migrations = "../../migrations")]
async fn un_defi_expire_ou_remplace_ne_vaut_plus(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let jeton = session_de(&banc.routeur, Uuid::new_v4(), 1).await;
    let (_, reponse) = demander(&banc, &jeton, "camille@exemple.fr").await;
    let ancien = reponse["defi"].as_str().unwrap().to_owned();
    let (ancien_code, _, _) = courriel_du_defi(&banc, &ancien);

    // Un nouveau code annule le précédent.
    let (_, reponse) = demander(&banc, &jeton, "camille@exemple.fr").await;
    let defi = reponse["defi"].as_str().unwrap();
    let (statut, _) = confirmer(
        &banc,
        &jeton,
        &json!({ "defi": ancien, "code": ancien_code }),
    )
    .await;
    assert_eq!(statut, StatusCode::GONE);

    sqlx::query("UPDATE defi_connexion SET expire_le = now() - interval '1 second'")
        .execute(&base)
        .await
        .unwrap();
    let (code, _, _) = courriel_du_defi(&banc, defi);
    let (statut, _) = confirmer(&banc, &jeton, &json!({ "defi": defi, "code": code })).await;
    assert_eq!(statut, StatusCode::GONE);

    // Trois e-mails toutes les 15 minutes par adresse.
    demander(&banc, &jeton, "camille@exemple.fr").await;
    let (statut, _) = demander(&banc, &jeton, "camille@exemple.fr").await;
    assert_eq!(statut, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test(migrations = "../../migrations")]
async fn le_pseudo_se_confirme_ou_se_change(base: PgPool) {
    let banc = banc_courriel(base).await;
    let jeton = session_de(&banc.routeur, Uuid::new_v4(), 1).await;
    let premier = creer_compte(&banc, &jeton, "camille@exemple.fr").await;
    let jeton2 = session_de(&banc.routeur, Uuid::new_v4(), 2).await;
    creer_compte(&banc, &jeton2, "elodie@exemple.fr").await;

    let pseudo = |p: &str| {
        Request::put("/compte/pseudo")
            .header(header::AUTHORIZATION, format!("Bearer {jeton2}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(json!({ "pseudo": p }).to_string()))
            .unwrap()
    };
    let (statut, _, corps) =
        appeler(&banc.routeur, pseudo(premier["pseudo"].as_str().unwrap())).await;
    assert_eq!(statut, StatusCode::CONFLICT, "{corps}");
    let proposition = corps["proposition"].as_str().unwrap();
    assert!(proposition.starts_with("camille-") && proposition != premier["pseudo"]);

    let (statut, _, _) = appeler(&banc.routeur, pseudo("Élodie")).await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);
    let (statut, _, corps) = appeler(&banc.routeur, pseudo("elodie-lit")).await;
    assert_eq!(statut, StatusCode::OK, "{corps}");
    assert_eq!(
        etat(&banc, &jeton2).await["compte"],
        json!({ "pseudo": "elodie-lit", "pseudo_confirme": true })
    );

    // Une partie invitée n'a pas de pseudo.
    let invite = session_de(&banc.routeur, Uuid::new_v4(), 3).await;
    let requete = Request::put("/compte/pseudo")
        .header(header::AUTHORIZATION, format!("Bearer {invite}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "pseudo": "invite" }).to_string()))
        .unwrap();
    let (statut, _, _) = appeler(&banc.routeur, requete).await;
    assert_eq!(statut, StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_deconnexion_detache_l_appareil(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let premiere = Uuid::new_v4();
    let jeton = session_de(&banc.routeur, premiere, 1).await;
    creer_compte(&banc, &jeton, "camille@exemple.fr").await;

    // L'appareil d'origine se déconnecte : la partie reste sur le compte.
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(&jeton, "/compte/deconnexion", &json!({})),
    )
    .await;
    assert_eq!(statut, StatusCode::NO_CONTENT);
    assert_eq!(
        nombre(
            &base,
            "SELECT count(*) FROM compte WHERE joueur_id = $1",
            premiere
        )
        .await,
        1
    );
    assert_eq!(
        nombre(
            &base,
            "SELECT count(*) FROM appareil WHERE joueur_id = $1",
            premiere
        )
        .await,
        0
    );

    // La même installation repart d'une partie invitée neuve, sans toucher au compte.
    let demande = json!({ "installation": premiere, "secret": secret(1) });
    let (statut, _, corps) = appeler(&banc.routeur, post_session(&demande)).await;
    assert_eq!(statut, StatusCode::OK);
    assert_eq!(corps["nouveau"], true);
    let neuf = corps["jeton"].as_str().unwrap();
    assert!(etat(&banc, neuf).await.get("compte").is_none());

    // Un invité qui se déconnecte efface sa partie.
    let invite = Uuid::new_v4();
    let jeton_invite = session_de(&banc.routeur, invite, 2).await;
    let (statut, _, _) = appeler(
        &banc.routeur,
        post(&jeton_invite, "/compte/deconnexion", &json!({})),
    )
    .await;
    assert_eq!(statut, StatusCode::NO_CONTENT);
    assert_eq!(
        nombre(&base, "SELECT count(*) FROM joueur WHERE id = $1", invite).await,
        0
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_suppression_efface_tout(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let premiere = Uuid::new_v4();
    let jeton = session_de(&banc.routeur, premiere, 1).await;
    decouvrir(&base, premiere).await;
    creer_compte(&banc, &jeton, "camille@exemple.fr").await;

    let supprimer = |confirmation: &str| {
        Request::delete("/compte")
            .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                json!({ "confirmation": confirmation }).to_string(),
            ))
            .unwrap()
    };
    let (statut, _, _) = appeler(&banc.routeur, supprimer("supprimer")).await;
    assert_eq!(statut, StatusCode::BAD_REQUEST);
    let (statut, _, _) = appeler(&banc.routeur, supprimer("SUPPRIMER")).await;
    assert_eq!(statut, StatusCode::NO_CONTENT);
    for table in [
        "joueur WHERE id",
        "compte WHERE joueur_id",
        "appareil WHERE joueur_id",
        "decouverte WHERE joueur_id",
    ] {
        let requete = format!("SELECT count(*) FROM {table} = $1");
        assert_eq!(nombre(&base, &requete, premiere).await, 0, "{table}");
    }
    let (statut, _, _) = appeler(&banc.routeur, get_etat(&jeton)).await;
    assert_eq!(statut, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "../../migrations")]
async fn la_purge_efface_les_invites_inactifs_jamais_les_comptes(base: PgPool) {
    let banc = banc_courriel(base.clone()).await;
    let (invite, titulaire) = (Uuid::new_v4(), Uuid::new_v4());
    session_de(&banc.routeur, invite, 1).await;
    let jeton = session_de(&banc.routeur, titulaire, 2).await;
    creer_compte(&banc, &jeton, "camille@exemple.fr").await;
    demander(&banc, &jeton, "camille@exemple.fr").await;
    sqlx::query("UPDATE joueur SET derniere_activite = now() - interval '7 months'")
        .execute(&base)
        .await
        .unwrap();
    sqlx::query("UPDATE defi_connexion SET cree_le = now() - interval '2 days'")
        .execute(&base)
        .await
        .unwrap();

    let rapport = etymo_taches::purger(&base).await.unwrap();
    assert_eq!(rapport.invites_inactifs, 1);
    assert_eq!(rapport.defis_connexion, 2);
    assert_eq!(
        nombre(&base, "SELECT count(*) FROM joueur WHERE id = $1", invite).await,
        0
    );
    assert_eq!(
        nombre(
            &base,
            "SELECT count(*) FROM joueur WHERE id = $1",
            titulaire
        )
        .await,
        1
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn sans_envoi_les_comptes_repondent_503(base: PgPool) {
    let banc = banc(base, Limiteurs::default()).await;
    let jeton = session_de(&banc.routeur, Uuid::new_v4(), 1).await;
    let (statut, corps) = demander(&banc, &jeton, "camille@exemple.fr").await;
    assert_eq!(statut, StatusCode::SERVICE_UNAVAILABLE);
    assert!(
        corps["message"]
            .as_str()
            .unwrap()
            .starts_with("Impossible d’envoyer l’e-mail")
    );
    let (statut, _) = confirmer(
        &banc,
        &jeton,
        &json!({ "defi": Uuid::new_v4(), "code": "123456" }),
    )
    .await;
    assert_eq!(statut, StatusCode::SERVICE_UNAVAILABLE);
    etat(&banc, &jeton).await;

    // Corps borné à 1 Kio.
    let (statut, _) = demander(&banc, &jeton, &"a".repeat(2000)).await;
    assert_eq!(statut, StatusCode::PAYLOAD_TOO_LARGE);
}
