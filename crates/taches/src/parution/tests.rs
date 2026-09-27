use std::path::Path as CheminLocal;

use chrono::TimeZone;
use etymo_catalogue::essai;
use object_store::memory::InMemory;

use super::*;

const PASSE: &str = "2026-10-01T08:00:00+02:00";
const FUTUR: &str = "2026-11-01T08:00:00+01:00";

fn maintenant() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 15, 0, 0, 0).unwrap()
}

/// Dépose sous `staging/` tout ce qu'un dossier d'artefact contient.
async fn deposer_staging(bucket: &InMemory, racine: &CheminLocal) {
    for dossier in ["a", "f", "r"] {
        let Ok(entrees) = std::fs::read_dir(racine.join(dossier)) else {
            continue;
        };
        for entree in entrees {
            let entree = entree.unwrap();
            let nom = format!(
                "{STAGING}/{dossier}/{}",
                entree.file_name().to_string_lossy()
            );
            bucket
                .put(
                    &Path::from(nom),
                    PutPayload::from(std::fs::read(entree.path()).unwrap()),
                )
                .await
                .unwrap();
        }
    }
    let calendrier = std::fs::read(racine.join(CALENDRIER)).unwrap();
    bucket
        .put(
            &Path::from(format!("{STAGING}/{CALENDRIER}")),
            PutPayload::from(calendrier),
        )
        .await
        .unwrap();
}

async fn existe(bucket: &InMemory, chemin: &str) -> bool {
    bucket.head(&Path::from(chemin)).await.is_ok()
}

async fn index(bucket: &InMemory) -> Calendrier {
    let octets = bucket
        .get(&Path::from("public/index.json"))
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();
    serde_json::from_slice(&octets).unwrap()
}

#[tokio::test]
async fn sans_calendrier_rien_ne_parait() {
    let bucket = InMemory::new();
    let rapport = publier_fascicules(&bucket, Cible::Bucket, maintenant())
        .await
        .unwrap();
    assert_eq!(rapport, RapportParution::default());
    assert!(!existe(&bucket, "public/index.json").await);
}

#[tokio::test]
async fn promeut_les_fascicules_dus_et_seulement_eux() {
    let dossier = tempfile::tempdir().unwrap();
    let paru = essai::fascicule(dossier.path(), 0, PASSE);
    let a_venir = essai::fascicule(dossier.path(), 1, FUTUR);
    essai::calendrier(
        dossier.path(),
        CALENDRIER,
        "v1",
        &[(0, PASSE, &paru), (1, FUTUR, &a_venir)],
    );
    let bucket = InMemory::new();
    deposer_staging(&bucket, dossier.path()).await;

    let rapport = publier_fascicules(&bucket, Cible::Bucket, maintenant())
        .await
        .unwrap();
    assert_eq!(rapport.parus, vec![0]);
    assert_eq!(rapport.a_venir, 1);
    assert!(rapport.index_ecrit);

    assert!(existe(&bucket, &format!("public/{paru}")).await);
    assert!(
        !existe(&bucket, &format!("public/{a_venir}")).await,
        "un fascicule à venir ne se lit pas"
    );
    let index = index(&bucket).await;
    assert_eq!(index.version, "v1");
    assert_eq!(index.fascicules.len(), 1);
    assert_eq!(index.fascicules[0].manifeste.as_str(), paru);

    // Chaque ressource du fascicule paru est promue, avec son type exact.
    let octets = std::fs::read(dossier.path().join(&paru)).unwrap();
    let manifeste: Manifeste = serde_json::from_slice(&octets).unwrap();
    for chemin in manifeste.ressources() {
        let meta = bucket
            .get(&Path::from(format!("public/{chemin}")))
            .await
            .unwrap();
        assert_eq!(
            meta.attributes
                .get(&Attribute::ContentType)
                .map(AsRef::as_ref),
            Some(chemin.type_contenu())
        );
        assert_eq!(
            meta.attributes
                .get(&Attribute::CacheControl)
                .map(AsRef::as_ref),
            Some(IMMUABLE)
        );
    }
}

