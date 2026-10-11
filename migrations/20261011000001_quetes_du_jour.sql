-- Quêtes du jour (ADR 0045, App#20) : trois quêtes par jour GMT, tirées par le
-- serveur à la première visite après minuit. Une ligne par quête ; une quête
-- non faite disparaît au jour suivant (purgée avec les données du jour).
CREATE TABLE quete_jour (
    joueur_id uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    jour      date        NOT NULL,
    rang      smallint    NOT NULL CHECK (rang BETWEEN 0 AND 2),
    code      text        NOT NULL CHECK (code IN (
        'table_sens', 'memoire_sans_faute', 'memoire_litteral',
        'memoire_maitrise', 'adresse_decouper', 'adresse_paires')),
    -- Le mot à trouver, pour la quête de table : un identifiant, jamais un texte.
    cible_id  text        CHECK (cible_id ~ '^unt_[0-9a-hjkmnp-tv-z]{8}$'),
    progres   smallint    NOT NULL DEFAULT 0 CHECK (progres >= 0),
    faite_le  timestamptz,
    PRIMARY KEY (joueur_id, jour, rang)
);
