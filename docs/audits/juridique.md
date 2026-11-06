# Audit juridique : CGU, RGPD et obligations voisines

Relevé du 2026-10-14, sur l'état des dépôts App, Design et Infra à cette date (comptes de l'ADR 0070 compris). Comme l'[audit avant lancement](avant-lancement.md), il sépare ce que **le code prouve** de ce qui est **une règle de droit à faire confirmer**. Les règles citées le sont de mémoire ou d'après des sources secondaires : chacune est à valider par le conseil prévu au plan financier (2 500 € en M3 pour CGU et RGPD). Ce document n'est pas un avis juridique.

Le relevé suit les **échéances**, parce que chaque obligation naît à un jalon différent :

1. bêta ouverte en production (janvier 2027, ADR 0048) ;
2. télémétrie (J7, ADR 0010 et 0050) ;
3. pseudos visibles par d'autres joueurs (vue compétitive, plus tard).

## 1. Ce qui change le cadrage

### Les données des joueurs sont des données personnelles

L'audit avant lancement écrit « Aucune donnée personnelle stockée », et l'ADR 0050 s'intitule « sans donnée personnelle ». En droit, c'est inexact, et ce l'était déjà avant les comptes :

- un **identifiant d'installation** (`appareil.id`) rattaché à une activité datée (`cree_le`, `derniere_activite`, `jours_de_jeu`, historique des plis) est un identifiant de terminal, donc une donnée **pseudonymisée** au sens du considérant 26 du RGPD ;
- l'**empreinte HMAC de l'adresse** (`compte.empreinte_courriel`) l'est aussi : le responsable détient la clé `ETYMO_CLE_COURRIEL` et retrouve un compte à partir d'une adresse. C'est d'ailleurs ce qui permet la connexion ;
- le **pseudo par défaut** est stocké **en clair** (`compte.pseudo`, `defi_connexion.pseudo_propose`) et vient de la partie locale de l'adresse : `camille-martin-4821` contient un nom. L'ADR 0070 le garde privé, mais il est en base.

Le design reste excellent du point de vue de la minimisation : aucune adresse en clair, aucun mot de passe et aucune adresse réseau stockée, des journaux testés sans identifiant et des agrégats masqués sous 50 joueurs. Mais le RGPD s'applique entièrement : la politique de confidentialité doit parler de données « pseudonymisées et minimisées », jamais « anonymes ». Seuls les agrégats de `cohortes.rs` peuvent être dits anonymes.

**À corriger dans les documents** : la ligne « Aucune donnée personnelle stockée » de `avant-lancement.md`, et le titre de l'ADR 0050 (« sans donnée personnelle nouvelle » serait juste).

### « L'adresse n'est jamais conservée » vaut pour notre base, pas pour nos sous-traitants

- **Scaleway Transactional Email** reçoit l'adresse en clair pour l'envoi. Sa durée de conservation des e-mails envoyés (destinataire, objet, voire corps) n'est pas documentée publiquement, d'après ma recherche. Un comparateur concurrent annonce 31 jours, sans source. Comme le corps contient un code et un lien de connexion à usage unique, vérifier aussi si ce corps est conservé.
- **Serverless Containers, Edge Services et Cockpit** peuvent journaliser des adresses réseau côté Scaleway, même si l'API n'en écrit aucune. Les journaux Cockpit sont conservés une semaine par défaut, d'après la page de tarifs.
- **À faire** : demander à Scaleway les durées exactes (TEM, journaux d'accès d'Edge Services, Cockpit), et vérifier sa liste de sous-traitants ultérieurs. La politique de confidentialité indique ensuite la position réelle.

### La loi n'impose pas, à ma connaissance, l'affichage des probabilités

L'ADR 0036 justifie l'affichage de la chance à 0 % par « la loi impose d'afficher toutes les probabilités d'un tirage aléatoire ». Je n'ai trouvé **aucun texte français** qui l'impose pour un jeu gratuit. Les obligations connues viennent d'ailleurs :

- les règles des magasins d'applications (Apple et Google exigent les probabilités des coffres payants) ;
- les engagements de Sony, Microsoft et Nintendo (2019) ;
- la classification PEGI, qui donne au moins PEGI 16 aux jeux qui vendent des objets aléatoires payants, depuis juin 2026.

La décision reste bonne, comme loyauté envers le joueur et en prévision des magasins et de la boutique. Seule sa justification est à corriger : « bonne pratique et exigence des magasins », sauf si le conseil trouve un texte.

