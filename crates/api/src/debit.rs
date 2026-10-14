//! Limitation de débit, en mémoire seulement (ADR 0024) : par adresse réseau
//! pour l'ouverture de session, par profil pour le reste, et par empreinte
//! d'adresse électronique pour les e-mails de connexion (ADR 0070). Aucune
//! adresse n'est conservée au-delà de la fenêtre de limitation.

use std::hash::Hash;
use std::num::NonZeroU32;
use std::time::Duration;

use governor::{DefaultKeyedRateLimiter, Quota, RateLimiter};
use uuid::Uuid;

use crate::erreur::ErreurApi;

pub struct Limiteurs {
    pub par_adresse: DefaultKeyedRateLimiter<String>,
    pub par_profil: DefaultKeyedRateLimiter<Uuid>,
    /// E-mails de connexion par adresse : 3 toutes les 15 minutes.
    pub par_courriel: DefaultKeyedRateLimiter<[u8; 32]>,
}

impl Limiteurs {
    #[must_use]
    pub fn nouveau(sessions_par_minute: u32, requetes_par_minute: u32) -> Self {
        let quota = |n: u32| Quota::per_minute(NonZeroU32::new(n.max(1)).expect("non nul"));
        Self {
            par_adresse: RateLimiter::keyed(quota(sessions_par_minute)),
            par_profil: RateLimiter::keyed(quota(requetes_par_minute)),
            par_courriel: RateLimiter::keyed(
                Quota::with_period(Duration::from_secs(5 * 60))
                    .expect("période non nulle")
                    .allow_burst(NonZeroU32::new(3).expect("non nul")),
            ),
        }
    }

    /// Oublie les clés dont la fenêtre est écoulée.
    pub fn oublier(&self) {
        self.par_adresse.retain_recent();
        self.par_profil.retain_recent();
        self.par_courriel.retain_recent();
    }
}

impl Default for Limiteurs {
    fn default() -> Self {
        Self::nouveau(20, 120)
    }
}

pub fn verifier<K: Hash + Eq + Clone>(
    limiteur: &DefaultKeyedRateLimiter<K>,
    cle: &K,
) -> Result<(), ErreurApi> {
    limiteur
        .check_key(cle)
        .map_err(|_| ErreurApi::TropDeRequetes)
}
