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

/// Briques du fascicule fictif : `GEO` + `LOGIE` donne le mot `MOT`.
pub const GEO: &str = "brq_0000ge00";
pub const LOGIE: &str = "brq_000109e0";
pub const BIO: &str = "brq_0000b100";
pub const MOT: &str = "unt_0000000a";
pub const RECETTE: &str = "rct_0000000a";

/// Écrit un fascicule minimal (une carte, une recette, des exclusions, une
/// jaquette, des graines) et renvoie le chemin de son manifeste.
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
        &canonique(&json!({ "id": MOT, "n": numero })),
    );
    let recette = deposer(
        racine,
        "r",
        "json",
        &canonique(&json!({
            "id": RECETTE,
            "composition_id": "cmp_0000000a",
            "resultat_id": MOT,
            "emplacements": [
                { "rang": 2, "briques_acceptees": [LOGIE] },
                { "rang": 1, "briques_acceptees": [GEO] }
            ]
        })),
    );
    let exclusions = deposer(
        racine,
        "r",
        "json",
        &canonique(
            &json!({ "exclusions": [{ "id": "exc_0000000a", "combinaison": [BIO, GEO], "raison": "rare" }] }),
        ),
    );
    let manifeste = json!({
        "format": 1,
        "id": format!("fsc_{numero:08}"),
        "numero": numero,
        "parution": parution,
        "test": true,
        "jaquette": jaquette,
        "exclusions": exclusions,
        "cartes": [{ "id": MOT, "role": "resultat", "carte": carte, "silhouette": null }],
        "langues": [],
        "recettes": [{ "id": RECETTE, "chemin": recette }],
        "compteurs": { "mots": 1 },
        "pli": {
            "briques": [
                { "id": GEO, "nature": "prefixe", "rarete": "commune", "unite_id": "unt_0000000g" },
                { "id": LOGIE, "nature": "suffixe", "rarete": "commune", "unite_id": "unt_00000109" },
                { "id": BIO, "nature": "prefixe", "rarete": "rare", "unite_id": "unt_0000000b" }
            ],
            "equilibrage": {
                "version": "essai",
                "poids_raretes": { "commune": 62, "peu_commune": 26, "rare": 10, "legendaire": 2 },
                "base_encre": 2,
                "encre_doublon": { "commune": 1, "peu_commune": 2, "rare": 4, "legendaire": 10 },
                "encre_reserve_pleine": { "commune": 2, "peu_commune": 4, "rare": 8, "legendaire": 20 },
                "garantie_nouveaute": 6,
                "filet_utilite": 5
            }
        },
        "jalons": [],
        "graines": [
            { "brique_id": GEO, "exemplaires": 2 },
            { "brique_id": LOGIE, "exemplaires": 1 }
        ]
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
