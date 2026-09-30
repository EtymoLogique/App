-- Récompenses de jalon à récupérer (ADR 0042) : un jalon atteint attend que
-- le joueur vienne chercher sa récompense dans les quêtes. `recupere_le` reste
-- nul jusque-là. Les jalons déjà atteints ont été accordés d'office : ils
-- sont récupérés.

ALTER TABLE jalon_atteint ADD COLUMN recupere_le timestamptz NULL
    CHECK (recupere_le IS NULL OR recupere_le >= atteint_le);

UPDATE jalon_atteint SET recupere_le = atteint_le;

-- Récupérer une récompense est une commande idempotente comme les autres.
ALTER TABLE commande DROP CONSTRAINT commande_type_check;
ALTER TABLE commande ADD CONSTRAINT commande_type_check
    CHECK (type IN ('fusion', 'ouvrir_pli', 'sablier', 'indice', 'jalon', 'synchronisation'));
