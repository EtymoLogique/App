---
name: animation-check
description: Évaluer une animation ou une transition de la PWA d'ÉtymoLogique (ou de toute page web) image par image. Enregistre la page avec Playwright pendant une action (clic, survol, touche ou scénario), ralentit les animations CSS et Web Animations, puis découpe la vidéo avec ffmpeg en images horodatées et en planche contact. À utiliser après toute modification de @keyframes, transition, easing ou animation déclenchée par une interaction, ou quand l'utilisateur veut « voir l'animation au ralenti ».
---

# Skill animation-check

Une capture d'écran ne montre que l'état final. Ce skill montre **le chemin** : départ, rebond, dépassement, saut, clignotement, élément qui arrive avant les autres.

## 1. Préparer

- La PWA tourne avec `./scripts/dev.sh` (voir `AGENTS.md`) sur `http://localhost:5173`. Vérifiez : `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/`. Ne relancez pas le serveur s'il répond.
- Une fois par poste : `npm --prefix .agents/skills/animation-check install` (Playwright 1.63, navigateurs dans `~/Library/Caches/ms-playwright` ; sinon `npx playwright@1.63.0 install chromium`). `ffmpeg` doit être dans le `PATH`.
- Repérez dans `web/src/styles.css` l'animation visée : sa durée et son easing (`--ease-spring`, `--ease-out`) donnent ce qu'il faut attendre. Les animations ne jouent que hors `[data-mouvement="reduit"]`.

## 2. Enregistrer

Depuis la racine du dépôt :

```sh
S=.agents/skills/animation-check
# Poser une brique : clic simple, ralenti ×5, 800 ms d'animation observés
node $S/enregistrer.mjs --url http://localhost:5173/ --attendre .brick \
  --clic ".brick >> nth=0" --ralenti 5 --duree 800

# Survol d'une brique, recadré sur elle (un bouton désactivé ne réagit pas au survol)
node $S/enregistrer.mjs --url http://localhost:5173/ --attendre .brick \
  --survol ".brick >> nth=0" --zone ".brick >> nth=0" --ralenti 4 --duree 400
```

Pour une action en plusieurs temps (poser une première brique, puis observer la seconde), écrivez un scénario dans `/tmp` :

```js
// /tmp/animation-check/scenario.mjs
export async function preparer({ page }) {      // hors enregistrement utile, vitesse normale
  await page.locator('.brick').first().click()
  await page.waitForTimeout(600)
}
export async function action({ page }) {        // c'est ici que commence l'observation
  await page.locator('.brick').nth(1).click()
}
```

```sh
node $S/enregistrer.mjs --url http://localhost:5173/ --attendre .brick \
  --script /tmp/animation-check/scenario.mjs --hauteur 1200 --ralenti 4 --duree 700
```

Options utiles (`--aide` pour la liste) :

| Option | Rôle |
|---|---|
| `--ralenti n` | Divise la vitesse des animations CSS et WAAPI par `n` (CDP `Animation.setPlaybackRate`). La vidéo est à ~25 i/s : `--ralenti 5` donne une image toutes les 8 ms d'animation. 4 à 8 pour une transition de 200–500 ms, 10 pour un ressort rapide. |
| `--duree ms` | Temps **d'animation** observé après l'action (la durée réelle est multipliée par `--ralenti`). Prenez la durée CSS + 200 ms. |
| `--zone sél` | Recadre sur un élément (+ 24 px). Choisissez un conteneur **stable** : si l'élément se déplace, il sort du cadre. |
| `--hauteur` / `--largeur` | Fenêtre, 390 × 844 par défaut (mobile). Agrandissez la hauteur pour garder la table et la réserve à l'écran. |
| `--reduit` | `prefers-reduced-motion: reduce` : vérifiez qu'il n'y a plus de mouvement. |
| `--sombre` | `prefers-color-scheme: dark`. |
| `--planche n` | Nombre maximal de vignettes (36) ; au-delà, une image sur k. |

Chaque exécution ouvre un contexte neuf : un nouveau joueur anonyme, sans état préalable. La cible d'un `--clic` ou `--survol` est centrée à l'écran avant l'enregistrement utile, sinon le défilement automatique de Playwright masquerait l'animation.

## 3. Observer

Sortie dans `/tmp/animation-check/<horodatage>/` (ou `--sortie`) :

- `planche.png` : **commencez par là** avec l'outil `view`. Vignettes horodatées en temps d'animation (0 ms = action ; les négatifs montrent l'état de repos).
- `images/image_NNNN.png` : toutes les images, pour zoomer sur un moment précis (`view` sur 3 à 5 images consécutives autour d'un défaut). Le script indique l'image où commence l'action et la durée d'une image.
- `ralenti.mp4` : vidéo recadrée et horodatée, à proposer à l'utilisateur.
- `mesures.json` : paramètres, zone, erreurs console. Toute erreur console est un défaut à signaler.

## 4. Évaluer

Pour chaque animation, vérifiez et notez l'horodatage de chaque écart :

1. **Départ** : l'image à 0 ms est l'état de repos, sans saut ni clignotement (pas d'élément qui apparaît puis disparaît).
2. **Durée** : l'animation s'arrête à la durée prévue par le CSS (± une image). Au-delà de 500 ms pour un retour d'interaction, c'est trop lent.
3. **Easing** : `--ease-spring` doit dépasser légèrement puis revenir ; `--ease-out` démarrer vite et ralentir, sans dépassement. Un mouvement linéaire ou un arrêt brusque est un écart.
4. **Continuité** : pas d'image où l'élément saute de position, change de taille d'un coup, est rogné (`overflow`) ou passe sous un voisin (`z-index`).
5. **Ordre** : les éléments liés (brique qui part de la réserve, emplacement qui la reçoit, compteur ×n) bougent dans un ordre lisible.
6. **Arrivée** : l'état final correspond à la capture statique attendue, ombres dures en Encre comprises (voir `visual-identity-check`).
7. **Mouvement réduit** : avec `--reduit` et avec `[data-mouvement="reduit"]` (Réglages), l'état change sans mouvement.

Rendez un court rapport : animation, verdict (conforme / écart), horodatages et images concernées, cause probable dans `web/src/styles.css`, correction proposée. Après correction, relancez la même commande et comparez les deux planches.

## Limites

- `--ralenti` agit sur les animations CSS, les transitions et l'API Web Animations. Il ne ralentit **pas** `setTimeout`, `requestAnimationFrame` ni les changements d'état React temporisés : une classe retirée par un minuteur JS arrivera trop tôt par rapport à l'animation ralentie. Pour ces cas, utilisez `--ralenti 1` et regardez les images (40 ms chacune).
- Le départ de la vidéo n'est connu qu'à ~100 ms près : la marge de 300 ms avant l'action l'absorbe, mais l'horodatage absolu peut être décalé d'une ou deux images. Fiez-vous aux écarts entre images.
- Si `--attendre` échoue, `echec.png` montre la page à ce moment ; vérifiez le journal de `dev.sh` (API redémarrée ?) puis relancez.
- Nettoyez `/tmp/animation-check/` en fin de tâche.
