-- Fascicules débloqués par le joueur (ADR 0068) : le premier paru l'est
-- d'emblée, chacun des suivants quand le 2ᵉ jalon du précédent est atteint.
-- Une ligne n'est jamais supprimée, sauf par la réinitialisation hors prod.
CREATE TABLE fascicule_debloque (
    joueur_id    uuid        NOT NULL REFERENCES joueur (id) ON DELETE CASCADE,
    fascicule_id text        NOT NULL,
    debloque_le  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (joueur_id, fascicule_id)
);

-- Reprise : un profil existant garde tout fascicule déjà semé ou déjà tiré.
INSERT INTO fascicule_debloque (joueur_id, fascicule_id)
SELECT joueur_id, fascicule_id FROM graine_accordee
UNION
SELECT joueur_id, fascicule_id FROM compteur_pli
ON CONFLICT DO NOTHING;
