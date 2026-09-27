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
| **J4 — Encre, sabliers, indices, jalons** | Sabliers (1 goutte, 12 par 24 h, 36 détenus au plus), indices (30 gouttes), jalons et plis déterministes | Économie complète du MVP, sans achat | Content : jalons |
| **J5 — Première session** | Onboarding guidé, règle d’amorçage, réglages (thème, locale, mouvement réduit), accessibilité clavier et lecteur d’écran | Un nouveau joueur termine le tutoriel sans aide | Validation d’atteignabilité et d’amorçage (étape 5 du pipeline) |
| **J6 — Hors connexion et évolutions du catalogue** | Stratégie du service worker, commandes en attente rejouables, `409` puis resynchronisation, migrations de progression à la parution | Un 2ᵉ fascicule paraît sans casser les parties en cours ; jeu hors connexion conforme à l’[ADR 0001](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0001-pwa-responsive.md) | Content : 2ᵉ fascicule |
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

## Décisions à formaliser

- **Nouvel ADR dans le dossier de conception** : le contrat a pour source de vérité les types Rust, dont on génère l’OpenAPI puis les types TypeScript. Côté front, l’outillage est Vite avec vite-plugin-pwa. Cet ADR précise l’[ADR 0024](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0024-architecture-logicielle-et-hebergement.md).
- **Écart à trancher** : l’[ADR 0026](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0026-depot-prive-du-catalogue-sans-logique.md) place tout le code, compilateur compris, dans un dépôt public. Or le compilateur vit dans Content, et App comme Infra sont privés.
- **Index global** : il garde les référentiels sous `referentiels`, comme le calendrier. Le [modèle de données](https://github.com/lunik/EtymoLogique/blob/master/docs/modele-donnees.md#index-global) les montre à la racine.
