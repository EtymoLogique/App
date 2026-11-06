# Procédure : accès et portabilité des données d’un joueur

Cadre : RGPD, art. 15 (accès), 20 (portabilité) et 12.3 (réponse **sous un mois** à compter de la demande). Ce relevé n’est pas un avis juridique.

L’adresse de contact est `contact@etymologique.fr` (Réglages › Licences et contact, mentions légales, page « Données personnelles »).

## Étapes

1. **Accuser réception** le jour même et noter la date de réception : l’échéance est un mois plus tard.
2. **Vérifier que le demandeur contrôle l’adresse.** Il écrit depuis l’adresse de son compte. Répondez à cette adresse avec un code aléatoire à six chiffres (`openssl rand -hex 3`) et demandez-le en retour. Sans code renvoyé, n’envoyez rien. Ne le faites jamais depuis un autre canal que cette réponse.
3. **Exporter.** Avec la base de production et la clé `ETYMO_CLE_COURRIEL` du serveur :

   ```sh
   etymo-api exporter --courriel <adresse> > export.json
   ```

   La commande retrouve le compte par l’empreinte HMAC de l’adresse normalisée et écrit en JSON toutes les données du joueur, une clé par table. Elle échoue (« aucun compte pour cette adresse ») si l’adresse n’a pas de compte : répondez alors que rien n’est gardé. Une partie invitée n’a pas d’adresse, donc pas d’export par cette voie.
   Sont exclus : l’empreinte du secret de chaque appareil (identifiant de connexion) et les défis de connexion en cours.
4. **Envoyer** `export.json` en pièce jointe à l’adresse vérifiée, puis **supprimer** le fichier de la machine de l’opérateur. Ne gardez ni l’export ni l’adresse ; notez seulement la date de la demande et de la réponse.
5. **Effacement ou rectification** demandés dans le même message : le joueur les fait lui-même dans l’application (Réglages › Compte, « Supprimer mon compte »).

## Remarques

- L’export est un fichier structuré, courant et lisible par machine (art. 20) ; les identifiants (`brique_id`, `mot_id`…) renvoient au catalogue, que la base ne recopie pas.
- Si les demandes se multiplient, le bouton « Télécharger mes données » dans les Réglages remplacera cette procédure : `GET /etat` rend déjà l’essentiel de la progression.
