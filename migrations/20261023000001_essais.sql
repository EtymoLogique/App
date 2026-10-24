-- Mémoire des essais (App#89) : les paires déjà essayées sans succès (échec ou
-- « presque »), dans l'ordre des cases. Ni issue, ni date, ni texte du catalogue :
-- deux briques et le dernier fascicule paru au moment de l'essai. Toutes les
-- lignes d'un fascicule plus ancien s'oublient en bloc à la parution suivante,
-- car de vieilles paires peuvent devenir des mots.

CREATE TABLE essai (
    joueur_id      uuid NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    gauche         text NOT NULL CHECK (gauche ~ '^brq_[0-9a-hjkmnp-tv-z]{8}$'),
    droite         text NOT NULL CHECK (droite ~ '^brq_[0-9a-hjkmnp-tv-z]{8}$'),
    fascicule_juge text NOT NULL CHECK (fascicule_juge ~ '^fsc_[0-9a-hjkmnp-tv-z]{8}$'),
    PRIMARY KEY (joueur_id, gauche, droite)
);
