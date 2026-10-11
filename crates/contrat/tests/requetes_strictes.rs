//! Non-régression (J8, App#30) : toute requête de l'API refuse les propriétés
//! inconnues au lieu de les ignorer (AGENTS.md, « Validation côté serveur »).

use etymo_contrat::{DemandeCadeau, DemandeSession};
use serde_json::json;

/// Chaque `pub struct Demande…` du contrat porte `#[serde(deny_unknown_fields)]`.
#[test]
fn toute_demande_refuse_les_proprietes_inconnues() {
    let source = include_str!("../src/lib.rs");
    let lignes: Vec<&str> = source.lines().collect();
    let mut demandes = 0;
    for (i, ligne) in lignes.iter().enumerate() {
        let Some(nom) = ligne.strip_prefix("pub struct Demande") else {
            continue;
        };
        demandes += 1;
        // Les attributs précèdent la structure : on remonte jusqu'à la ligne de documentation ou vide.
        let strict = lignes[..i]
            .iter()
            .rev()
            .take_while(|l| l.trim_start().starts_with("#[") || l.trim_start().starts_with("///"))
            .any(|l| l.contains("deny_unknown_fields"));
        assert!(strict, "Demande{nom} doit refuser les propriétés inconnues");
    }
    assert!(
        demandes >= 10,
        "le test lit bien le contrat ({demandes} demandes)"
    );
}

#[test]
fn une_propriete_inconnue_est_une_erreur_de_lecture() {
    let session =
        json!({ "installation": "00000000-0000-4000-8000-000000000000", "secret": "a".repeat(43) });
    assert!(serde_json::from_value::<DemandeSession>(session.clone()).is_ok());
    let mut avec = session;
    avec["intrus"] = json!(true);
    assert!(serde_json::from_value::<DemandeSession>(avec).is_err());

    let cadeau = json!({ "commande": "00000000-0000-4000-8000-000000000000", "version_etat": 1, "version_catalogue": "v" });
    assert!(serde_json::from_value::<DemandeCadeau>(cadeau.clone()).is_ok());
    let mut avec = cadeau;
    avec["intrus"] = json!(1);
    assert!(serde_json::from_value::<DemandeCadeau>(avec).is_err());
}
