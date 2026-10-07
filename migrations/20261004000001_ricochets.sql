-- Ricochets (ADR 0044, App#18) : niveau de révision de chaque carte trouvée.
-- Pas de ligne : niveau 0, à revoir aujourd'hui. Rien n'est consommé.
CREATE TABLE ricochet (
    joueur_id          uuid     NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    unite_id           text     NOT NULL CHECK (unite_id ~ '^(unt|brq)_[0-9a-hjkmnp-tv-z]{8}$'),
    niveau             smallint NOT NULL DEFAULT 0 CHECK (niveau BETWEEN 0 AND 3),
    bonnes_niveau_3    smallint NOT NULL DEFAULT 0 CHECK (bonnes_niveau_3 BETWEEN 0 AND 3),
    prochaine_revision date     NOT NULL,
    -- Définitive : une carte maîtrisée le reste.
    maitrisee_le       timestamptz,
    PRIMARY KEY (joueur_id, unite_id)
);

-- Les cinq premières réponses du jour comptent pour les quêtes (ADR 0045).
-- Jour GMT, comme le renouvellement des quêtes.
CREATE TABLE ricochet_jour (
    joueur_id uuid     NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    jour      date     NOT NULL,
    reponses  smallint NOT NULL CHECK (reponses BETWEEN 0 AND 5),
    bonnes    smallint NOT NULL CHECK (bonnes BETWEEN 0 AND 5),
    PRIMARY KEY (joueur_id, jour)
);

-- Répondre à un ricochet est une commande idempotente comme les autres.
ALTER TABLE commande DROP CONSTRAINT commande_type_check;
ALTER TABLE commande ADD CONSTRAINT commande_type_check
    CHECK (type IN ('fusion', 'ouvrir_pli', 'sablier', 'indice', 'jalon', 'ricochet', 'synchronisation'));
