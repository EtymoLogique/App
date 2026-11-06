//! Compte facultatif (ADR 0070) : normalisation de l'adresse électronique,
//! avant son empreinte, et pseudo. L'adresse ne sort jamais de ces fonctions
//! autrement que normalisée ; elle n'est ni stockée ni journalisée.

use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

/// Longueur maximale d'un pseudo par défaut, avant ses chiffres.
const RACINE_MAX: usize = 16;

/// Rogne, compose (NFC) et met en minuscules une adresse, ou la refuse.
/// Aucune réécriture propre à un fournisseur : les points d'une adresse
/// Gmail comptent.
#[must_use]
pub fn normaliser_courriel(saisie: &str) -> Option<String> {
    let adresse: String = saisie.trim().nfc().collect::<String>().to_lowercase();
    // Ni espace ni caractère de contrôle : l'adresse finit dans un en-tête d'e-mail.
    if adresse.chars().count() > 254 || adresse.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return None;
    }
    let (locale, domaine) = adresse.split_once('@')?;
    let longueur = locale.chars().count();
    let domaine_valide = domaine.contains('.')
        && !domaine.starts_with('.')
        && !domaine.ends_with('.')
        && !domaine.contains('@');
    ((1..=64).contains(&longueur) && domaine_valide).then_some(adresse)
}

/// Pseudo par défaut tiré de la partie locale : `camille.martin` et 4821
/// donnent `camille-martin-4821`. Ce qui suit un `+` est ignoré, les accents
/// sont retirés, tout autre signe devient un trait d'union.
#[must_use]
pub fn pseudo_par_defaut(locale: &str, chiffres: u16) -> String {
    let avant_plus = locale.split('+').next().unwrap_or_default();
    let mut racine = String::new();
    for c in avant_plus.nfd().filter(|c| !is_combining_mark(*c)) {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            racine.push(c);
        } else if !racine.is_empty() && !racine.ends_with('-') {
            racine.push('-');
        }
    }
    racine.truncate(RACINE_MAX);
    let racine = racine.trim_end_matches('-');
    let racine = if racine.is_empty() { "lecteur" } else { racine };
    format!("{racine}-{chiffres:04}")
}

/// Même règle que la contrainte SQL : 3 à 24 caractères, `[a-z0-9]` et des
/// traits d'union isolés, ni au début ni à la fin.
#[must_use]
pub fn pseudo_valide(pseudo: &str) -> bool {
    (3..=24).contains(&pseudo.len())
        && pseudo.split('-').all(|p| {
            !p.is_empty()
                && p.bytes()
                    .all(|o| o.is_ascii_lowercase() || o.is_ascii_digit())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalise_casse_espaces_et_composition() {
        assert_eq!(
            normaliser_courriel("  Camille.Martin@Exemple.FR \n").as_deref(),
            Some("camille.martin@exemple.fr")
        );
        // « é » décomposé (e + accent) devient le « é » composé.
        assert_eq!(
            normaliser_courriel("e\u{301}lodie@exemple.fr").as_deref(),
            Some("élodie@exemple.fr")
        );
        assert_eq!(
            normaliser_courriel("c.a.m+jeu@gmail.com").as_deref(),
            Some("c.a.m+jeu@gmail.com")
        );
    }

    #[test]
    fn refuse_les_adresses_mal_formees() {
        for saisie in [
            "",
            "camille",
            "@exemple.fr",
            "camille@",
            "camille@exemple",
            "camille@.fr",
            "camille@exemple.",
            "a@b@exemple.fr",
            "cam ille@exemple.fr",
            "camille@exemple.fr\r\nBcc: x@y.fr",
        ] {
            assert_eq!(normaliser_courriel(saisie), None, "{saisie:?}");
        }
        assert_eq!(
            normaliser_courriel(&format!("{}@exemple.fr", "a".repeat(65))),
            None
        );
        assert!(normaliser_courriel(&format!("{}@exemple.fr", "a".repeat(64))).is_some());
        assert_eq!(
            normaliser_courriel(&format!("a@{}.fr", "b".repeat(250))),
            None
        );
    }

    #[test]
    fn pseudo_par_defaut_des_exemples() {
        assert_eq!(
            pseudo_par_defaut("camille.martin", 4821),
            "camille-martin-4821"
        );
        assert_eq!(pseudo_par_defaut("élodie+jeu", 42), "elodie-0042");
        assert_eq!(pseudo_par_defaut("__", 1234), "lecteur-1234");
        assert_eq!(pseudo_par_defaut("", 7), "lecteur-0007");
        assert_eq!(pseudo_par_defaut("+jeu", 7), "lecteur-0007");
        assert_eq!(pseudo_par_defaut("_Zoé__O'Brien.", 1), "zoe-o-brien-0001");
    }

    #[test]
    fn pseudo_par_defaut_tronque_a_seize_caracteres() {
        assert_eq!(
            pseudo_par_defaut("abcdefghijklmnopqrstuvwxyz", 1),
            "abcdefghijklmnop-0001"
        );
        // Tronqué sur un trait d'union : il ne reste pas en bout de racine.
        assert_eq!(
            pseudo_par_defaut("abcdefghijklmno.pq", 1),
            "abcdefghijklmno-0001"
        );
        let long = pseudo_par_defaut(&"é".repeat(40), 9999);
        assert!(pseudo_valide(&long), "{long}");
    }

    #[test]
    fn valide_les_pseudos() {
        for ok in [
            "abc",
            "camille-martin-4821",
            "a-b",
            "x1y2z3",
            &"a".repeat(24),
        ] {
            assert!(pseudo_valide(ok), "{ok}");
        }
        for ko in [
            "ab",
            "-abc",
            "abc-",
            "a--b",
            "Abc",
            "élodie",
            "a b",
            "a_b",
            &"a".repeat(25),
        ] {
            assert!(!pseudo_valide(ko), "{ko}");
        }
    }
}
