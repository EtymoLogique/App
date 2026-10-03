-- Jours de jeu distincts, en jour GMT (ADR 0050, App#25). Un nouveau joueur
-- compte son premier jour ; les joueurs existants partent de 1.
ALTER TABLE joueur
    ADD COLUMN jours_de_jeu integer NOT NULL DEFAULT 1 CHECK (jours_de_jeu >= 1);
