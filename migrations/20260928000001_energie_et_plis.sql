-- Énergie, encre, compteurs et historique des plis (ADR 0011, 0012, 0016,
-- 0019, 0020, modèle de données §7). Une ligne absente vaut l'état initial :
-- énergie pleine, aucune goutte, compteurs à zéro.

-- Charges de pli : 2 au plus ; `prochaine_charge` nulle si et seulement si
-- l'énergie est pleine (le temps s'arrête).
CREATE TABLE energie (
    joueur_id        uuid        PRIMARY KEY REFERENCES joueur (id) ON DELETE CASCADE,
    charges          smallint    NOT NULL CHECK (charges BETWEEN 0 AND 2),
    prochaine_charge timestamptz NULL,
    CHECK ((charges = 2) = (prochaine_charge IS NULL))
);

-- Encre : jamais négative.
CREATE TABLE encre (
    joueur_id uuid    PRIMARY KEY REFERENCES joueur (id) ON DELETE CASCADE,
    gouttes   integer NOT NULL CHECK (gouttes >= 0)
);

-- Garantie de nouveauté et filet d'utilité, tenus par fascicule (ADR 0016).
CREATE TABLE compteur_pli (
    joueur_id           uuid    NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    fascicule_id        text    NOT NULL CHECK (fascicule_id ~ '^fsc_[0-9a-hjkmnp-tv-z]{8}$'),
    plis_sans_nouveaute integer NOT NULL CHECK (plis_sans_nouveaute >= 0),
    plis_sans_utilite   integer NOT NULL CHECK (plis_sans_utilite >= 0),
    PRIMARY KEY (joueur_id, fascicule_id)
);

-- Historique des plis : brique tirée, résultat et règle, pour le diagnostic
-- sans donnée personnelle.
CREATE TABLE ouverture_pli (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    joueur_id           uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    fascicule_id        text        NOT NULL CHECK (fascicule_id ~ '^fsc_[0-9a-hjkmnp-tv-z]{8}$'),
    origine             text        NOT NULL CHECK (origine IN ('energie', 'jalon')),
    brique_id           text        NOT NULL CHECK (brique_id ~ '^brq_[0-9a-hjkmnp-tv-z]{8}$'),
    resultat            text        NOT NULL CHECK (resultat IN ('nouvelle', 'doublon', 'reserve_pleine')),
    regle               text        NOT NULL CHECK (regle IN ('tirage', 'garantie', 'filet', 'deterministe')),
    encre               integer     NOT NULL CHECK (encre >= 0),
    version_equilibrage text        NOT NULL CHECK (char_length(version_equilibrage) BETWEEN 1 AND 64),
    ouvert_le           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ouverture_pli_joueur ON ouverture_pli (joueur_id, ouvert_le DESC);
