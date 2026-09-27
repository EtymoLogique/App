//! Artefact fictif pour les tests, sans aucune donnée du catalogue réel.

use std::path::Path;

use serde_json::{Value, json};
use sha2::{Digest, Sha256};

/// Octets canoniques (clés triées, compacts), comme le compilateur.
#[must_use]
pub fn canonique(valeur: &Value) -> Vec<u8> {
    serde_json::to_vec(valeur).expect("JSON sérialisable")
}

/// Dépose `octets` sous `<dossier>/<sha256>.<extension>` et renvoie le chemin relatif.
#[must_use]
pub fn deposer(racine: &Path, dossier: &str, extension: &str, octets: &[u8]) -> String {
    let chemin = format!(
        "{dossier}/{}.{extension}",
        hex::encode(Sha256::digest(octets))
    );
    let complet = racine.join(&chemin);
    std::fs::create_dir_all(complet.parent().unwrap()).unwrap();
    std::fs::write(complet, octets).unwrap();
    chemin
}

/// Écrit un fascicule minimal (une carte, une recette, une jaquette) et renvoie
/// le chemin de son manifeste.
#[must_use]
pub fn fascicule(racine: &Path, numero: u32, parution: &str) -> String {
    let jaquette = deposer(
        racine,
        "a",
        "svg",
        format!("<svg id=\"j{numero}\"/>").as_bytes(),
    );
    let carte = deposer(
        racine,
        "r",
        "json",
        &canonique(&json!({ "id": "unt_0000000a", "n": numero })),
    );
    let recette = deposer(
        racine,
        "r",
        "json",
        &canonique(&json!({ "id": "rct_0000000a" })),
    );
    let manifeste = json!({
        "format": 1,
        "numero": numero,
        "parution": parution,
        "test": true,
        "jaquette": jaquette,
        "exclusions": null,
        "cartes": [{ "id": "unt_0000000a", "role": "resultat", "carte": carte, "silhouette": null }],
        "langues": [],
        "recettes": [{ "id": "rct_0000000a", "chemin": recette }],
        "compteurs": { "mots": 1 },
        "pli": { "briques": [] },
        "jalons": []
    });
    deposer(racine, "f", "json", &canonique(&manifeste))
}

/// Écrit un calendrier (`parutions.json` ou `index.json`) listant ces fascicules.
pub fn calendrier(racine: &Path, nom: &str, version: &str, fascicules: &[(u32, &str, &str)]) {
    let valeur = json!({
        "format": 1,
        "version": version,
        "essai": true,
        "referentiels": { "langues": [], "systemes_ecriture": [], "conventions": [] },
        "fascicules": fascicules
            .iter()
            .map(|(numero, parution, manifeste)| json!({ "numero": numero, "parution": parution, "manifeste": manifeste }))
            .collect::<Vec<_>>()
    });
    std::fs::create_dir_all(racine).unwrap();
    std::fs::write(racine.join(nom), canonique(&valeur)).unwrap();
}
