//! Limitation de débit, en mémoire seulement (ADR 0024) : par adresse réseau
//! pour l'ouverture de session, par profil pour le reste. Aucune adresse
//! n'est conservée au-delà de la fenêtre de limitation.

use std::hash::Hash;
use std::num::NonZeroU32;

use governor::{DefaultKeyedRateLimiter, Quota, RateLimiter};
use uuid::Uuid;

use crate::erreur::ErreurApi;

pub struct Limiteurs {
    pub par_adresse: DefaultKeyedRateLimiter<String>,
    pub par_profil: DefaultKeyedRateLimiter<Uuid>,
}

impl Limiteurs {
    #[must_use]
    pub fn nouveau(sessions_par_minute: u32, requetes_par_minute: u32) -> Self {
        let quota = |n: u32| Quota::per_minute(NonZeroU32::new(n.max(1)).expect("non nul"));
        Self {
            par_adresse: RateLimiter::keyed(quota(sessions_par_minute)),
            par_profil: RateLimiter::keyed(quota(requetes_par_minute)),
        }
    }

    /// Oublie les clés dont la fenêtre est écoulée.
    pub fn oublier(&self) {
        self.par_adresse.retain_recent();
        self.par_profil.retain_recent();
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
