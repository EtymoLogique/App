---
name: idee
description: Remonter une idée ou un problème EtymoLogique. Identifier le problème, vérifier qu'il est réel, puis créer une issue dans le dépôt concerné (glab pour GitLab, gh pour GitHub). Utiliser pour /idee, « remonter un bug », « noter une idée », « ouvrir une issue ».
argument-hint: <idée ou problème constaté>
---

# /idee — remonter une idée ou un problème

Racine du workspace : `etymologique/` (dépôts `design`, `content`, `app`, `infra`). Ce skill **ne code rien** et **ne corrige rien** : il produit une issue fiable. Suite possible : `/feat` ou `/fix` sur cette issue.

## 1. Identifier

- Reformuler `$ARGUMENTS` en une phrase : type (`bug` | `idée` | `amélioration` | `doc`), symptôme ou besoin, où ça se voit.
- Déterminer le dépôt cible parmi `design`, `content`, `app`, `infra` (lire leur `AGENTS.md` si le doute persiste). Si plusieurs dépôts sont concernés, une issue par dépôt, avec liens croisés.
- Élément flou ou manquant (attendu, reproduction, environnement) → AskUserQuestion, par lots de 1 à 4. Pas de question dont la réponse est dans le code.

## 2. Vérifier la véracité

Ne jamais ouvrir une issue sur une supposition.

- **Bug** : reproduire (commande, test, requête, lecture du flux complet). Noter la commande exacte et la sortie décisive. Bug non reproductible → le dire au user et demander s'il faut quand même l'ouvrir, en le marquant « non reproduit ».
- **Idée / amélioration** : vérifier que ça n'existe pas déjà (code, ADR dans `design/docs/adr`, `plans/todo|ongoing|closed`, README/roadmap) et que ça ne contredit aucun ADR accepté.
- **Doublon** : chercher dans les issues ouvertes et fermées du dépôt (`glab issue list --all --search "<mots>"` ou `gh issue list --state all --search "<mots>"`). Doublon trouvé → ne pas créer : proposer de commenter l'existante.
- Conclure : `confirmé` | `non reproduit` | `déjà existant` | `contredit l'ADR NNNN`. Si ce n'est pas `confirmé`, demander au user avant de continuer.

## 3. Créer l'issue

1. Détecter l'hébergeur : `git -C <dépôt> remote get-url origin`.
   - `gitlab.com` (ou hôte GitLab) → `glab issue create -R <groupe/projet>`.
   - `github.com` → `gh issue create -R <org/dépôt>` et le signaler au user (attendu : GitLab).
   - Aucun remote → s'arrêter et demander.
2. Rédiger titre et corps **en français** (règle des `AGENTS.md`), dans ce gabarit :

```markdown
## Constat / besoin
## Vérification faite
Commandes lancées, sortie décisive, verdict.
## Comportement attendu
## Piste (facultatif)
Fichiers ou ADR concernés. Pas de solution imposée.
## Critères d'acceptation
```

3. Montrer titre, dépôt et corps au user et **attendre sa validation** avant de créer (l'issue est publique pour l'équipe). Puis créer avec labels existants (`glab label list` / `gh label list`) : type `bug`/`enhancement` selon le cas. Ne pas inventer de labels, d'assignés ni de milestone sans demande.
4. Ne pas joindre de secret, jeton, donnée personnelle ni chemin absolu local.

## 4. Rapport

URL de l'issue, verdict de la vérification, et commande suivante : `/fix <description>` ou `/feat <description>`.
