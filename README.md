# ÉtymoLogique — App

PWA et API de jeu d’ÉtymoLogique ([ADR 0024](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0024-architecture-logicielle-et-hebergement.md)) : une PWA React servie en fichiers statiques, une API Rust serverless qui fait foi pour toute mutation ([ADR 0007](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0007-etat-et-economie-autoritaires.md)), une base PostgreSQL pour la progression et les tâches planifiées. Le catalogue n’est pas ici : il est compilé par le dépôt Content et lu sur le CDN ([ADR 0027](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0027-catalogue-statique-et-donnees-joueur.md)).

La suite du travail est dans la [roadmap](docs/roadmap.md).

## Arborescence

| Chemin | Rôle |
|---|---|
| `crates/domaine/` | Types et règles du jeu, sans entrée-sortie : identifiants opaques, résolution d’une fusion, plafond de la réserve. |
| `crates/catalogue/` | Lecture de l’artefact publié : index, manifestes, recettes, exclusions, cartes, chemins hachés, vérification des empreintes. |
| `crates/contrat/` | Requêtes et réponses de l’API : **source de vérité du contrat**. |
| `crates/taches/` | Tâches planifiées : parution des fascicules ([ADR 0029](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0029-parution-par-promotion-de-prefixe.md)), purges. |
| `crates/api/` | Binaire `etymo-api` : l’API (axum, sqlx) et les sous-commandes des tâches. |
| `migrations/` | Migrations de schéma de la base de progression, appliquées au démarrage de l’API. |
| `.sqlx/` | Données des requêtes vérifiées à la compilation, pour compiler sans base. |
| `contrat/openapi.json` | Contrat OpenAPI **généré**, jamais édité à la main. |
| `web/` | PWA : Vite, React, TypeScript, vite-plugin-pwa. `web/src/contrat/api.d.ts` est **généré**. |
| `Dockerfile` | Image unique de l’API et des tâches. |
| `compose.yaml` | Base PostgreSQL de développement. |

## Binaire `etymo-api`

| Commande | Rôle | Variables |
|---|---|---|
| *(aucune)* ou `servir` | Sert l’API sur `PORT` (8080), applique les migrations, relit l’index du catalogue toutes les 60 s | `DATABASE_URL`, `ETYMO_CATALOGUE_URL`, `ETYMO_CLE_SIGNATURE_SESSION`, `ETYMO_ORIGINES_PWA` |
| `publier-fascicules` | Tâche de parution : promeut de `staging/` vers `public/` les fascicules dont la date est passée, puis écrit `public/index.json` | `ETYMO_S3`, `ETYMO_BUCKET_CATALOGUE`, `ETYMO_S3_POINT`, `ETYMO_S3_REGION` |
| `purger` | Supprime les commandes de plus de 30 jours | `DATABASE_URL` |
| `migrer` | Applique les migrations de schéma | `DATABASE_URL` |
| `openapi` | Écrit le contrat sur la sortie standard | — |

`ETYMO_CATALOGUE_URL` est le point de terminaison du bucket du catalogue ; l’API lit, sans clé, son préfixe `public/`. Les secrets ne sont jamais journalisés.

## API

| Route | Rôle |
|---|---|
| `GET /sante` | État du service et version du catalogue chargée. |
| `POST /session` | Ouvre la session d’un profil invité : identifiant d’installation (UUID v4) et secret de 256 bits, générés par la PWA. Le serveur n’en garde que l’empreinte SHA-256 et rend un jeton HMAC valable 15 minutes. |
| `GET /etat` | Synchronise le joueur : accorde une fois les graines de chaque fascicule paru ([ADR 0030](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0030-reserve-de-depart-par-fascicule.md)), puis renvoie l’état confirmé : réserve et découvertes. Jeton requis. |
| `POST /fusion` | Tente une fusion : de 2 à 4 briques ordonnées. Issues : `decouverte` (un exemplaire de chaque brique consommé, mot ajouté au codex), `connue`, `exclue`, `presque` (`ordre` ou `incomplet`), `echec`, `reserve_insuffisante`. Seule une découverte modifie l’état : elle exige `version_etat` et `version_catalogue` à jour (sinon `409`) et elle seule est enregistrée pour l’idempotence. Jeton requis. |

