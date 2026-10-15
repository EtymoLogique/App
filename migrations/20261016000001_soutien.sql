-- Soutien par abonnement Ko-fi (ADR 0078). Seule trace d'un abonné : l'empreinte
-- HMAC de son adresse (celle des comptes) et la date de son dernier paiement,
-- sans nom, sans montant, sans adresse. Pas de clé étrangère : l'abonnement
-- peut précéder la création du compte. La ligne disparaît avec le compte.

CREATE TABLE soutien (
    empreinte_courriel bytea       PRIMARY KEY CHECK (octet_length(empreinte_courriel) = 32),
    dernier_paiement   timestamptz NOT NULL
);
