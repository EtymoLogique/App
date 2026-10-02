# Roadmap de l’application jusqu’au MVP

Cette roadmap découpe le périmètre du MVP ([game-design](https://github.com/lunik/EtymoLogique/blob/master/docs/game-design.md#périmètre-du-mvp)) en jalons livrables. Elle suit un principe de **squelette ambulant** : une tranche verticale fine, PWA → API → base → catalogue publié, déployée en hors-prod dès le jalon 0. Chaque jalon suivant enrichit cette tranche d’une fonctionnalité jouable.

Chaque jalon se termine par une démonstration en hors-prod (`develop`, [ADR 0028](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0028-gitflow-des-depots.md)).

## Vue d’ensemble

| Jalon | Objectif | Démonstration | Dépend de |
|---|---|---|---|
| **J0 — Socle et squelette ambulant** | Outillage, CI/CD, contrat généré, profil invité, lecture du catalogue publié, tâche de parution | La PWA installable crée un profil invité et affiche les fascicules parus, lus dans `public/index.json` | Infra : activer `api`, `base`, `taches` ; variables de la PWA |
| **J1 — Table de fusion et réserve** | Réserve de départ, commande `fusion` transactionnelle et idempotente, prévisualisation, retours succès, déjà connue, presque, échec, fiche de découverte, projection dans IndexedDB | Un joueur réalise les trois premières découvertes du fascicule 0 | Content : graines (réserve de départ) |
| **J2 — Codex** | Vues et filtres (langue, famille, fonction, récent), cartes et silhouettes, fiches, cartes de langue, compteurs par fascicule, légendaires invisibles | Codex navigable, cohérent avec la réserve | Content : silhouettes |
| **J3 — Énergie et plis** | Énergie à 2 charges, une toutes les 12 h, à l’horloge du serveur ; `ouvrir_pli` (aléa cryptographique, raretés, poids, garantie au 6ᵉ pli, filet au 5ᵉ) ; doublons et encre ; historique ; écran des plis et chances ; rituel d’ouverture | Boucle fusion ↔ pli jouable sur plusieurs jours | Content : poids et raretés du pli |
| **J4 — Encre, sabliers, indices, jalons** | Sabliers (10 gouttes, échangés à la boutique sans plafond, détenus sans plafond, [ADR 0039](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0039-plafonner-l-achat-des-sabliers-pas-leur-usage.md)), indices (5, 10, 20, 40 puis 80 gouttes, [ADR 0038](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0038-indices-a-prix-croissant-et-format-des-jalons.md)), jalons et plis déterministes | Économie complète du MVP, sans achat | Content : jalons |
| **J5 — Première session** | Onboarding guidé, règle d’amorçage, réglages (thème, locale, mouvement réduit), accessibilité clavier et lecteur d’écran | Un nouveau joueur termine le tutoriel sans aide | Validation d’atteignabilité et d’amorçage (étape 5 du pipeline) |
| **J6 — Hors connexion et évolutions du catalogue** | Stratégie du service worker (une PWA qui n’est plus alignée sur la version déployée se recharge d’elle-même, sans attendre un second chargement), consultation seule hors connexion ([ADR 0041](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0041-hors-connexion-consultation-seule.md)), `409` puis resynchronisation, migrations de progression à la parution | Un 2ᵉ fascicule paraît sans casser les parties en cours ; hors connexion, consultation seule (ADR 0041) | Content : fascicule Bêta 2 |
| **J7 — Observabilité et vie privée** | Télémétrie pseudonyme (identifiant renouvelé tous les 30 jours), indicateurs minimaux du game-design, agrégats, purges quotidiennes, journaux structurés sans PII | Tableau des indicateurs en hors-prod | Infra : Cockpit, tâches planifiées |
| **J8 — Durcissement et lancement** | CSP et en-têtes par le CDN, limites de débit, audits, démarrage à froid sous 1 s au p95, domaine, tests utilisateurs, `v1.0.0` | MVP en prod | Infra : CDN, domaine ; Content : fascicule 1 relu (`--publication`) |

Hors MVP, comme le prévoit le game-design : paiements, comptes et multi-appareil (un ADR préalable est requis, [ADR 0007](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0007-etat-et-economie-autoritaires.md)), fonctions sociales, contenu communautaire.

## J0 — Socle et squelette ambulant

| Tâche | État |
|---|---|
| Dépôt : licences, README, AGENTS.md, cette roadmap ; branche `master` | fait ; `develop` à créer après le premier commit |
| Workspace Cargo : `domaine`, `catalogue`, `contrat`, `taches`, `api` | fait |
| Contrat : types Rust → `contrat/openapi.json` → types TypeScript, dérive contrôlée en CI | fait |
| Base : Docker Compose local, migrations sqlx `joueur`, `commande`, `reglage` | fait |
| API : configuration, `/sante`, catalogue en mémoire relu toutes les 60 s, journaux sans PII, validation stricte, CORS | fait |
| Profil invité : `POST /session`, empreinte du secret, jeton de 15 min, `GET /etat`, limites de débit | fait |
| Tâche de parution : `staging/` → `public/`, index en dernier, idempotente | fait |
| PWA : coque, service worker, profil dans IndexedDB, session, fascicules parus | fait |
| CI/CD : contrôles de PR, `develop` → hors-prod, tags → prod | fait |
| Premier déploiement hors-prod | à faire, avec le dépôt Infra (voir ci-dessous) |

### Ce qu’il faut du dépôt Infra pour le premier déploiement

- Poser dans les environnements GitHub d’App les variables `ETYMO_URL_API` (adresse de l’API) et `ETYMO_URL_CATALOGUE` (préfixe `public/` du catalogue), que la PWA compile.
- Donner une valeur au secret `api-cle-signature-session` (32 octets aléatoires au moins) et l’exposer à l’API dans `ETYMO_CLE_SIGNATURE_SESSION`.
- Exposer à l’API et à la tâche `purges` l’adresse de la base dans `DATABASE_URL`, et à l’API l’origine de la PWA dans `ETYMO_ORIGINES_PWA`.
- Exposer à la tâche `parution` le bucket du catalogue dans `ETYMO_BUCKET_CATALOGUE` (et `ETYMO_S3_POINT` hors `fr-par`).
- Activer `api`, `base` et `taches` avec l’image épinglée que publie le workflow *Deploy* (`…/api@sha256:…`).

## J1 — Table de fusion et réserve

| Tâche | État |
|---|---|
| Graines déclarées par le fascicule, validées et compilées dans le manifeste (dépôt Content, [ADR 0030](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0030-reserve-de-depart-par-fascicule.md)) | fait |
| Catalogue en mémoire : recettes, exclusions, cartes, graines | fait |
| Résolution d’une fusion (`etymo_domaine::fusion`) : découverte, connue, exclue, presque (ordre, incomplet), échec | fait |
| Migrations : `exemplaire`, `decouverte`, `mouvement`, `graine_accordee` | fait |
| `GET /etat` accorde les graines une fois ; `POST /fusion` transactionnelle et idempotente, `409` si l’état ou le catalogue est périmé | fait |
| PWA : réserve (×n, posée, épuisée), table ordonnée (glisser-déposer, boutons, clavier), prévisualisation démentie au besoin par le serveur, fiche de découverte, liste des découvertes | fait |
| Projection confirmée et table en cours gardées dans IndexedDB | fait |
| Écran dans l’URL (`#/codex/unt_…?type=mot`) : un rechargement ou le bouton Précédent ramène au même onglet, aux mêmes filtres et à la même carte ouverte | fait |
| Coque de l’application (I-01) : quatre destinations Table, Plis, Codex, Réglages (ordre changé le 28 septembre) ; barre d’onglets sur mobile, rail au-delà de 1 100 px ; compteur Corail des nouveautés | fait |
| Conformité aux maquettes I-09 à I-13 : en-tête d’écran (mots trouvés, accès au codex) ; réserve avec recherche, filtres et tri par briques récentes ; un clic ou un toucher pose la brique, glisser-déposer, flèches et Suppr sur les cases ; table de deux cases (jamais plus de deux briques à la fois) ; retours en ligne (« presque » avec Inverser, rappel du mot déjà découvert, refus doux par une secousse amortie et découverte (briques qui s’emboîtent en un mot), voir « Animations retenues ») ; fiche en trois temps en dialogue, plein écran sur mobile ; état « Aucun mot possible » ; contrôle `visual-identity-check` sans écart | fait |
| Réserve sans découverte possible (I-13) : état vide qui mène aux plis | fait |
| Réserve en modale (issue #9) : cachée par défaut ; toucher une case vide ou le bouton « Réserve » l’ouvre, la brique choisie se pose sur cette case (ou la plus à gauche) ; focus piégé, `Échap`, retour du focus | fait ; maquette I-09 du dossier design à aligner |
| Réserve fluide : la modale reste ouverte tant qu’une case est libre et se ferme d’elle-même table complète, focus sur « Fusionner » ; table en petit dans la modale (case visée, brique qui s’y pose, retrait d’un toucher), consigne « Choisissez la 1ʳᵉ / 2ᵉ brique » et annonce pour les lecteurs d’écran, pastille ×n qui rebondit ; les briques tombent sur la table une fois le voile levé | fait ; maquette I-09 du dossier design à aligner |
| Réglages du MVP en cours (I-24) : apparence (système, atelier, nocturne), animations réduites, profil, licences | fait |
| Gestes de la table ([ADR 0033](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0033-gestes-de-la-table-de-fusion.md)) : un toucher pose, table pleine sans effet, chaque brique garde sa case ; « Continuer » range la carte vers l’onglet Codex ; plus d’anneau Corail ni de découvertes récentes sur la table | fait |
| Fond de l’application tramé (`jeu.html`) sur tous les écrans | fait |
| Démonstration : les trois premières découvertes du fascicule 0 (géologie, biologie, amener) avec ses graines | faite en local |

Reportés : file d’attente des fusions hors connexion (supprimée, ADR 0041), indices (« Voir un indice », I-12) (J4), écran des plis (J3), indices payants (J4), sons et vibrations (J5).

## J2 — Codex (validé le 27 septembre 2026)

| Tâche | État |
|---|---|
| Vue globale conforme à `codex.html` : complétude par fascicule, filtres par type, tri, petites cartes à bandeau, texture (silhouette), rareté dans le bandeau, carte nouvelle en Corail, cartes à trouver en silhouette avec leur piste | fait |
| Carte agrandie : recto (mot surligné, langue, définition, équation, sens littéral, confiance) et verso (formes trouvées, composants ou mots formés), précédente et suivante au clavier | fait |
| Légendaires inconnues et mots qui en dépendent absents du codex, hors des compteurs (ADR 0015) | fait |
| Liens entre cartes qui se font référence (morceaux du mot, composants, langue, formes, mots formés), vers les seules cartes découvertes, avec fil d’Ariane ; ni lien ni animation sur ce qui reste à découvrir | fait |
| Textures insérées depuis les silhouettes publiées (teinte et évidements), reconstruites par la même liste blanche que Content ; lettre emblème et nom des cartes de langue (champ `glyphe` des langues) ; jaquette de chaque fascicule dans son filtre | fait |
| Filtres, tri et carte ouverte dans l’adresse ([ADR 0034](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0034-ecran-dans-l-adresse.md)) | fait |
| Recherche parmi les seules cartes trouvées, par forme ou par sens (I-17), raccourci « / », jamais dans l’adresse | fait |
| Vues Tout, Récentes, Familles et Objectifs, tenues dans l’adresse (`vue=`) ; familles déduites des recettes : les mots formés sur une brique trouvée | fait |
| Onglet Objectifs (I-18) : familles à compléter avec leur détail, langues rencontrées | fait ; jalons ajoutés en J4 |
| « En savoir plus » (I-16) : chemin des langues, relations, transformations, certitude et sources citées ; dépliée depuis la carte du codex (`plus=1`) | fait (Content publie les types de relation et de transformation dans les référentiels) |

### Exigence reportée à J6

- **Version déployée, version affichée.** Après le déploiement de J2 en hors-prod, le navigateur a d’abord servi l’ancienne PWA depuis le cache du service worker : il a fallu recharger une seconde fois (`registerType: 'autoUpdate'` sans rechargement de la page). Quand le service worker sera traité, une PWA qui n’est plus alignée sur ce qui est déployé doit forcer un rechargement, immédiatement, sans compter sur un second chargement ni sur la fermeture des onglets. Une table en cours reste sauvegardée dans IndexedDB et survit à ce rechargement.
  **Fait, avancé de J6** ([ADR 0037](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0037-ecran-de-mise-a-jour-de-la-pwa.md)) : `registerType: 'prompt'` ; à l’ouverture de la page, puis chaque minute, au retour sur l’onglet et au retour du réseau, le navigateur relit `sw.js` sur le CDN (jamais l’API, qui reste à zéro). Une nouvelle version s’installe en attente et un écran plein bloque le jeu jusqu’à « Mettre à jour », qui l’active et recharge tous les onglets.

## J3 — Énergie et plis (en cours)

| Tâche | État |
|---|---|
| Équilibrage versionné (Content, `ludique/equilibrage.json`, version `2026-09-28b`) recopié dans le `pli` de chaque manifeste, avec la nature de chaque brique | fait |
| Énergie : 2 charges, une toutes les 12 h, à l’horloge du serveur ; le temps s’arrête à 2 / 2 | fait |
| `POST /pli` : aléa cryptographique (rejet sans biais), garantie au 6ᵉ pli, filet au 5ᵉ (le filet passe avant), transactionnel et idempotent, `409` si périmé, `403` sans charge | fait |
| Pli d’affixes pondéré par la seule rareté ([ADR 0035](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0035-plis-d-affixes-ponderes-par-la-rarete.md)) : préfixes et suffixes seulement, jamais un mot ; plus de poids de type ni de répartition par classe | fait |
| Doublons et encre : 2 gouttes par pli, barèmes du doublon et de la réserve pleine ; chaque variation dans `mouvement` | fait |
| Historique des plis (`ouverture_pli`, les 20 derniers dans l’état) | fait |
| Écran des plis : choix du fascicule (I-19) et atelier (I-20) ; carte « Plis en attente » commune aux deux écrans (jaquette par pli prêt, pli en pointillés avec anneau et compte à rebours) ; chances par rareté (légendaire toujours affichée), par type et par brique, légendaires inconnues regroupées ; garanties, encre ; briques du fascicule (compteur connues / total) et derniers tirages repliables ; règles ; compteur de plis prêts sur l’onglet | fait |
| Légendaires à chance fixe de 1,2 % par pli, hors garanties (ADR 0043, App#17) : paramètre `chance_legendaire_pour_mille` (partagé entre les légendaires du fascicule, poids des autres raretés sur les 98,8 % restants), garanties de nouveauté et d’utilité limitées aux non-légendaires, garantie lointaine au 100ᵉ pli d’affilée sans légendaire (compteur par fascicule, règle `garantie_legendaire`), une seule ligne « Légendaires » à l’écran des plis ; reste à Content : au moins une légendaire par fascicule, jamais dans les graines ni les plis de jalon | fait côté App |
| Rituel d’ouverture (I-21) : charge, écriture, explosion, révélation (≈ 1,6 s), passable, direct en mouvement réduit ; repris dans « Animations retenues » | fait |
| Recette locale (filet, garantie, réserve pleine, `409`, mouvement réduit, onglets) et corrections | fait |
| Navigation : Table, Plis, Codex, Réglages | fait |
| Déploiement hors-prod : PWA, catalogue (`988a1c0b8eed`) et documentation publiés | fait |
| Image J3 de l’API et des tâches épinglée dans Infra (`ae1cd64`), *Plan* relancé après la panne Scaleway (`503`), *Apply* horsprod | fait |
| Démonstration en hors-prod (API, 28 septembre) : profil invité, deux plis (doublon, encre), `403` sans charge et prochaine charge à +12 h, fusion puis découverte, historique des plis | fait |

### Décisions ouvertes de J3

- ~~**Mot ingrédient**~~ : un mot qui sert d’ingrédient (*biologie*, *mener*) ne sort pas d’un pli (ADR 0035). Sa découverte offre sa brique, qui ne se consomme jamais (rendue à la synchronisation si elle manque), déclaré par `mots_briques` dans le manifeste ; le catalogue doit être republié, et les mots déjà découverts n’en rétroagissent pas.
- ~~**Légendaires à 0 %**~~ : tranché par l’[ADR 0036](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0036-chances-des-legendaires-toujours-affichees.md) : la loi impose d’afficher toutes les probabilités, la ligne reste même à 0 % ; le secret porte sur le nombre et la nature des légendaires.

## J4 — Encre, sabliers, indices, jalons (fait)

| Tâche | État |
|---|---|
| ADR 0038 : prix des indices doublé à chaque niveau, format des jalons (une condition : n découvertes dans le fascicule ; un pli déterministe et/ou des sabliers) | fait (Design) |
| Content : `jalons` dans le fascicule, schéma et contrôles, recopiés dans le manifeste ; deux jalons d’essai au fascicule 0 (3 découvertes : pli ; 6 : 2 sabliers) | fait |
| Domaine : `Energie::avancer`, `sablier` (répartition, plafonds), `indice` (barème), `jalon::atteints` | fait |
| Base : tables `sablier`, `indice`, `jalon_atteint` | fait |
| `POST /sablier/achat` : 10 gouttes le sablier, sans plafond, `403` sans assez d’encre ; `POST /sablier` : sabliers détenus seulement, sans plafond, `403` énergie pleine ou sabliers insuffisants ; idempotents (ADR 0039) | fait |
| `POST /indice` : niveau suivant seulement (`400`), recette inconnue ou légendaire (`400`), découverte (`409`), encre (`403`) | fait |
| Jalons accordés dans la découverte et à la synchronisation (`GET /etat`) ; pli de jalon (`ouverture_pli` d’origine `jalon`, règle `deterministe`), encre si réserve pleine ; sabliers sans plafond | fait |
| PWA : onglet Boutique (`#/boutique`) avec les échanges (encre contre sabliers, lots de 1, 3 et 12, sans plafond) et l’achat de gouttes en euros « Bientôt ouvert », verrouillé ; raccourci sous les plis en chargement (« Faire avancer le temps avec des sabliers », sinon « Acheter des sabliers », qui ouvre les trois lots de la boutique et avance le temps d’un seul clic) ; ressources (plis prêts, gouttes, sabliers) dans la navigation, compteurs animés, gouttes et nouveautés affichées après le rituel du pli ; feuille des indices depuis la table ; jalons dans l’onglet Objectifs ; jalon annoncé dans la fiche de découverte | fait |
| Recette locale : 3 découvertes → pli de jalon (philo-, -iste) ; 3 sabliers → recharge −3 h ; indices 1 → 5 : 200 → 45 gouttes ; Objectifs 3 / 6 | fait |
| Rareté des mots (ADR 0040, proposé) : plus haute rareté des briques de la recette la moins rare ; forme au codex et dans la fiche (« Rare ! », « Légendaire ! ») ; `encre_decouverte` de l’équilibrage créditée à la découverte | fait (Content : équilibrage `2026-09-28c`) ; 2 gouttes par découverte vérifiées en hors-prod |
| Image J4 de l’API épinglée dans Infra (`9e48455`), *Plan* puis *Apply* horsprod ; PWA `8f0dbfe03d1c` ; catalogue `d6d91be93d05` paru | fait |
| Démonstration en hors-prod (API) : 3 découvertes → jalon `jal_nde6rzt4` et pli de jalon (philo-, -iste) ; indice niveau 1 : 6 → 1 goutte ; refus `403` (encre, sabliers insuffisants), `409` (état périmé) | fait |

Écarts assumés : l’annonce du jalon passe par la fiche de découverte, pas par le rituel du pli ; la feuille des indices est un dialogue sur ordinateur comme sur mobile, pas un panneau latéral ; sur un environnement à recharge courte, un sablier vaut un douzième de la recharge (1 h en production).

## J6 — Hors connexion et évolutions du catalogue (fait en local, à déployer en hors-prod)

| Tâche | État |
|---|---|
| ADR 0041 : hors connexion, consultation seule, aucune file ni rejeu ; ADR 0001, 0007 et 0024 marqués partiellement remplacés (Design) | fait |
| PWA : bannière « consultation seulement » ; pose, déplacement, retrait, fusion, plis, sabliers, boutique et indices inertes hors ligne (garde dans `usePartie`, boutons désactivés) ; codex, fiches et réglages inchangés | fait |
| Test d’intégration : une parution rend `409` une commande neuve, la commande rejouée renvoie la même réponse, `GET /etat` accorde les graines du nouveau fascicule une seule fois et garde réserve, codex, encre | fait |
| Aucune migration de progression (commentaire de `parution.rs` renvoyé à l’ADR 0041) | fait |
| Content : fascicule Bêta 2 (`fsc_3vztseeb`, `test: true`, n° 1, parution 15 octobre 2026) : 35 mots dont 20 recettes existantes que les briques de Bêta 0 rendaient jouables (fermeture entre fascicules), 33 exclusions `rare`, jaquette, 4 graines ; faits en brouillon | fait |
| Recette locale (Chrome) : Bêta 2 et sa jaquette au choix des plis, graines reçues, hors ligne simulé (pose et boutique inertes, bannière), fusion *périmètre* en ligne | fait |

## Quêtes et récompenses à récupérer

| Tâche | État |
|---|---|
| ADR 0042 : page Quêtes, récompenses de jalon à récupérer d’un geste ; ADR 0038 marqué partiellement remplacé (Design) | proposé |
| Base : `jalon_atteint.recupere_le` (les jalons déjà accordés sont marqués récupérés), commande `jalon` | fait |
| API : la découverte et `GET /etat` marquent les jalons atteints sans rien accorder ; `POST /jalon` récupère la récompense (pli de jalon déterministe, encre si réserve pleine, sabliers), idempotente, `403` pas encore atteint, `409` déjà récupérée, `400` inconnu ; `jalons_recuperes` dans l’état | fait |
| PWA : destination Quêtes (`#/quetes`), onglets Journalières (bientôt disponibles) et Fascicules (`#/quetes/fascicules?fascicule=0`) ; sélecteur de fascicule partagé avec le codex, compteur Corail des récompenses qui attendent (navigation, onglet, fascicule) ; jalons retirés de la vue Objectifs du codex, qui renvoie aux quêtes ; « Récupérer la récompense » sous la découverte qui atteint un jalon | fait |
| Recette locale (Chromium) : 3 découvertes → jalon atteint, réserve et sabliers inchangés ; « Récupérer » → philo- et -iste, historique `deterministe` | fait |
| Hors production : « Réinitialiser » (Réglages) efface aussi les jalons atteints et récupérés ; une fois le jalon de nouveau atteint, sa récompense est à récupérer (test `la_reinitialisation_remet_les_recompenses_de_jalon_a_recuperer`) | fait |
| Quêtes journalières | à concevoir (ADR à venir) |

Compatibilité : l’API se déploie d’abord. Une PWA plus ancienne ne propose pas de récupérer, mais rien n’est perdu : la récompense attend. Une PWA à jour devant une API plus ancienne lit l’absence de `jalons_recuperes` comme « tout est récupéré ».

## Animations retenues (relevé et décisions du 2026-10-01)

Les 53 animations de `plans/todo/animations-propositions.html`, avec la version retenue pour chacune, sont dans la PWA ; vérifiées image par image (`animation-check`) pour la pose depuis la réserve, la découverte, le rituel du pli et le retournement de carte.

| Tâche | État |
|---|---|
| Jetons `--dur-instant` (120 ms), `--dur-rapide` (240), `--dur-base` (360), `--dur-lent` (480), `--dur-rituel` (1,8 s), `--ease-in` et ressort amorti `--ease-ressort` (`linear()`) dans `styles.css` | fait |
| Navigation et boutons : burger qui devient croix, sceau en coup de tampon, sections repliables qui se déplient, touche mécanique, bouton prêt (une onde puis l’ombre qui respire) | fait |
| Réserve et table : vol de la brique depuis la réserve (FLIP), pastille qui gonfle ou se contracte, case visée teintée selon la nature attendue, secousse amortie en deux forces (« presque » 300 ms, échec 500 ms), emboîtement en un mot avec traits d’éclat et lettres, « −1 » qui sèche, relève des retours | fait |
| Dialogues et codex : ouverture sobre (240 ms), zoom simple de la carte à l’ouverture, retournement physique (600 ms, ombre qui se resserre), focus à la fin du retournement, surlignage du mot qui se trace à l’ouverture d’une carte, barres remplies à l’arrivée, survols ramenés à trois gestes | fait |
| Plis : paquet posé (plus de suivi du pointeur) avec halo jaune et léger zoom au survol quand il attend, entrée posée puis cachetée, sceau qui ne pulse qu’après 3 s, cire qui chauffe, rayons écrits plus discrets, plume au rythme humain et ratures tracées à chaque ouverture, paquet qui se retourne puis révélation qui se retourne (plus de coup de sabre ni d’éclats de lettres), révélation réduite au titre, à la brique et à deux boutons (« Essayer sur la table » pose la brique à sa place), anticipation rare, accord du légendaire, jauge de garantie en crans identiques, historique (pastille « new » ou « +1 » sur la brique, grille alignée) qui n’apparaît qu’à la révélation, inconnues qui scintillent à tour de rôle, jauge d’énergie au cran sans boucle | fait |
| Compteurs : glissé court (480 ms) ; mouvement réduit : fondus de 120 ms, révélation du pli en trois temps | fait |
| Réglage « Sons et vibrations » (activés, coupés), `data-retours` sur `<html>` | fait |

## Outillage hors-prod

| Tâche | État |
|---|---|
| Réinitialisation du joueur (issue #6) : `POST /dev/reset` (route absente, `404`, sauf si `ETYMO_REINITIALISATION=true`) et bouton « Réinitialiser » des Réglages, avec confirmation ; codex vide, réserve de départ, 10 000 gouttes ; la PWA lit `reinitialisation` dans `/sante` | fait ; à activer dans Infra (horsprod seulement) |

## Décisions à formaliser

- **Contrat et outillage** : [ADR 0031](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0031-contrat-genere-et-outillage-de-la-pwa.md), proposé.
- **Table de fusion** : [ADR 0032](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0032-fusion-de-deux-briques.md) (deux briques) et [ADR 0033](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0033-gestes-de-la-table-de-fusion.md) (gestes), acceptés.
- **Écran dans l’adresse** : [ADR 0034](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0034-ecran-dans-l-adresse.md), accepté.
- **Écart à trancher** : l’[ADR 0026](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0026-depot-prive-du-catalogue-sans-logique.md) place tout le code, compilateur compris, dans un dépôt public. Or le compilateur vit dans Content, et App comme Infra sont privés.
- **Index global** : il garde les référentiels sous `referentiels`, comme le calendrier. Le [modèle de données](https://github.com/lunik/EtymoLogique/blob/master/docs/modele-donnees.md#index-global) les montre à la racine.