Chaque requête refuse les propriétés inconnues, et son corps est borné à 8 Kio. Le débit est limité en mémoire, par adresse réseau pour `/session` et par profil ailleurs : aucune adresse n’est stockée. CORS n’accepte que l’origine de la PWA.

## Développer en local

Prérequis : Rust 1.98, Node.js 24, Docker, Python et le dépôt Content à côté de celui-ci (`../content`).

### En une commande, avec rechargement automatique

```sh
brew install watchexec          # une fois
./scripts/dev.sh
```

Le script démarre la base, applique les migrations et compile le catalogue d’essai dans `.local/bucket` s’il manque. Il lance ensuite l’API sur <http://localhost:8080> et la PWA sur <http://localhost:5173>.

- **API** : `watchexec` la recompile et la relance à chaque modification de `crates/`, `migrations/` ou `Cargo.toml`. Les requêtes SQL sont vérifiées contre la base locale, sans `cargo sqlx prepare`, mais pensez à le lancer avant de pousser.
- **PWA** : Vite recharge à chaud chaque modification de `web/`.
- **Catalogue** : l’API relit l’index toutes les 5 s. Pour repartir du catalogue de Content, supprimez `.local/bucket` et relancez le script.

Ctrl-C arrête l’API et la PWA ; `docker compose stop` arrête la base.

### Pas à pas

```sh
# 1. Base de progression
docker compose up -d --wait
export DATABASE_URL=postgres://etymo:etymo-dev@127.0.0.1:55432/etymo

# 2. Bucket simulé dans .local/bucket : compilation du catalogue d'essai dans
#    staging/, puis parution. --simuler-le n'est accepté que sur un dossier local.
../content/.venv/bin/etymo-contenu compiler --racine ../content --essai \
  --sortie .local/bucket/staging --version essai-local
ETYMO_S3_POINT="file://$PWD/.local/bucket" \
  cargo run -p etymo-api -- publier-fascicules --simuler-le 2026-10-02T00:00:00Z

# 3. API sur http://localhost:8080
ETYMO_CATALOGUE_URL="file://$PWD/.local/bucket" \
ETYMO_CLE_SIGNATURE_SESSION=developpement-local-uniquement-0123456789 \
ETYMO_ORIGINES_PWA=http://localhost:5173 \
  cargo run -p etymo-api

# 4. PWA sur http://localhost:5173 ; Vite sert le catalogue sous /catalogue/
cd web && npm ci && npm run dev
```

### Vérifier avant de pousser

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace                     # exige DATABASE_URL : une base neuve par test
cargo sqlx prepare --workspace --check -- --all-targets
cd web && npm run lint && npm run typecheck && npm test
```

### Modifier le contrat ou une requête SQL

- Contrat : modifiez les types de `crates/contrat` (ou les routes annotées), puis régénérez `contrat/openapi.json` et les types TypeScript :

  ```sh
  cargo run -q -p etymo-api -- openapi > contrat/openapi.json
  (cd web && npm run contrat)
  ```

- Requête SQL ou migration : relancez `cargo sqlx prepare --workspace -- --all-targets` (sqlx-cli 0.8.6) et versionnez `.sqlx/`.

La CI échoue si l’un de ces fichiers générés est périmé.

## CI/CD

Suivant l’[ADR 0028](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0028-gitflow-des-depots.md) :

| Déclencheur | Ce qui se passe |
|---|---|
| Pull request, push sur `develop` ou `master` | `ci.yml` : format, lint, tests Rust contre PostgreSQL, `.sqlx` et contrat à jour, `cargo audit` ; lint, types, tests, build et `npm audit` de la PWA ; build de l’image. |
| Push sur `develop` | `deploiement.yml` en hors-prod : image poussée dans le registre (son empreinte est dans le résumé du job), PWA déposée dans son bucket. |
| Tag `v*.*.*` | Même chose en prod. |

Les clés et variables des environnements GitHub sont posées par le dépôt Infra, qui épingle aussi l’image de l’API et des tâches par son empreinte.

## Licences

| Périmètre | Licence |
|---|---|
| Code | [GNU AGPL 3.0 ou ultérieure](LICENSE) |
| Documentation | [Creative Commons BY-SA 4.0](LICENSE-CONTENT) |
| Nom « ÉtymoLogique », logo et marque | Réservés, hors de ces licences |

© 2026 Guillaume MARTINEZ ([ADR 0017](https://github.com/lunik/EtymoLogique/blob/master/docs/adr/0017-licences.md)).
