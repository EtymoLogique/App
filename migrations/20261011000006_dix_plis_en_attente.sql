-- Énergie : 10 charges au plus au lieu de 2. Les joueurs qui étaient à 2 / 2
-- repartent d'une recharge en cours (une charge dans 12 h).
ALTER TABLE energie DROP CONSTRAINT IF EXISTS energie_charges_check;
ALTER TABLE energie DROP CONSTRAINT IF EXISTS energie_check;
UPDATE energie SET prochaine_charge = now() + interval '12 hours' WHERE charges = 2 AND prochaine_charge IS NULL;
ALTER TABLE energie
    ADD CONSTRAINT energie_charges_check CHECK (charges BETWEEN 0 AND 10),
    ADD CONSTRAINT energie_check CHECK ((charges = 10) = (prochaine_charge IS NULL));
