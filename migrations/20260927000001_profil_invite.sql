-- Profil invité, idempotence des commandes et réglages (ADR 0007, ADR 0024,
-- modèle de données §7). Aucune donnée personnelle : ni nom, ni adresse
-- électronique, ni adresse réseau. Aucun texte du catalogue.

CREATE TABLE joueur (
    id                uuid        PRIMARY KEY,
    -- SHA-256 du secret de 256 bits généré par le client, jamais le secret.
    empreinte_secret  bytea       NOT NULL CHECK (octet_length(empreinte_secret) = 32),
    version_etat      bigint      NOT NULL DEFAULT 0 CHECK (version_etat >= 0),
    version_catalogue text        NULL CHECK (char_length(version_catalogue) BETWEEN 1 AND 64),
    cree_le           timestamptz NOT NULL DEFAULT now(),
    derniere_activite timestamptz NOT NULL DEFAULT now()
);

-- Commandes reçues : la clé d'idempotence vient du client, la réponse est
-- rejouée à l'identique. Purgées après 30 jours (tâche « purger »).
CREATE TABLE commande (
    joueur_id uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    id        uuid        NOT NULL,
    type      text        NOT NULL CHECK (type IN ('fusion', 'ouvrir_pli', 'sablier', 'indice', 'synchronisation')),
    statut    text        NOT NULL CHECK (statut IN ('acceptee', 'refusee', 'conflit')),
    reponse   jsonb       NOT NULL,
    recue_le  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, id)
);

CREATE INDEX commande_recue_le ON commande (recue_le);

-- Préférences non sensibles : valeurs énumérées, jamais de texte libre.
CREATE TABLE reglage (
    joueur_id uuid NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    cle       text NOT NULL CHECK (cle IN ('theme', 'locale', 'mouvement_reduit')),
    valeur    text NOT NULL CHECK (valeur ~ '^[a-z0-9_-]{1,32}$'),
    PRIMARY KEY (joueur_id, cle)
);