#[tokio::test]
async fn est_idempotente() {
    let dossier = tempfile::tempdir().unwrap();
    let paru = essai::fascicule(dossier.path(), 0, PASSE);
    essai::calendrier(dossier.path(), CALENDRIER, "v1", &[(0, PASSE, &paru)]);
    let bucket = InMemory::new();
    deposer_staging(&bucket, dossier.path()).await;

    let premier = publier_fascicules(&bucket, Cible::Bucket, maintenant())
        .await
        .unwrap();
    assert_eq!(premier.copies, 4, "jaquette, carte, recette, manifeste");
    let second = publier_fascicules(&bucket, Cible::Bucket, maintenant())
        .await
        .unwrap();
    assert_eq!(second.copies, 0);
    assert!(!second.index_ecrit);
}

#[tokio::test]
async fn un_fichier_altere_bloque_la_parution() {
    let dossier = tempfile::tempdir().unwrap();
    let paru = essai::fascicule(dossier.path(), 0, PASSE);
    essai::calendrier(dossier.path(), CALENDRIER, "v1", &[(0, PASSE, &paru)]);
    let bucket = InMemory::new();
    deposer_staging(&bucket, dossier.path()).await;
    bucket
        .put(
            &Path::from(format!("staging/{paru}")),
            PutPayload::from_static(b"{}"),
        )
        .await
        .unwrap();

    let erreur = publier_fascicules(&bucket, Cible::Bucket, maintenant())
        .await
        .unwrap_err();
    assert!(
        matches!(
            erreur,
            ErreurParution::Catalogue(ErreurCatalogue::Empreinte(_))
        ),
        "{erreur}"
    );
    assert!(!existe(&bucket, "public/index.json").await);
}

#[tokio::test]
async fn un_fascicule_paru_retire_du_calendrier_reste_dans_l_index() {
    let dossier = tempfile::tempdir().unwrap();
    let premier = essai::fascicule(dossier.path(), 0, PASSE);
    essai::calendrier(dossier.path(), CALENDRIER, "v1", &[(0, PASSE, &premier)]);
    let bucket = InMemory::new();
    deposer_staging(&bucket, dossier.path()).await;
    publier_fascicules(&bucket, Cible::Bucket, maintenant())
        .await
        .unwrap();

    essai::calendrier(dossier.path(), CALENDRIER, "v2", &[]);
    deposer_staging(&bucket, dossier.path()).await;
    let rapport = publier_fascicules(&bucket, Cible::Bucket, maintenant())
        .await
        .unwrap();
    assert_eq!(rapport.conserves, vec![0]);
    assert_eq!(index(&bucket).await.fascicules.len(), 1);
    assert_eq!(index(&bucket).await.version, "v2");
}

#[tokio::test]
async fn publie_aussi_dans_un_dossier_local() {
    let artefact = tempfile::tempdir().unwrap();
    let paru = essai::fascicule(artefact.path(), 0, PASSE);
    essai::calendrier(artefact.path(), CALENDRIER, "v1", &[(0, PASSE, &paru)]);
    let bucket_local = tempfile::tempdir().unwrap();
    let dossier =
        object_store::local::LocalFileSystem::new_with_prefix(bucket_local.path()).unwrap();
    let staging = bucket_local.path().join(STAGING);
    std::fs::create_dir_all(&staging).unwrap();
    for entree in std::fs::read_dir(artefact.path()).unwrap() {
        let entree = entree.unwrap();
        let nom = entree.file_name();
        if entree.path().is_dir() {
            std::fs::create_dir_all(staging.join(&nom)).unwrap();
            for fichier in std::fs::read_dir(entree.path()).unwrap() {
                let fichier = fichier.unwrap();
                std::fs::copy(fichier.path(), staging.join(&nom).join(fichier.file_name()))
                    .unwrap();
            }
        } else {
            std::fs::copy(entree.path(), staging.join(nom)).unwrap();
        }
    }

    let rapport = publier_fascicules(&dossier, Cible::Dossier, maintenant())
        .await
        .unwrap();
    assert!(rapport.index_ecrit);
    assert!(bucket_local.path().join(PUBLIC).join(INDEX).is_file());
    assert!(bucket_local.path().join(PUBLIC).join(&paru).is_file());
}
