-- Indices à la carte (ADR 0051) : trois indices au choix (1 silhouette,
-- 2 sens littéral, 3 définition) remplacent les cinq niveaux ordonnés de
-- l'ADR 0038. Leur sens change : les lignes existantes sont supprimées et leur
-- prix, au barème d'alors (5, 10, 20, 40, 80), est rendu en encre.
CREATE TEMPORARY TABLE remboursement ON COMMIT DROP AS
SELECT joueur_id, SUM((ARRAY[5, 10, 20, 40, 80])[niveau])::integer AS gouttes
FROM indice
GROUP BY joueur_id;

INSERT INTO encre (joueur_id, gouttes)
SELECT joueur_id, gouttes FROM remboursement
ON CONFLICT (joueur_id) DO UPDATE SET gouttes = encre.gouttes + EXCLUDED.gouttes;

INSERT INTO mouvement (joueur_id, ressource, delta, motif)
SELECT joueur_id, 'encre', gouttes, 'indice' FROM remboursement;

DELETE FROM indice;

ALTER TABLE indice DROP CONSTRAINT indice_niveau_check;
ALTER TABLE indice ADD CONSTRAINT indice_niveau_check CHECK (niveau BETWEEN 1 AND 3);
