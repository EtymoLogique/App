-- Cohortes de rétention et indicateurs agrégés (ADR 0050, App#28). Seuls des
-- nombres sont gardés, jamais un identifiant de joueur ; aucun agrégat de moins
-- de 50 joueurs n'est affiché ni exporté (masqué par `etymo-api statistiques`).

-- Mois (premier jour) de l'activité d'avant, mis à jour quand l'activité du
-- joueur change de mois : de quoi compter le passage d'un mois au suivant.
ALTER TABLE joueur ADD COLUMN mois_activite_precedente date;

-- Un jour GMT achevé : joueurs actifs ce jour-là et indicateurs des quêtes et des ricochets.
CREATE TABLE indicateurs_jour (
    jour              date    PRIMARY KEY,
    joueurs_actifs    integer NOT NULL CHECK (joueurs_actifs >= 0),
    -- Actifs ce jour-là restés plus de deux jours sans découverte.
    sans_decouverte   integer NOT NULL CHECK (sans_decouverte >= 0),
    tampons           integer NOT NULL CHECK (tampons >= 0),
    quetes_terminees  integer NOT NULL CHECK (quetes_terminees >= 0),
    seances_ricochets integer NOT NULL CHECK (seances_ricochets >= 0)
);

-- Retour au 1ᵉʳ, au 7ᵉ et au 30ᵉ jour : profils créés `delai` jours avant `jour`,
-- revenus ce jour-là ou après.
CREATE TABLE retour_jour (
    jour    date     NOT NULL,
    delai   smallint NOT NULL CHECK (delai IN (1, 7, 30)),
    cohorte integer  NOT NULL CHECK (cohorte >= 0),
    revenus integer  NOT NULL CHECK (revenus >= 0),
    PRIMARY KEY (jour, delai)
);

-- Rétention mensuelle : joueurs d'un mois d'arrivée actifs pendant le mois `mois`.
CREATE TABLE retention_mois (
    mois         date    NOT NULL,
    mois_arrivee date    NOT NULL,
    cohorte      integer NOT NULL CHECK (cohorte >= 0),
    actifs       integer NOT NULL CHECK (actifs >= 0),
    PRIMARY KEY (mois, mois_arrivee)
);

-- Passage d'un mois au suivant : actifs du mois dont l'activité d'avant date du mois précédent.
CREATE TABLE passage_mois (
    mois     date    PRIMARY KEY,
    actifs   integer NOT NULL CHECK (actifs >= 0),
    venus_du_mois_precedent integer NOT NULL CHECK (venus_du_mois_precedent >= 0)
);
