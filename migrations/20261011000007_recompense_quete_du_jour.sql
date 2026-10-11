-- Récompense de chaque quête du jour (ADR 0063) : une quête faite attend que le
-- joueur la récupère ; `recupere_le` marque la récompense prise. Une quête faite
-- et pas récupérée survit à minuit GMT : rien n'expire.
ALTER TABLE quete_jour ADD COLUMN recupere_le timestamptz;

ALTER TABLE commande DROP CONSTRAINT commande_type_check;
ALTER TABLE commande ADD CONSTRAINT commande_type_check
    CHECK (type IN ('fusion', 'ouvrir_pli', 'sablier', 'indice', 'jalon', 'ricochet', 'palier', 'carte_lecteur', 'cadeau', 'quete_initiale', 'quete_jour', 'synchronisation'));

ALTER TABLE mouvement DROP CONSTRAINT mouvement_motif_check;
ALTER TABLE mouvement ADD CONSTRAINT mouvement_motif_check
    CHECK (motif IN ('decouverte', 'pli', 'doublon', 'sablier', 'indice', 'jalon', 'palier', 'lecteur', 'cadeau', 'quete_initiale', 'quete_jour', 'depart'));

ALTER TABLE ouverture_pli DROP CONSTRAINT ouverture_pli_origine_check;
ALTER TABLE ouverture_pli ADD CONSTRAINT ouverture_pli_origine_check
    CHECK (origine IN ('energie', 'jalon', 'lecteur', 'cadeau', 'quete_initiale', 'quete_jour'));
