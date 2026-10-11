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
/// Sens affichés de `GEO` et `LOGIE`, pour les ricochets.
pub const SENS_GEO: &str = "sns_0000ge01";
pub const SENS_LOGIE: &str = "sns_000109e1";
/// Langue du mot fictif, objet de la quête de langue de l'artefact d'essai.
pub const LANGUE: &str = "lng_0000000a";
/// Quêtes au long cours de l'artefact d'essai.
pub const QUETE_LANGUE: &str = "qlc_0000000a";
pub const PALIER_LANGUE_1: &str = "pal_0000000a";
pub const PALIER_LANGUE_3: &str = "pal_0000000b";
pub const PALIER_ELISION: &str = "pal_0000000c";
pub const PALIER_RICOCHETS: &str = "pal_0000000d";

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
        &canonique(&json!({
            "id": MOT, "n": numero, "nature": "mot", "langue_id": LANGUE,
            "formes": [{ "id": "frm_0000000a", "texte": "géologie", "role": "canonique",
                         "systeme_ecriture_id": "ecr_0000000a" }],
            "sens": [],
            "compositions": [{ "id": "cmp_0000000a", "preferee": true, "parties": [],
                               "transformations": [{ "id": "trf_0000000a", "type_code": "elision", "ordre": 1,
                                                     "libelles": {} }],
                               "libelles": {} }]
        })),
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
        "cartes": [{ "id": MOT, "role": "resultat", "carte": carte, "silhouette": null, "difficulte": "moyen" }],
        "langues": [],
        "recettes": [{ "id": RECETTE, "chemin": recette }],
        "compteurs": { "mots": 1 },
        "mots_briques": [{ "mot_id": MOT, "brique_id": BIO }],
        "ricochets": {
            "briques": [
                { "id": GEO, "sens_id": SENS_GEO, "classe_sens": SENS_GEO },
                { "id": LOGIE, "sens_id": SENS_LOGIE, "classe_sens": SENS_LOGIE }
            ],
            "mots": [{ "id": MOT, "classe_litteral": MOT, "coupes": [3] }]
        },
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
                "encre_decouverte": { "commune": 3, "peu_commune": 5, "rare": 10, "legendaire": 25 },
                "garantie_nouveaute": 6,
                "filet_utilite": 5
            }
        },
        "jalons": [{ "id": "jal_0000000a", "decouvertes": 1, "pli": [BIO], "sabliers": 3 }],
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
        "quetes": [
            { "id": QUETE_LANGUE, "sorte": "langue", "langue_id": LANGUE,
              "libelles": { "fr": { "titre": "Langue d’essai", "consigne": "Trouvez des formes de cette langue." } },
              "paliers": [
                  { "id": PALIER_LANGUE_1, "seuil": 1, "encre": 5, "sabliers": 2 },
                  { "id": PALIER_LANGUE_3, "seuil": 3, "sabliers": 1 }
              ] },
            { "id": "qlc_0000000b", "sorte": "transformation", "type_code": "elision",
              "libelles": { "fr": { "titre": "Élision", "consigne": "Trouvez un mot qui élide." } },
              "paliers": [{ "id": PALIER_ELISION, "seuil": 1, "sabliers": 1 }] },
            { "id": "qlc_0000000c", "sorte": "ricochets",
              "libelles": { "fr": { "titre": "Maîtrise", "consigne": "Maîtrisez des cartes." } },
              "paliers": [{ "id": PALIER_RICOCHETS, "seuil": 1, "sabliers": 1 }] }
        ],
        "cadeau_de_bienvenue": { "plis": [GEO, GEO, BIO], "sabliers": 12, "encre": 40 },
        "fascicules": fascicules
            .iter()
            .map(|(numero, parution, manifeste)| json!({ "numero": numero, "parution": parution, "manifeste": manifeste }))
            .collect::<Vec<_>>()
    });
    std::fs::create_dir_all(racine).unwrap();
    std::fs::write(racine.join(nom), canonique(&valeur)).unwrap();
}
