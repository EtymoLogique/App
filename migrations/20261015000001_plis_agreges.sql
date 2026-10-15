-- Plis agrégés (ADR 0071) : le détail de `ouverture_pli` est effacé après
-- 12 mois, ce qui reste ne porte aucun identifiant de joueur. `joueurs` sert
-- à appliquer le seuil de 50 joueurs de l'ADR 0050 à la lecture.
CREATE TABLE plis_agreges (
    mois                date    NOT NULL,
    fascicule_id        text    NOT NULL,
    origine             text    NOT NULL,
    resultat            text    NOT NULL,
    regle               text    NOT NULL,
    version_equilibrage text    NOT NULL,
    plis                integer NOT NULL CHECK (plis > 0),
    joueurs             integer NOT NULL CHECK (joueurs > 0),
    PRIMARY KEY (mois, fascicule_id, origine, resultat, regle, version_equilibrage)
);
