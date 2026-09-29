use crate::essai;
use crate::*;

#[tokio::test]
async fn aucun_index_publie() {
    let dossier = tempfile::tempdir().unwrap();
    let lecteur = LecteurDossier::nouveau(dossier.path());
    assert!(charger(&lecteur).await.unwrap().is_none());
}

#[tokio::test]
async fn charge_l_index_et_ses_manifestes() {
    let dossier = tempfile::tempdir().unwrap();
    let manifeste = essai::fascicule(dossier.path(), 0, "2026-10-01T08:00:00+02:00");
    essai::calendrier(
        dossier.path(),
        INDEX,
        "v1",
        &[(0, "2026-10-01T08:00:00+02:00", &manifeste)],
    );

    let catalogue = charger(&LecteurDossier::nouveau(dossier.path()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(catalogue.version(), "v1");
    assert_eq!(catalogue.fascicules.len(), 1);
    let charge = &catalogue.fascicules[0].manifeste;
    assert_eq!(charge.numero, 0);
    // jaquette, carte, recette, exclusions
    assert_eq!(charge.ressources().len(), 4);
    assert_eq!(charge.graines.len(), 2);

    let jeu = &catalogue.jeu;
    assert_eq!(jeu.recettes.len(), 1);
    // Emplacements remis dans l'ordre de leur rang.
    let attendus: Vec<Vec<etymo_domaine::IdCatalogue>> = vec![
        vec![essai::GEO.parse().unwrap()],
        vec![essai::LOGIE.parse().unwrap()],
    ];
    assert_eq!(jeu.recettes[0].emplacements, attendus);
    assert_eq!(jeu.exclusions.len(), 1);
    assert!(jeu.briques.contains(&essai::GEO.parse().unwrap()));
    assert_eq!(jeu.graines[0].0.as_str(), "fsc_00000000");
    assert_eq!(
        jeu.briques_de_mot.get(&essai::MOT.parse().unwrap()),
        Some(&essai::BIO.parse().unwrap())
    );
}

#[tokio::test]
async fn refuse_un_manifeste_altere() {
    let dossier = tempfile::tempdir().unwrap();
    let manifeste = essai::fascicule(dossier.path(), 0, "2026-10-01T08:00:00+02:00");
    essai::calendrier(
        dossier.path(),
        INDEX,
        "v1",
        &[(0, "2026-10-01T08:00:00+02:00", &manifeste)],
    );
    std::fs::write(dossier.path().join(&manifeste), b"{\"format\":1}").unwrap();

    let erreur = charger(&LecteurDossier::nouveau(dossier.path()))
        .await
        .unwrap_err();
    assert!(matches!(erreur, ErreurCatalogue::Empreinte(_)), "{erreur}");
}

#[tokio::test]
async fn refuse_un_format_inconnu() {
    let dossier = tempfile::tempdir().unwrap();
    std::fs::write(
        dossier.path().join(INDEX),
        br#"{"format":2,"version":"v","referentiels":{},"fascicules":[]}"#,
    )
    .unwrap();
    let erreur = charger(&LecteurDossier::nouveau(dossier.path()))
        .await
        .unwrap_err();
    assert!(matches!(erreur, ErreurCatalogue::Format(2)));
}

#[tokio::test]
async fn le_lecteur_de_dossier_refuse_de_remonter() {
    let dossier = tempfile::tempdir().unwrap();
    let lecteur = LecteurDossier::nouveau(dossier.path());
    assert!(lecteur.lire("../secret").await.is_err());
    assert!(lecteur.lire("/etc/passwd").await.is_err());
}

/// Lit toutes les ressources d'un vrai artefact compilé par le dépôt Content,
/// si `ETYMO_ARTEFACT` désigne son dossier (par exemple `.local/bucket/staging`).
#[tokio::test]
async fn lit_un_artefact_reel_si_disponible() {
    let Ok(dossier) = std::env::var("ETYMO_ARTEFACT") else {
        return;
    };
    let lecteur = LecteurDossier::nouveau(&dossier);
    let calendrier = lire_calendrier(&lecteur, CALENDRIER)
        .await
        .unwrap()
        .unwrap();
    for entree in &calendrier.fascicules {
        let manifeste = lire_manifeste(&lecteur, &entree.manifeste).await.unwrap();
        for carte in &manifeste.cartes {
            let lue: Carte = lire_json(&lecteur, &carte.carte).await.unwrap();
            assert_eq!(lue.id, carte.id);
        }
        for recette in &manifeste.recettes {
            lire_json::<Recette>(&lecteur, &recette.chemin)
                .await
                .unwrap();
        }
    }
}
