-- Carte de lecteur (ADR 0045, App#21) : un tampon par jour GMT où les quêtes
-- du jour sont faites, sans série ni expiration. Sept tampons remplissent une
-- carte ; sa récompense attend d'être récupérée, une carte à la fois.
CREATE TABLE tampon (
    joueur_id uuid NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    jour      date NOT NULL,
    PRIMARY KEY (joueur_id, jour)
);

-- Cartes pleines dont la récompense est récupérée, numérotées dans l'ordre.
CREATE TABLE carte_lecteur_recuperee (
    joueur_id   uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    numero      integer     NOT NULL CHECK (numero >= 1),
    recupere_le timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, numero)
);

ALTER TABLE commande DROP CONSTRAINT commande_type_check;
ALTER TABLE commande ADD CONSTRAINT commande_type_check
    CHECK (type IN ('fusion', 'ouvrir_pli', 'sablier', 'indice', 'jalon', 'ricochet', 'palier', 'carte_lecteur', 'synchronisation'));

ALTER TABLE mouvement DROP CONSTRAINT mouvement_motif_check;
ALTER TABLE mouvement ADD CONSTRAINT mouvement_motif_check
    CHECK (motif IN ('decouverte', 'pli', 'doublon', 'sablier', 'indice', 'jalon', 'palier', 'lecteur', 'depart'));

ALTER TABLE ouverture_pli DROP CONSTRAINT ouverture_pli_origine_check;
ALTER TABLE ouverture_pli ADD CONSTRAINT ouverture_pli_origine_check
    CHECK (origine IN ('energie', 'jalon', 'lecteur'));
