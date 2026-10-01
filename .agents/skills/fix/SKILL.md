---
name: fix
description: Corriger un bug EtymoLogique. Deux phases — (1) plan : diagnostic, questions au user puis handoff déposé dans plans/todo ; (2) exécution : le handoff passe en plans/ongoing puis plans/closed. Utiliser pour /fix ou tout bug.
argument-hint: <description du bug> | <slug d'un plan de plans/todo>
---

# /fix — corriger un bug

Racine du workspace : `etymologique/` (dépôts `design`, `content`, `app`, `infra`). Plans dans `etymologique/plans/{todo,ongoing,closed}/`.

Toujours commencer par un plan. Jamais de correctif avant qu'un handoff existe et que le user l'ait validé. Corriger la cause racine, pas le symptôme.

## Choisir la phase

- `$ARGUMENTS` = description libre → **phase 1 (plan)**.
- `$ARGUMENTS` = slug ou nom d'un fichier de `plans/todo/` (ou « go » et un seul plan en todo) → **phase 2 (exécution)**.
- Doute → lister `plans/todo/` et demander.

## Phase 1 — Plan (aucune édition de code)

1. Lire le `AGENTS.md` de chaque dépôt touché. Regarder `plans/ongoing/` pour repérer les conflits.
2. **Diagnostiquer** : reproduire le bug (commande, test, requête), lire le flux complet, lister les hypothèses classées par vraisemblance et les preuves qui les confirment ou les infirment. Chercher tous les appelants de la fonction fautive : le correctif va à l'endroit où tous les chemins passent.
3. **Poser toutes les questions nécessaires** avec AskUserQuestion (par lots de 1 à 4, recommandation en premier) : comportement attendu vs observé, étapes de reproduction, environnement (prod/hors-prod, version PWA), données existantes à réparer, périmètre du correctif, contrat ou ADR touchés. Ne pas poser de question dont la réponse est dans le code ou les logs.
4. Écrire le handoff `plans/todo/AAAA-MM-JJ-fix-<slug>.md` avec le gabarit ci-dessous. Il doit suffire à une session neuve sans contexte.
5. Résumer au user (cause probable, correctif prévu), donner le chemin, et s'arrêter. Lancement : `/fix <slug>`.

### Gabarit du handoff

```markdown
# Fix — <titre>

- Statut : todo
- Créé le : AAAA-MM-JJ
- Dépôts : <design | content | app | infra>
- Branches : <dépôt → branche de base → branche à créer>

## Symptôme
Attendu vs observé, reproduction exacte.
## Diagnostic
Cause racine (preuves), hypothèses écartées, appelants concernés.
## Décisions prises (questions/réponses du user)
## Correctif prévu
Étapes ordonnées, cases à cocher `- [ ]`, dépôt, fichiers, changement.
## Hors-périmètre
## Test de non-régression
Le test qui échoue avant le correctif et passe après.
## Vérification
Commandes exactes par dépôt + recette manuelle.
## Données à réparer / risques
## Livraison
Commits (convention du dépôt, `Co-Authored-By`).
```

## Phase 2 — Exécution

1. Déplacer le plan : `mv plans/todo/<f>.md plans/ongoing/`, passer `Statut : ongoing`, ajouter `Démarré le : AAAA-MM-JJ`. Le faire avant toute autre action.
2. Créer les branches indiquées.
3. **Écrire d'abord le test de non-régression et le voir échouer** pour la bonne raison. Puis appliquer le correctif minimal. Cocher les étapes au fil de l'eau. Cause différente de celle du plan : s'arrêter, mettre le plan à jour, demander au user si le périmètre change.
4. Lancer toute la vérification du plan ; ne rien déclarer corrigé sur un test rouge ou non lancé. Vérifier que le comportement voisin n'a pas bougé.
5. Commit `fix(…)` selon la convention du dépôt. Ne pas pousser sans demande du user.
6. Fin : `mv plans/ongoing/<f>.md plans/closed/`, `Statut : closed`, `Terminé le : AAAA-MM-JJ`, section `## Bilan` (cause réelle, correctif, tests, commits, reste à faire).
7. Rapport final : ce qui est corrigé, où, commande suivante.
