-- Comptes facultatifs et appareils (ADR 0070, modèle de données §7). Un
-- joueur peut avoir plusieurs appareils ; une partie invitée en a un seul.
-- Aucune adresse électronique, aucun code ni jeton en clair : des empreintes.

CREATE TABLE appareil (
    id                uuid        PRIMARY KEY,
    joueur_id         uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    -- SHA-256 du secret de 256 bits généré par le client, jamais le secret.
    empreinte_secret  bytea       NOT NULL CHECK (octet_length(empreinte_secret) = 32),
    cree_le           timestamptz NOT NULL DEFAULT now(),
    derniere_activite timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX appareil_joueur ON appareil (joueur_id);

-- Chaque profil invité devient le premier appareil de son joueur : même
-- identifiant, donc les jetons de session en cours restent valables.
INSERT INTO appareil (id, joueur_id, empreinte_secret, cree_le, derniere_activite)
SELECT id, id, empreinte_secret, cree_le, derniere_activite FROM joueur;

ALTER TABLE joueur DROP COLUMN empreinte_secret;

-- HMAC-SHA256 de l'adresse normalisée, avec une clé dédiée. Le pseudo par
-- défaut reste privé tant que `pseudo_confirme` est faux.
CREATE TABLE compte (
    joueur_id          uuid        PRIMARY KEY REFERENCES joueur (id) ON DELETE CASCADE,
    empreinte_courriel bytea       NOT NULL UNIQUE CHECK (octet_length(empreinte_courriel) = 32),
    pseudo             text        NOT NULL UNIQUE CHECK (pseudo ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(pseudo) BETWEEN 3 AND 24),
    pseudo_confirme    boolean     NOT NULL DEFAULT false,
    cree_le            timestamptz NOT NULL DEFAULT now()
);

-- Demandes de connexion ou de création : le lien et le code envoyés par
-- e-mail, en empreintes seulement. 15 minutes, 5 essais, usage unique ;
-- purgées après un jour.
CREATE TABLE defi_connexion (
    id                 uuid        PRIMARY KEY,
    appareil_id        uuid        NOT NULL REFERENCES appareil (id) ON DELETE CASCADE,
    intention          text        NOT NULL CHECK (intention IN ('creation', 'connexion')),
    empreinte_courriel bytea       NOT NULL CHECK (octet_length(empreinte_courriel) = 32),
    -- Création seulement : calculé à la demande, quand l'adresse est en mémoire. Jamais l'adresse.
    pseudo_propose     text        NULL,
    empreinte_jeton    bytea       NOT NULL CHECK (octet_length(empreinte_jeton) = 32),
    empreinte_code     bytea       NOT NULL CHECK (octet_length(empreinte_code) = 32),
    tentatives         smallint    NOT NULL DEFAULT 0 CHECK (tentatives BETWEEN 0 AND 5),
    expire_le          timestamptz NOT NULL,
    utilise_le         timestamptz NULL,
    cree_le            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX defi_connexion_empreinte ON defi_connexion (empreinte_courriel);
CREATE INDEX defi_connexion_cree_le ON defi_connexion (cree_le);