## 2. Écarts que le code prouve

| Constat | Preuve | Règle |
|---|---|---|
| Un invité ne peut pas effacer sa partie côté serveur | `DELETE /compte` répond `403` « Partie invitée : aucun compte » (`compte.rs`) ; la réinitialisation n'existe que hors production | Droit à l'effacement (RGPD art. 17) : vider le stockage du navigateur laisse la partie en base jusqu'à 6 mois |
| Aucune information sur les données là où l'adresse est saisie | `Connexion.tsx` : ni lien vers une politique de confidentialité, ni vers des CGU | Information au moment de la collecte (art. 13) |
| Pas de lien vers le code source dans l'application | Réglages › Licences : une phrase, sans lien vers le dépôt ni vers les textes des licences | AGPL §13 : offrir le code source aux utilisateurs du service en ligne. Le titulaire n'est pas lié par sa propre licence, mais les contributions extérieures le sont, et c'est l'esprit de l'ADR 0017. Le dépôt `EtymoLogique/App` est public |
| Données sans durée de conservation | `ouverture_pli` n'est jamais purgée ; un compte n'est jamais effacé automatiquement (`purges.rs`) | Limitation de la conservation (art. 5.1.e). Une durée doit être fixée et justifiée |
| Aucun export | aucune route ne rend les données d'un joueur | Droits d'accès et de portabilité (art. 15 et 20). Une procédure manuelle suffit, avec une adresse de contact |
| Aucune adresse de contact du responsable dans l'application | Réglages | Art. 13, mentions légales (LCEN) |

Remarques sur ces écarts :

- **Effacement d'un invité** : le correctif est petit. Il suffit d'autoriser `DELETE /compte` pour une partie invitée (même confirmation `SUPPRIMER`), ou d'ajouter une entrée « Effacer cette partie » dans les Réglages.
- **Comptes inactifs** : sans adresse conservée, le jeu ne peut pas prévenir un joueur avant d'effacer son compte. Deux voies sont possibles. La première efface les comptes inactifs depuis une durée longue et annoncée dans les CGU et dans la politique, par exemple 3 ans : c'est l'usage que recommande la CNIL pour les comptes inactifs, à confirmer. La seconde garde les comptes, avec une justification écrite. La première est plus sûre.
- **Accès et portabilité** : un joueur qui écrit depuis son adresse se retrouve par l'empreinte HMAC. Il faut tout de même vérifier qu'il contrôle bien l'adresse, par exemple par une demande de code, avant de lui envoyer ses données.

## 3. Bloquant avant la bêta ouverte (janvier 2027)

La bêta est en production et ouverte à tous. Elle compte donc comme une mise à disposition publique, même si elle est gratuite.

### Mentions légales (LCEN, art. 6 III)

Il faut une page accessible depuis l'application et depuis la vitrine de `index.html`. Elle indique :

- **l'éditeur**. Le choix entre personne physique et SAS (création prévue en M1, 1 400 €) décide de ce qui est publié. Une SAS publie sa dénomination, son siège, son SIREN et son capital. Une personne physique non professionnelle peut garder l'anonymat en confiant son identité à l'hébergeur, mais ce régime ne convient pas à une activité commerciale. **Créer la SAS avant la bêta** évite de publier une adresse personnelle ;
- le **directeur de la publication** ;
- un **contact** : une adresse e-mail suffit, par exemple `contact@etymologique.fr` ;
- l'**hébergeur** : Scaleway SAS, avec son adresse et son téléphone.

### Politique de confidentialité (RGPD art. 12 à 14)

Elle peut tenir sur une page, parce que les traitements sont peu nombreux. Contenu attendu :

