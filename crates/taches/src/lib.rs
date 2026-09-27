//! Tâches planifiées (Serverless Jobs, ADR 0024) : parution des fascicules
//! (ADR 0029) et purges des données à durée limitée.

pub mod parution;
pub mod purges;
pub mod stockage;

pub use parution::{Cible, RapportParution, publier_fascicules};
pub use purges::purger;
