-- Sabliers, indices et jalons atteints (ADR 0018, 0020, 0038, modèle de
-- données §7). Une ligne `sablier` absente vaut zéro sablier détenu.

-- Sabliers détenus, sans plafond (ADR 0039).
CREATE TABLE sablier (
    joueur_id uuid    PRIMARY KEY REFERENCES joueur (id) ON DELETE CASCADE,
    detenus   integer NOT NULL CHECK (detenus >= 0)
);

-- Indices obtenus : un niveau d'une recette n'est payé qu'une fois.
CREATE TABLE indice (
    joueur_id  uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    recette_id text        NOT NULL CHECK (recette_id ~ '^rct_[0-9a-hjkmnp-tv-z]{8}$'),
    niveau     smallint    NOT NULL CHECK (niveau BETWEEN 1 AND 5),
    obtenu_le  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, recette_id, niveau)
);

-- Jalons atteints : un jalon ne se touche qu'une fois.
CREATE TABLE jalon_atteint (
    joueur_id uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    jalon_id  text        NOT NULL CHECK (jalon_id ~ '^jal_[0-9a-hjkmnp-tv-z]{8}$'),
    atteint_le timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, jalon_id)
);
