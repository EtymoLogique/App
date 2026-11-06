//! Tâches planifiées (Serverless Jobs, ADR 0024) : parution des fascicules
//! (ADR 0029), purges des données à durée limitée et agrégats de cohortes (ADR 0050).

pub mod cohortes;
pub mod parution;
pub mod purges;
pub mod stockage;

pub use parution::{Cible, RapportParution, publier_fascicules};
pub use purges::purger;
