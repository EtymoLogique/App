-- Légendaires : chance fixe hors garanties (ADR 0043). La garantie lointaine
-- compte, par fascicule, les plis d'affilée sans légendaire ; sa règle entre
-- dans l'historique des plis.
ALTER TABLE compteur_pli
    ADD COLUMN plis_sans_legendaire integer NOT NULL DEFAULT 0 CHECK (plis_sans_legendaire >= 0);

ALTER TABLE ouverture_pli DROP CONSTRAINT ouverture_pli_regle_check;
ALTER TABLE ouverture_pli
    ADD CONSTRAINT ouverture_pli_regle_check
    CHECK (regle IN ('tirage', 'garantie', 'filet', 'garantie_legendaire', 'deterministe'));
