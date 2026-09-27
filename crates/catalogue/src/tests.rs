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
    // jaquette, carte, recette
    assert_eq!(charge.ressources().len(), 3);
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
