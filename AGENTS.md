# AGENTS.md — ÉtymoLogique, dépôt App

Ce dépôt contient la PWA et l’API de jeu. Le dossier de conception (ADR, modèle de données, game design) vit dans le dépôt [EtymoLogique](https://github.com/lunik/EtymoLogique) ; le catalogue, dans le dépôt privé Content ; l’hébergement, dans le dépôt Infra.

La documentation, les libellés, les messages d’erreur et les identifiants du code sont **en français**. Seuls les messages de commit sont en anglais.

## Sources de vérité

1. **ADR acceptés ou proposés** du dossier de conception, en particulier 0001, 0007, 0010, 0024, 0027, 0028 et 0029.
2. **Modèle de données**, section 7 « Données du joueur » : tables, contraintes, stockage local.
3. **`docs/game-design.md`** : vocabulaire et règles de jeu.
4. **[Roadmap](docs/roadmap.md)** : jalon en cours et ce qui en dépend.

Si le code s’écarte d’un ADR, ou si deux sources se contredisent, signalez l’écart au lieu de choisir en silence.

## Règles

- **D’abord un logiciel qui marche, ensuite les tests.** Faire fonctionner l’application comme elle a été conçue prime sur l’écriture de tests : livrez d’abord une fonctionnalité qui marche de bout en bout, puis ajoutez les tests qui la protègent.
- **Le serveur fait foi** pour toute mutation : réserve, codex, énergie, plis, encre, sabliers. Le client ne transforme jamais une erreur en succès local.
- **Chaque commande est une transaction**, porte une clé d’idempotence et la `version_etat` connue du client.
- **Aucune donnée personnelle** : ni nom, ni adresse électronique, ni adresse réseau stockée. Les journaux ne contiennent ni secret, ni jeton, ni corps de requête, ni identifiant de joueur.
- **Requêtes SQL paramétrées** et vérifiées à la compilation (`sqlx::query!`). Jamais de SQL construit par concaténation.
- **Validation côté serveur** : `deny_unknown_fields` sur toute requête, taille bornée, formats vérifiés (UUID v4, secret de 256 bits).
- **La base de progression ne copie aucun texte du catalogue** : des identifiants opaques et des nombres.
- **Chemins du catalogue** : seul `Chemin` (Rust) ou `cheminValide` (TypeScript) décide qu’un chemin est lisible ; chaque fichier haché est vérifié contre son empreinte.
- **Prévisualisation d’une fusion** : `prevoir` (`web/src/services/jeu.ts`) est le miroir de `etymo_domaine::fusion::resoudre`. Changez les deux ensemble, avec leurs tests.
- **Fichiers générés** (`contrat/openapi.json`, `web/src/contrat/api.d.ts`, `.sqlx/`) : régénérez-les, ne les éditez pas.
- **Identité visuelle** : `web/src/styles.css` reprend les jetons et les composants du design système (`docs/assets/etymo.css` du dossier de conception). Pas de couleur en dur hors palette, pas de blanc pur, ombres dures en Encre ; une brique affiche son trait d’union (« géo- », « -logie »), jamais en texte brut. Contrôlez avec `python3 ../design/.agents/skills/visual-identity-check/check_identity.py web/src/styles.css` et la checklist du skill `visual-identity-check`.
- **Vocabulaire du jeu** : « pli » (jamais « pack »), « codex », « exemplaire », « réserve », « brique », « fascicule ». Typographie française dans les libellés : « », ’, espaces insécables.
- **Branches** (ADR 0028) : `develop` déploie en hors-prod, un tag `v*.*.*` en prod.

## Développer

Lancez une fois `./scripts/dev.sh` en arrière-plan (processus détaché, journal dans un fichier) et laissez-le tourner. L’API se recompile et redémarre toute seule quand `crates/` ou `migrations/` changent ; la PWA se recharge à chaud. Ne coupez ni ne relancez l’application après une modification : attendez la nouvelle ligne « API à l’écoute » dans le journal.

## Avant de conclure

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo sqlx prepare --workspace --check -- --all-targets
cd web && npm run lint && npm run typecheck && npm test
```

Mettez à jour la roadmap quand une tâche d’un jalon est faite.
