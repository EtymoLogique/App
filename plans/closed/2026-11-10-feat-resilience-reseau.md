# Feat — Résilience aux réseaux lents et aux micro-coupures

- Statut : closed
- Créé le : 2026-11-10
- Démarré le : 2026-11-10
- Terminé le : 2026-11-10
- Dépôts : design, app
- Branches : design → `claude/offline-network-resilience-wsnm09` ; app → `claude/offline-network-resilience-wsnm09`

## Contexte et objectif

Le propriétaire joue dans le train : réseau lent, pertes de paquets, micro-coupures. Aujourd’hui :

- `fetch` n’a aucun délai maximal (`web/src/services/api.ts`) : une requête peut pendre des dizaines de secondes ;
- aucune requête n’est retentée, et chaque essai tire une nouvelle clé de commande ;
- `navigator.onLine` ment (vrai dans un tunnel), la bannière hors ligne clignote ou n’apparaît jamais ;
- aucune resynchronisation au retour du réseau ni au retour au premier plan ;
- une erreur réseau s’affiche comme un retour de jeu générique ;
- hors ligne, la table est inerte (ADR 0041), alors qu’elle est un état purement local.

Point d’appui : côté serveur, `debuter_commande` (`crates/api/src/routes.rs`) cherche la commande déjà traitée **avant** de vérifier `version_etat` : renvoyer la même clé rejoue la même réponse, sans double effet.

## Décisions prises

Le propriétaire a validé l’ensemble des propositions (« Go pour l’ensemble des propositions », 2026-11-10) :

1. Délai par essai et nouveaux essais avec la même clé, pendant que le joueur attend.
2. État réseau à trois niveaux (en ligne, instable, hors ligne), déduit des requêtes, avec sonde `/sante`.
3. Resynchronisation au retour du réseau et au retour au premier plan ; renouvellement anticipé du jeton.
4. Préchargement des médias du catalogue à l’inactivité ; `navigator.storage.persist()`.
5. Compression des réponses de l’API (gzip, brotli).
6. Attente par paliers (1 s, 4 s), erreur réseau distincte d’un échec de jeu avec « Réessayer » (même clé), table gardée.
7. Pastille d’état dans l’en-tête, « De retour en ligne », heure de la dernière synchronisation.
8. Table préparée hors connexion : nouvel ADR qui remplace partiellement l’ADR 0041 et précise que le renvoi d’une même commande n’est pas un rejeu.

## Périmètre / hors-périmètre

- Dans le périmètre : PWA (services, composants, styles), API (couche de compression), ADR et roadmap.
- Hors périmètre : file d’attente hors connexion (toujours exclue), fusion ou pli hors ligne, compression ou HTTP/3 au CDN (Infra), changement de contrat.

## Éléments à développer

- [x] design : ADR 0085 « Réseau instable : même commande renvoyée et table préparée hors connexion », remplace partiellement l’ADR 0041 ; index, statut de l’ADR 0041, `adr.html` régénéré, `game-design.md` si besoin.
- [x] app `crates/api` : `CompressionLayer` (gzip, br) dans `lib.rs`.
- [x] app `web/src/services/reseau.ts` : magasin de l’état réseau (trois niveaux, sonde avec délai croissant, temporisation de 2 s du passage hors ligne, retour en ligne signalé), hooks `useReseau`, `useEnLigne`.
- [x] app `web/src/services/api.ts` : délai par essai (8 s), nouveaux essais (0,5, 1, 2, 4 s avec part de hasard) sur erreur réseau, `502`, `504`, `503` sans corps de l’API, `429` avec `Retry-After` court ; corps identique donc même clé ; résultats signalés au magasin ; session dédupliquée et renouvelée en arrière-plan.
- [x] app `web/src/services/partie.ts` : clé tirée une fois par geste (`cleDuGeste`), réutilisée par « Réessayer » ; erreur réseau `ton: 'reseau'` ; resynchronisation au retour du réseau et au premier plan, sans écraser un catalogue lisible ; table modifiable hors ligne ; heure de la dernière synchronisation.
- [x] app `web/src/services/prechargement.ts` : médias du catalogue chargés à l’inactivité, en ligne, sans `saveData`, trois à la fois ; `storage.persist()`.
- [x] app composants : palier d’attente (`useAttente`), briques qui se rapprochent sur la table, ligne « Le réseau est lent… », retour réseau avec « Réessayer » dans `Resultat`, statut lent dans le rituel du pli, `PastilleReseau` dans l’en-tête de chaque écran, textes hors ligne mis à jour.
- [x] app styles : pastille, retour réseau, attente de la table ; mouvement réduit respecté.
- [x] app tests : `api.test.ts` (délai, nouveaux essais, même corps, pas de nouvel essai sur 4xx), `reseau.test.ts`, `App.test.tsx` (table hors ligne, fusion inerte).
- [x] app roadmap : section « Résilience réseau ».