| Traitement | Données | Base légale proposée | Durée |
|---|---|---|---|
| Partie invitée | identifiant d'installation, empreinte du secret, progression, dates d'activité | exécution du service demandé (art. 6.1.b) | 6 mois sans activité |
| Compte | empreinte HMAC de l'adresse, pseudo (privé tant qu'il n'est pas confirmé), appareils | exécution du contrat (6.1.b) | à fixer (voir § 2) |
| Envoi du code de connexion | adresse en clair, le temps de l'envoi ; défi en empreintes | exécution du contrat | 1 jour pour le défi ; durée chez Scaleway TEM à vérifier |
| Sécurité et limitation de débit | adresse réseau, en mémoire seulement | intérêt légitime (6.1.f) | durée de vie de l'instance ; journaux Scaleway à vérifier |
| Historique des commandes, quêtes et ricochets du jour | identifiant, contenu de la commande | exécution du contrat (idempotence et support) | 30 jours |
| Historique des plis | brique tirée, règle, date | intérêt légitime (diagnostic de l'équilibrage) | à fixer |
| Statistiques de rétention | agrégats sans identifiant, seuil de 50 | intérêt légitime | anonymes, durée libre |

Elle mentionne aussi :

- le **destinataire** : Scaleway (hébergement et envoi d'e-mails), en France, sans transfert hors de l'Union. GitHub, aux États-Unis, ne reçoit que le code et aucune donnée de joueur : il n'a pas à figurer ;
- les **droits** et leur exercice (adresse de contact) ;
- le droit de **réclamation auprès de la CNIL** ;
- le **stockage sur l'appareil**, décrit plus bas ;
- le **pseudo par défaut**, tiré de l'adresse.

### Stockage sur l'appareil : pas de bandeau à ce stade

Aujourd'hui, la PWA écrit seulement :

- l'identifiant et le secret d'installation dans IndexedDB (`profil.ts`) ;
- le cache de la partie dans IndexedDB (`local.ts`) ;
- les réglages dans `localStorage` (`reglages.ts`) ;
- le cache du service worker.

Ce sont tous des traceurs **strictement nécessaires** au service demandé (art. 82 de la loi Informatique et Libertés) : ils sont dispensés de consentement, mais doivent être décrits dans la politique. **Aucun bandeau n'est nécessaire** tant que la télémétrie n'est pas active. Il n'y a ni police, ni script, ni image chargés depuis un tiers : les polices sont celles du système, l'e-mail n'a pas d'image distante, et `index.html` porte `no-referrer`.

### CGU légères

Rien n'impose formellement des CGU à un service gratuit. Mais les comptes créent une relation contractuelle, et plusieurs règles du jeu doivent être opposables aux joueurs :

- le compte est facultatif, et le service est fourni en bêta, sans garantie de disponibilité ;
- **les objets du jeu** (briques, encre, sabliers, plis) n'ont aucune valeur monétaire, ne se cèdent pas et ne s'échangent pas contre de l'argent. Cette clause tient aussi le jeu hors du régime JONUM ;
- l'**équilibrage peut changer** (ADR 0009, ADR 0048 : « les paramètres peuvent changer en cours de route ») ;
- la **perte de la partie invitée** : 6 mois sans activité, ou stockage du navigateur effacé ;
- le **remplacement de la partie invitée** par celle du compte, à la connexion ;
- l'effacement des comptes inactifs, si la durée du § 2 est retenue ;
- les **règles du pseudo** : interdiction d'usurper une identité, d'insulter ou de tromper, et droit de le modifier ou de le refuser ;
- les **licences**. Les CGU **ne doivent pas interdire de copier le contenu** : il est sous CC BY-SA 4.0 (ADR 0017). Seuls le nom et le logo sont réservés ;
- la **loi française**, la juridiction, et la médiation dès qu'il y aura des ventes.

**Acceptation** : un invité n'accepte rien aujourd'hui, donc les CGU ne lui sont pas opposables. Le moment naturel est la création du compte : une ligne sous le champ d'adresse de `Connexion.tsx`, « En créant un compte, vous acceptez les CGU et la politique de confidentialité », avec les deux liens (L4, L5). Pour les invités, un lien permanent dans les Réglages et sur la vitrine suffit pour l'information.

### Documentation interne

- **Registre des traitements** (art. 30) : l'exemption des structures de moins de 250 personnes ne joue pas pour un traitement permanent. Un tableau, comme celui de la politique, suffit.
- **Accord de sous-traitance avec Scaleway** (art. 28) : il fait partie de ses conditions générales. Il suffit de l'archiver et de vérifier qu'il couvre TEM.
- **Procédure de violation de données** : notification à la CNIL sous 72 h (art. 33), et registre des incidents. Une fuite de la base livrerait peu (aucune adresse), mais la perte de la clé HMAC ou de la clé de signature compte comme un incident.
- **Analyse d'impact (AIPD)** : a priori non requise, faute de profilage, de données sensibles ou de surveillance à grande échelle. À reconsidérer si le public scolaire visé par l'étude de marché arrive (mineurs, personnes vulnérables).

### Mineurs

Un jeu sur la langue française attirera des collégiens et des lycéens, et l'étude de marché envisage une offre pour les écoles.

- Avec la base « exécution du contrat », l'âge de 15 ans de l'article 45 de la loi Informatique et Libertés ne s'applique pas directement : il vise le consentement. Mais l'information doit être **compréhensible par un mineur** (art. 12), et la CNIL publie des recommandations sur les mineurs en ligne.
- L'offre pour les écoles changerait la donne : contrat avec l'établissement, rôle de responsable ou de sous-traitant, données d'élèves. Elle demande une revue dédiée.

### Droits d'auteur des prestataires (souvent oublié)

Le plan financier prévoit une direction artistique, des jaquettes, des silhouettes et des rédacteurs payés au fascicule. En France, une cession de droits d'auteur doit être **écrite et détaillée** (CPI, art. L131-3) : droits cédés, étendue, destination, lieu et durée. **Sans cession, ces œuvres ne peuvent pas être publiées sous CC BY-SA**, et le prestataire garde ses droits. Il faut une clause de cession, ou de licence CC BY-SA, dans chaque contrat de prestation, **avant la première livraison**. Pour le logo, il faut une cession complète, nécessaire au dépôt de la marque à l'INPI (prévu en M1).

### Sources du catalogue

- Wikidata (éléments et lexèmes, prononciations comprises depuis l'ADR 0060) est sous **CC0** : aucune attribution n'est exigée. La citer reste une courtoisie, déjà faite dans `llms.txt`.
- Si des transcriptions extraites de Wiktextract (ADR 0055 avant l'ADR 0060) restent dans le catalogue, elles viennent du Wiktionnaire, sous CC BY-SA : il faut alors une **attribution** dans la liste des sources du fascicule.
- Les gloses et explications du catalogue sont sous CC BY-SA 4.0. L'application doit afficher la licence, ce qu'elle fait, avec un **lien** vers son texte.
- Les dépendances de la PWA (React, idb-keyval…) sont sous licence MIT, qui demande de garder leur notice dans les copies. Vérifier que le build ne la supprime pas, ou publier une page des licences tierces.

## 4. Bloquant avant la télémétrie (J7, écart E3 de l'audit avant lancement)

La télémétrie prévue (ADR 0010, 0050) porte un identifiant pseudonyme renouvelé chaque mois civil. Ni ces ADR ni la roadmap ne disent **où il vit**, et c'est ce qui décide du régime :

- **identifiant dérivé côté serveur** (par exemple une empreinte de l'identifiant d'installation et du mois) : le serveur voit déjà chaque fusion, indice et pli, puisqu'il fait foi. Rien de nouveau n'est lu ni écrit sur l'appareil pour la mesure. L'article 82 pourrait alors ne pas s'appliquer, et seules resteraient les obligations du RGPD : intérêt légitime, information et opposition. **C'est la voie la plus simple, à faire confirmer par le conseil** ;
- **identifiant écrit sur l'appareil** : c'est un traceur au sens de l'article 82, et il faut soit l'exemption, soit le consentement.

Pour un identifiant écrit sur l'appareil, deux voies s'offrent :

- **l'exemption de consentement pour la mesure d'audience**, selon les lignes directrices de la CNIL d'octobre 2020. Ses conditions : finalité limitée à la mesure d'audience de l'éditeur, statistiques anonymes en sortie, aucun recoupement ni suivi d'un site à l'autre, aucun partage avec un tiers, traceur de 13 mois au plus, données conservées 25 mois au plus, information et droit d'opposition. Le design actuel semble compatible : identifiant d'un mois, tables internes, 90 jours de télémétrie brute, agrégats seuillés. Mais il faut confirmer que la mesure des fusions, des indices et des plis entre bien dans la « mesure d'audience » au sens de la CNIL, et pas dans l'analyse de comportement, qui demande le consentement. **À faire valider en priorité** ;
- sinon, le **consentement**, avec un choix aussi simple à refuser qu'à accepter.

Dans les deux cas, il faut :

- un texte d'information ;
- un **interrupteur d'opposition** dans les Réglages ;
- une mise à jour de la politique et du registre.

## 5. Plus tard : pseudos visibles par d'autres joueurs

Dès qu'un pseudo est montré à d'autres joueurs, le jeu héberge un contenu fourni par ses utilisateurs. Le règlement sur les services numériques (DSA) impose alors, **même aux petites structures** :

- des points de contact (art. 11 et 12) ;
- des conditions d'utilisation qui décrivent la modération (art. 14) ;
- un mécanisme de signalement (art. 16) ;
- une motivation des décisions de modération (art. 17).

Il faut aussi des règles de modération des pseudos, déjà prévues par l'ADR 0070, et une réflexion sur le pseudo par défaut, qui peut contenir un nom.

## Écarts et issues de suivi (créées le 2026-10-14)

| N° | Titre proposé | Échéance | Gravité | Issue |
|---|---|---|---|---|
| L1 | Corriger « aucune donnée personnelle » dans l'audit avant lancement et dans l'ADR 0050 | maintenant | faible | [Design#29](https://github.com/EtymoLogique/Design/issues/29), [App#71](https://github.com/EtymoLogique/App/issues/71) |
| L2 | Créer la SAS avant la bêta, ou choisir le régime de l'éditeur | bêta | bloquant | [Design#35](https://github.com/EtymoLogique/Design/issues/35) |
| L3 | Rédiger et publier les mentions légales | bêta | bloquant | [App#64](https://github.com/EtymoLogique/App/issues/64) |
| L4 | Rédiger et publier la politique de confidentialité, avec un lien sous le champ d'adresse de `Connexion.tsx` | bêta | bloquant | [App#65](https://github.com/EtymoLogique/App/issues/65) |
| L5 | Rédiger et publier des CGU légères (objets sans valeur et non cessibles, équilibrage, perte de la partie invitée, pseudo, licences) | bêta | bloquant | [App#66](https://github.com/EtymoLogique/App/issues/66) |
| L6 | Permettre à un invité d'effacer sa partie côté serveur | bêta | moyen | [App#67](https://github.com/EtymoLogique/App/issues/67) |
| L7 | Fixer la durée de conservation des comptes inactifs et de `ouverture_pli`, puis les purger | bêta | moyen | [Design#30](https://github.com/EtymoLogique/Design/issues/30), [App#68](https://github.com/EtymoLogique/App/issues/68) |
| L8 | Ajouter une adresse de contact et une procédure d'accès et de portabilité | bêta | moyen | [App#69](https://github.com/EtymoLogique/App/issues/69) |
| L9 | Réglages › Licences : liens vers le dépôt public, vers l'AGPL et la CC BY-SA, et notices des dépendances | bêta | moyen | [App#70](https://github.com/EtymoLogique/App/issues/70) |
| L10 | Obtenir de Scaleway les durées de conservation (TEM, Edge Services, Cockpit) et archiver l'accord de sous-traitance | bêta | moyen | [Infra#11](https://github.com/EtymoLogique/Infra/issues/11) |
| L11 | Tenir le registre des traitements et la procédure de violation de données | bêta | moyen | [Design#37](https://github.com/EtymoLogique/Design/issues/37) |
| L12 | Ajouter une clause de cession de droits (ou de licence CC BY-SA) dans chaque contrat de prestataire, logo compris | avant la première livraison | bloquant | [Design#36](https://github.com/EtymoLogique/Design/issues/36) |
| L13 | Vérifier l'attribution des transcriptions venues de Wiktextract, s'il en reste | bêta | faible | — (aucune trace de Wiktextract dans Content au 2026-10-14) |
| L14 | Corriger la justification de l'ADR 0036 (bonne pratique, pas obligation légale) | maintenant | faible | [Design#29](https://github.com/EtymoLogique/Design/issues/29) |
| L15 | Décider où vit l'identifiant de télémétrie (serveur ou appareil) et faire valider le régime (RGPD seul, exemption CNIL ou consentement) ; information et opposition dans les Réglages (complète E3) | J7 | bloquant | [Design#31](https://github.com/EtymoLogique/Design/issues/31) |
| L18 | Revue DSA et modération des pseudos avant tout affichage public | vue compétitive | bloquant | [Design#34](https://github.com/EtymoLogique/Design/issues/34) |

## Sources consultées (secondaires, à confirmer)

- Exemption CNIL pour la mesure d'audience : [fiche CNIL (Piwik)](https://Cnil.fr/sites/cnil/files/atoms/files/exemption_pour_la_mesure_daudience_sans_consentement_piwik.pdf), [Taylor Wessing](https://www.taylorwessing.com/fr/insights-and-events/insights/2020/10/french-data-protection-authority-publishes-new-guidelines)
- Scaleway TEM : [suivi dans Cockpit](https://www.scaleway.com/en/docs/transactional-email/how-to/monitor-transactional-email-cockpit.md), [tarifs Cockpit](https://www.scaleway.com/en/pricing/managed-services/), [AhaSend (chiffre non sourcé)](https://ahasend.com/scaleway-alternative)
