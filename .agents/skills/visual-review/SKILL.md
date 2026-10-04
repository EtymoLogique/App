---
name: visual-review
description: Valider visuellement, avec le MCP Chrome, qu'un correctif ou une fonctionnalité de la PWA EtymoLogique est conforme aux attentes (plan, ticket, demande) et à l'identité visuelle du dépôt design. Contrôle automatique de l'identité, parcours dans le navigateur en mobile et desktop, atelier et nocturne, captures, console, réseau, accessibilité, rapport avec verdict. Utiliser pour /visual-review, après un /fix ou un /feat, ou pour « vérifier à l'écran ».
argument-hint: [slug d'un plan de plans/ongoing|closed] | [description de ce qui doit être vu] | [URL ou route]
---

# /visual-review — valider à l'écran

Lecture seule : ce skill constate et rapporte, il ne corrige rien. Un écart est signalé avec `fichier:ligne` ou sélecteur, la règle enfreinte et la correction proposée. Corriger = `/fix` ou l'accord du user.

Racine du workspace : `etymologique/` (dépôts `design`, `app`, `content`, `infra`). Source de vérité visuelle : dépôt `design/` (`docs/identite.html`, `docs/design-system.html`, `docs/assets/etymo.css`, `docs/boussole.html`). En cas de doute, ces pages priment sur ce résumé. Deux sources qui se contredisent : signaler l'écart, ne pas trancher en silence.

## 1. Fixer les attentes

Avant d'ouvrir le navigateur, écrire la liste des attentes vérifiables :

- `$ARGUMENTS` = slug ou nom d'un plan → lire `plans/{ongoing,closed,todo}/<slug>*.md` : `Symptôme` (fix) ou objectifs et recette manuelle (feat). Chaque ligne devient une attente « je fais X, je vois Y ».
- `$ARGUMENTS` = description libre → la reformuler en attentes. Sinon, `git diff` des dépôts touchés (`app/web/src/…`) pour déduire écrans et composants concernés.
- Attente floue (« que ça soit joli ») → une question AskUserQuestion, pas plus. Ce qui se lit dans le code ou le plan ne se demande pas.
- Ajouter toujours les attentes d'identité de la section 4.

Écrans à couvrir : ceux que le diff ou le plan touche, plus le parcours voisin qui pourrait régresser. Un changement de `styles.css`, de `plis.css` ou d'un jeton touche **tous** les écrans : couvrir au moins l'accueil, la table de fusion, le codex et un pli.

## 2. Contrôle automatique de l'identité (avant le navigateur)

Depuis la racine du workspace :

```sh
cargo run -q --manifest-path design/outils/Cargo.toml --bin check_identity -- app/web/src/styles.css app/web/src/*.css
```

Fichiers CSS modifiés seulement si le diff est petit. Une erreur nouvelle (`hors-palette`, `blanc-pur`, `degrade-mixte`, `texte-sur-vif`, `bande-laterale`) = écart bloquant. Les écarts préexistants se signalent, sans plus. Le script ne voit ni le rendu ni les couleurs calculées : la section 4 reste obligatoire.

## 3. Lancer l'app

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/
```

`200` = déjà lancée, ne pas relancer. Sinon `app/scripts/dev.sh` en arrière-plan (journal dans un fichier), attendre « API à l'écoute ». Ne jamais couper ni relancer l'app après une modification : attendre la nouvelle ligne du journal. Hors-prod ou prod demandée par le user : utiliser l'URL donnée, sans écrire de données de jeu réelles.

## 4. Naviguer avec le MCP Chrome

Charger les outils en **un seul** ToolSearch :

`select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__resize_window,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__gif_creator,mcp__claude-in-chrome__tabs_close_mcp`

Règles : `tabs_context_mcp` d'abord, puis un **nouvel onglet** (`tabs_create_mcp`), jamais un onglet existant du user. Ne déclencher aucun `alert`/`confirm`/`prompt`. Outil qui échoue 2 à 3 fois ou extension muette : s'arrêter et demander au user, ne pas boucler.

### 4.1 Matrice de rendu

Pour chaque écran couvert, mobile d'abord (ADR 0001) :

| Viewport | Thème |
|---|---|
| 390 × 844 (mobile) | atelier, puis nocturne |
| 1280 × 800 (desktop) | atelier, puis nocturne |

Changer de viewport avec `resize_window`. Changer de thème avec `javascript_tool` :

```js
document.documentElement.dataset.theme = "nocturne"   // ou "atelier" ; supprimer l'attribut = thème du système
```

Remettre l'état initial à la fin. Si le changement touche une animation : émuler `prefers-reduced-motion: reduce` (ou `data-mouvement="reduit"`) et vérifier que le contenu reste accessible. Image par image = skill `animation-check` de `app/.agents/skills/`.

### 4.2 Parcours des attentes

1. Rejouer chaque attente de la section 1 comme le fait un joueur : clics, saisies, navigation, avec `computer`, `find`, `read_page`. Capturer **avant** et **après** l'action clé.
2. Vérifier l'état voisin : ce qui ne devait pas bouger n'a pas bougé.
3. Parcours multi-étapes utile à revoir : `gif_creator`, nom parlant (`fusion_pli.gif`), images en plus avant et après l'action.
4. Cas limites de l'attente : état vide, texte long, mot à accents, réserve vide, énergie à 0, hors-ligne si concerné.

### 4.3 Contrôles techniques (chaque écran)

- **Console** : `read_console_messages` avec `pattern` `error|warn|Uncaught|Failed`. Zéro erreur JavaScript.
- **Réseau** : `read_network_requests` : aucune 4xx/5xx inattendue, aucune ressource 404. Le serveur fait foi : une erreur d'API ne doit jamais s'afficher comme un succès.
- **Débordement** : `document.documentElement.scrollWidth <= innerWidth` en mobile, aucun texte coupé.
- **Cibles tactiles** : éléments interactifs ≥ 44 px (boutons 48 px, brique ≥ 96 × 52 px) — mesurer avec `getBoundingClientRect()` via `javascript_tool`.
- **Couleurs calculées** : lire `getComputedStyle` des composants touchés. Chaque couleur doit correspondre à un jeton de `styles.css` (`--paper`, `--cream`, `--ink`, `--fixed-ink`, `--c-*`, `--c-*-deep`, `--c-*-tint`) ; aucun `rgb(255, 255, 255)` pur.
- **Focus clavier** : Tab traverse les contrôles dans l'ordre visuel ; anneau Encre 2 px décalé de 3 px visible.

## 5. Checklist d'identité (à cocher dans le rapport)

Détail et exemples bons/mauvais : `design/docs/identite.html#regles` et `design/.agents/skills/visual-identity-check/SKILL.md` § 2. Résumé :

**Sens des couleurs** : une couleur, un seul sens.
- [ ] Préfixe = Étincelle, suffixe = Glose, toutes les langues = Palimpseste, famille = Rosée, pli / énergie / rareté / encre = Ambre, action / nouveauté / marque = Corail, focus = Encre, danger irréversible = Corail profond (après confirmation, icône octogone). Carte de mot neutre : Encre sur Crème.
- [ ] Aucune couleur de ressource détournée. Un échec de jeu reste en Gris encre, jamais en rouge.

**Règles élémentaires** :
- [ ] Pas de couleur vive sur couleur vive ; texte en Encre (`--fixed-ink`) sur vif, jamais blanc ni crème.
- [ ] Texte coloré sur fond clair = ton Profond (`--c-*-deep`).
- [ ] Deux couleurs ne se touchent pas : filet neutre de 3 px.
- [ ] Grandes surfaces neutres ; seul le Corail couvre une bande de marque.
- [ ] La couleur n'est jamais le seul signal (texte, forme ou icône en plus).
- [ ] Pas de dégradé entre ressources, pas d'opacité pour inventer une teinte (`--c-*-tint`), désactivé à 40 % seulement.
- [ ] Ombres dures en Encre, jamais colorées ni molles.
- [ ] Contraste ≥ 4,5:1 (texte), ≥ 3:1 (grands titres, icônes, bordures utiles).
- [ ] Au plus 3 couleurs de ressource par composant, une seule surface colorée : son bandeau.
- [ ] Aucune bande de couleur sur un seul côté d'une carte, d'un panneau ou d'une ligne.

**Formes, états, rareté** :
- [ ] Brique : rayon 10, ombre dure 4 px, ≥ 96 × 52 px ; petite brique rayon 6. Carte 3:4 avec bandeau. Pastille rayon 999. Pointillé = manque, inconnu ou épuisé.
- [ ] Préfixe et suffixe affichés en brique avec trait d'union (« géo- », « -logie »), jamais en texte brut.
- [ ] États en cercle : Corail plein = découverte, contour Encre = presque, Gris encre = échec, Encre plein = déjà connu.
- [ ] Rareté : triangle (commune), carré (peu commune), pentagone (rare), diamant (légendaire), remplie d'Ambre, cernée d'Encre 1,5 px, avec libellé, jamais posée sur une brique.
- [ ] Interactions : survol −2 px / ombre 6 px ; pression +2 px / ombre 1 px ; désactivé 40 % ; sélectionné fond Encre.

**Typographie, langue, thèmes** :
- [ ] `--serif` pour les mots, `--sans` pour l'interface, `--mono` pour les métadonnées ; cursive réservée au rituel d'écriture.
- [ ] Vocabulaire : « pli » (jamais « pack »), « codex » (jamais « Pokédex »/« inventaire »), « exemplaire », « réserve », « brique », « table de fusion », « fascicule ». Langues en toutes lettres (« grec ancien », jamais « GRC »).
- [ ] Typographie française : « » avec espaces insécables, espace insécable avant `: ; ? !`, apostrophe ’, « 5,9 % », « 1 320 ». Vouvoiement et impératif.
- [ ] Nocturne : neutres inversés, couleurs de ressource inchangées, tout reste lisible.
- [ ] Rien de ce que la boussole met « à éviter » : parchemins et plumes, dégradés violets, ombres molles, cartes trop arrondies, drapeaux pour les langues, codes de langue.

## 6. Rapport

Rendre un rapport court, dans l'ordre :

1. **Verdict** : `conforme`, `conforme avec réserves` ou `non conforme`.
2. **Attentes** : tableau `attente | résultat (ok / écart / non vérifié) | preuve (capture, viewport, thème)`.
3. **Identité** : résultat du script (erreurs nouvelles, écarts préexistants) et points de la checklist en écart, avec sélecteur ou `fichier:ligne`, règle enfreinte, correction proposée.
4. **Technique** : console, réseau, débordement, cibles tactiles, contraste, focus.
5. **Non vérifié** et pourquoi (outil indisponible, donnée absente).
6. **Suite** : commande suivante (`/fix …` pour un écart, sinon rien).

Ne jamais déclarer `conforme` sur un point non regardé. Une capture à l'appui de chaque écart. Fin : fermer l'onglet ouvert (`tabs_close_mcp`), remettre thème, viewport et `localStorage` dans l'état initial, ne pas arrêter une app qu'on n'a pas lancée.
