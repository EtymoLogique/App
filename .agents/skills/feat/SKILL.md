---
name: feat
description: Développer une fonctionnalité EtymoLogique. Deux phases — (1) plan : questions au user puis handoff déposé dans plans/todo ; (2) exécution : le handoff passe en plans/ongoing puis plans/closed. Utiliser pour /feat ou toute nouvelle fonctionnalité.
argument-hint: <description de la feature> | <slug d'un plan de plans/todo>
---

# /feat — livrer une fonctionnalité

Racine du workspace : `etymologique/` (dépôts `design`, `content`, `app`, `infra`). Plans dans `etymologique/plans/{todo,ongoing,closed}/`.

Toujours commencer par un plan. Jamais de code avant qu'un handoff existe et que le user l'ait validé.

## Choisir la phase

- `$ARGUMENTS` = description libre → **phase 1 (plan)**.
- `$ARGUMENTS` = slug ou nom d'un fichier de `plans/todo/` (ou « go » et un seul plan en todo) → **phase 2 (exécution)**.
- Doute → lister `plans/todo/` et demander.

## Phase 1 — Plan (aucune édition de code)

1. Lire le `AGENTS.md` de chaque dépôt touché (langue, vocabulaire, identité visuelle, commandes de vérification). Lire `plans/ongoing/` pour repérer les conflits.
2. Explorer le code et les ADR (`design/docs/adr`) concernés : réutiliser l'existant, repérer les contrats impactés (schémas `content`, `app/contrat`, migrations).
3. **Poser toutes les questions nécessaires** avec AskUserQuestion (par lots de 1 à 4, options concrètes, recommandation en premier) jusqu'à ce qu'il ne reste aucune ambiguïté : périmètre, hors-périmètre, comportement attendu, cas limites, données/migrations, UI et textes, dépôts touchés, ADR à écrire ou amender, critères d'acceptation. Ne pas deviner ce qui est du ressort du user. Ne pas poser de question dont la réponse est dans le code.
4. Écrire le handoff `plans/todo/AAAA-MM-JJ-feat-<slug>.md` (slug en kebab-case) avec le gabarit ci-dessous. Le handoff doit suffire à une session neuve sans contexte.
5. Résumer le plan au user en quelques lignes, donner le chemin, et s'arrêter. Lancement : `/feat <slug>`.

### Gabarit du handoff

```markdown
# Feat — <titre>

- Statut : todo
- Créé le : AAAA-MM-JJ
- Dépôts : <design | content | app | infra>
- Branches : <dépôt → branche de base → branche à créer>

## Contexte et objectif
## Décisions prises (questions/réponses du user)
## Périmètre / hors-périmètre
## Éléments à développer
Étapes ordonnées, cases à cocher `- [ ]`, chacune avec dépôt, fichiers, comportement.
## Cas limites et risques
## Vérification
Commandes exactes par dépôt (tests, lint, valider…) + recette manuelle.
## Critères d'acceptation
## Livraison
Commits (convention du dépôt, `Co-Authored-By`), ADR/docs à mettre à jour.
```

## Phase 2 — Exécution

1. Déplacer le plan : `mv plans/todo/<f>.md plans/ongoing/`, passer `Statut : ongoing`, ajouter `Démarré le : AAAA-MM-JJ`. Le faire avant toute autre action.
2. Créer les branches indiquées. Suivre le plan étape par étape, cocher `- [ ]` → `- [x]` au fil de l'eau. Écart de plan mineur : noter dans une section `## Journal`. Écart majeur ou nouvelle ambiguïté : s'arrêter et demander au user.
3. Minimum de code : réutiliser l'existant, pas d'abstraction spéculative. Respecter les `AGENTS.md`.
4. Écrire les tests avec le code. Lancer toute la vérification du plan ; ne rien déclarer fini sur un test rouge ou non lancé.
5. Commit par étape logique. Ne pas pousser sans demande du user.
6. Fin : tous les critères d'acceptation vérifiés → `mv plans/ongoing/<f>.md plans/closed/`, `Statut : closed`, `Terminé le : AAAA-MM-JJ`, ajouter une section `## Bilan` (fait, écarts, reste à faire, commits). Si l'ensemble n'est pas terminé, le plan reste dans `ongoing/` avec l'état d'avancement à jour.
7. Rapport final : ce qui est fait, où (branches, commits), commande suivante.