## Cas limites et risques

- Une fusion sans découverte n’est pas enregistrée côté serveur : la renvoyer la réévalue, sans effet. Sans risque.
- `503` « aucun catalogue publié » de l’API : pas de nouvel essai (corps JSON de l’API).
- `429` : nouvel essai seulement si `Retry-After` ≤ 5 s.
- Resynchronisation concurrente : une seule à la fois.
- Un catalogue illisible pendant une resynchronisation ne remplace pas un catalogue déjà prêt.

## Vérification

```sh
cd app && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
cargo sqlx prepare --workspace --check -- --all-targets
cd web && npm run lint && npm run typecheck && npm test
cargo run -q --manifest-path ../design/outils/Cargo.toml --bin check_identity -- web/src/styles.css
cd design && cargo run -q --manifest-path outils/Cargo.toml --bin build_adr
```

Recette : Chromium avec réseau ralenti et coupé (Playwright `route` / `setOffline`), table hors ligne, fusion qui réussit après une coupure, pastille.

## Critères d’acceptation

- Une coupure de moins de 15 s pendant une fusion n’affiche aucune erreur : la fusion aboutit.
- Une erreur réseau garde la table et propose « Réessayer » ; aucune secousse.
- Hors ligne, on pose, déplace et retire des briques ; « Fusionner », plis, boutique et indices restent inertes.
- Au retour du réseau, l’état se resynchronise seul.
- Tous les contrôles d’« Avant de conclure » passent.

## Livraison

Commits en anglais `type(2026-11-10): …` avec `Co-Authored-By`, poussés sur la branche de chaque dépôt, PR en brouillon.

## Journal

- Le dossier `plans/` commun à l’espace de travail n’existe pas : le plan vit dans `App/plans/`.
- Ajout en recette : une réponse qui tarde plus de 3 s rend le réseau instable sans attendre qu’elle arrive (la pastille s’affichait trop tard).
- `animation-check` : sur mobile, les briques glissaient à l’horizontale ; la règle `rapproche-v` manquait de spécificité. Corrigé, réenregistré, mouvement réduit vérifié.
- Le statut « Prête, en attente du réseau » se coupait sur mobile : « En attente du réseau ».
- Les tests de l’App isolent leur client (`delais: []`, `Reseau` à part) : un appel non simulé ne fait plus fuir un état hors ligne d’un test à l’autre.

## Bilan

- Fait : tous les éléments du plan, dans Design (ADR 0085, ADR 0041 partiellement remplacé, I-04, `adr.html`) et App (PWA, API, tests, roadmap).
- Vérifié : `cargo fmt`, `clippy`, `cargo test` (dont la compression), `cargo sqlx prepare --check`, `npm run lint`, `typecheck`, `npm test` (131 tests), `check_identity` sans écart, recette Chromium (réseau lent, micro-coupure absorbée avec la même clé, perte puis « Réessayer », hors ligne, retour en ligne, ordinateur).
- Reste à faire : maquette I-04 dans le dossier design (pastille) ; compression du catalogue au CDN (dépôt Infra) si elle n’est pas déjà active.
