-- Cadeau de bienvenue (ADR 0046, App#23) : une récompense unique par profil.
-- Les motifs et origines des quêtes initiales (App#24) sont ajoutés avec eux.
CREATE TABLE cadeau_recupere (
    joueur_id   uuid        PRIMARY KEY REFERENCES joueur (id) ON DELETE CASCADE,
    recupere_le timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commande DROP CONSTRAINT commande_type_check;
ALTER TABLE commande ADD CONSTRAINT commande_type_check
    CHECK (type IN ('fusion', 'ouvrir_pli', 'sablier', 'indice', 'jalon', 'ricochet', 'palier', 'carte_lecteur', 'cadeau', 'quete_initiale', 'synchronisation'));

ALTER TABLE mouvement DROP CONSTRAINT mouvement_motif_check;
ALTER TABLE mouvement ADD CONSTRAINT mouvement_motif_check
    CHECK (motif IN ('decouverte', 'pli', 'doublon', 'sablier', 'indice', 'jalon', 'palier', 'lecteur', 'cadeau', 'quete_initiale', 'depart'));

ALTER TABLE ouverture_pli DROP CONSTRAINT ouverture_pli_origine_check;
ALTER TABLE ouverture_pli ADD CONSTRAINT ouverture_pli_origine_check
    CHECK (origine IN ('energie', 'jalon', 'lecteur', 'cadeau', 'quete_initiale'));
