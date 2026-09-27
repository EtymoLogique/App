-- Réserve, codex, journal des mouvements et graines reçues (ADR 0012,
-- ADR 0030, modèle de données §7). Les identifiants du catalogue sont
-- opaques ; aucun texte du catalogue n'est copié.

-- La réserve : une ligne par brique connue, créée à sa première obtention.
-- Une brique à 0 exemplaire reste connue : elle est épuisée.
CREATE TABLE exemplaire (
    joueur_id uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    brique_id text        NOT NULL CHECK (brique_id ~ '^brq_[0-9a-hjkmnp-tv-z]{8}$'),
    nombre    smallint    NOT NULL CHECK (nombre BETWEEN 0 AND 5),
    connue_le timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, brique_id)
);

-- Le codex : une ligne par mot découvert, numérotée dans l'ordre.
CREATE TABLE decouverte (
    joueur_id     uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    mot_id        text        NOT NULL CHECK (mot_id ~ '^unt_[0-9a-hjkmnp-tv-z]{8}$'),
    recette_id    text        NOT NULL CHECK (recette_id ~ '^rct_[0-9a-hjkmnp-tv-z]{8}$'),
    numero        integer     NOT NULL CHECK (numero >= 1),
    decouverte_le timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, mot_id),
    UNIQUE (joueur_id, numero)
);

-- Journal en ajout seul des gains et consommations.
CREATE TABLE mouvement (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    joueur_id   uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    -- Trace de la commande, sans clé étrangère : les commandes sont purgées.
    commande_id uuid        NULL,
    ressource   text        NOT NULL CHECK (ressource IN ('exemplaire', 'encre', 'sablier', 'charge')),
    brique_id   text        NULL CHECK (brique_id ~ '^brq_[0-9a-hjkmnp-tv-z]{8}$'),
    delta       integer     NOT NULL CHECK (delta <> 0),
    motif       text        NOT NULL CHECK (motif IN ('decouverte', 'pli', 'doublon', 'sablier', 'indice', 'jalon', 'depart')),
    le          timestamptz NOT NULL DEFAULT now(),
    CHECK ((ressource = 'exemplaire') = (brique_id IS NOT NULL))
);

CREATE INDEX mouvement_joueur_le ON mouvement (joueur_id, le);

-- Graines reçues : un fascicule ne sème qu'une fois par joueur (ADR 0030).
CREATE TABLE graine_accordee (
    joueur_id    uuid         NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    fascicule_id text         NOT NULL CHECK (fascicule_id ~ '^fsc_[0-9a-hjkmnp-tv-z]{8}$'),
    accordee_le  timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, fascicule_id)
);
