-- Récompenses des paliers de quêtes au long cours (ADR 0045). Un palier est
-- atteint quand la progression calculée par le serveur franchit son seuil ;
-- seule sa récupération est stockée, une fois par joueur.

CREATE TABLE palier_recupere (
    joueur_id   uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    palier_id   text        NOT NULL CHECK (palier_id ~ '^pal_[0-9a-hjkmnp-tv-z]{8}$'),
    recupere_le timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, palier_id)
);

ALTER TABLE commande DROP CONSTRAINT commande_type_check;
ALTER TABLE commande ADD CONSTRAINT commande_type_check
    CHECK (type IN ('fusion', 'ouvrir_pli', 'sablier', 'indice', 'jalon', 'palier', 'synchronisation'));

ALTER TABLE mouvement DROP CONSTRAINT mouvement_motif_check;
ALTER TABLE mouvement ADD CONSTRAINT mouvement_motif_check
    CHECK (motif IN ('decouverte', 'pli', 'doublon', 'sablier', 'indice', 'jalon', 'palier', 'depart'));
