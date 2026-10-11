-- Quêtes initiales de la première semaine (ADR 0046, App#24) : faites une
-- seule fois. Une ligne apparaît quand la quête est faite pendant la première
-- semaine du profil ; `recupere_le` marque la récompense prise.
CREATE TABLE quete_initiale (
    joueur_id   uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    code        text        NOT NULL CHECK (code IN ('trois_mots', 'transformation', 'premiers_ricochets', 'premiere_carte')),
    faite_le    timestamptz NOT NULL DEFAULT now(),
    recupere_le timestamptz,
    PRIMARY KEY (joueur_id, code)
);
