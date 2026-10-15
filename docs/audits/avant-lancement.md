# Audits avant lancement (J8, App#31)

Relevé du 2026-10-11, sur la branche `feature/app-31-audits`. Il sépare ce qui est **vérifié et protégé par un test**, ce qui est **relevé à la lecture du code**, et ce qui **ne peut pas être contrôlé sans un appareil, un lecteur d'écran ou le hors-prod**. Rien n'est dit « conforme » sans l'une des deux premières preuves.

## Dépendances

| Contrôle | Résultat |
|---|---|
| `cargo audit` (CI : étape « Audit the dependencies ») | 0 vulnérabilité. Un avertissement (`yoke-derive` 0.8.3, retiré du registre) levé par `cargo update -p yoke-derive` |
| `npm audit --audit-level=high` (CI : « Audit the dependencies ») | 0 vulnérabilité |
| Ajout de `axe-core` en dépendance de **développement** (pour l'audit d'accessibilité) | `npm audit` reste à 0 |
| Mises à jour en attente | PR Dependabot #50 (npm) et #51 (cargo), à relire par le propriétaire |

Les deux audits tournent déjà en CI sur chaque PR. Ils ne tournent pas sur un calendrier : une vulnérabilité publiée entre deux PR n'est vue qu'à la PR suivante. **Écart E1** (voir plus bas).

## Sécurité

| Point (ADR 0024, 0010) | Preuve |
|---|---|
| Session invité : le serveur ne garde que l'empreinte SHA-256 du secret ; comparaison à temps constant | `crates/api/src/secret.rs` (`subtle::ConstantTimeEq`), tests unitaires |
| Jeton HMAC-SHA256, 15 minutes, séparation de domaine, taille bornée avant décodage, un seul algorithme | `crates/api/src/jeton.rs`, 4 tests (expiré, modifié, autre clé, trop long) |
| Autorité du serveur, commandes transactionnelles et idempotentes | un test d'intégration par commande rejoue la commande et vérifie la même réponse (`ricochet`, `jalon`, `cadeau`, `carte_lecteur`, `quetes_initiales`, …) |
| `/dev/reset` absent en production | test `durcissement.rs::la_reinitialisation_est_absente_en_production` (`404`) |
| Corps borné (8 Kio) et propriétés inconnues refusées | tests `durcissement.rs` (toutes les routes `POST`, avec garde-fou sur la liste) et `contrat/tests/requetes_strictes.rs` |
| SQL paramétré et vérifié à la compilation | `sqlx::query!` partout (`.sqlx/` contrôlé en CI) |
| En-têtes de l'API : `no-store`, `nosniff`, `no-referrer`, HSTS, CSP `default-src 'none'` | test `api.rs` |
| Limitation de débit | par instance en mémoire ; recommandation chiffrée dans la roadmap (« Durcissement avant lancement ») |

Relevé à la lecture, sans test :

- **E2 (faible)** : l'adresse réseau est la dernière entrée de `X-Forwarded-For` (`extraction.rs`). C'est juste derrière le proxy de Scaleway, qui l'ajoute ; si l'API était un jour joignable sans proxy, un client pourrait choisir sa propre clé de limitation. À revérifier si l'hébergement change.
- Un jeton n'est pas révocable avant ses 15 minutes : acceptable pour un profil invité sans donnée personnelle.

## Vie privée

| Point | Preuve |
|---|---|
| Aucune donnée personnelle stockée | schéma : `joueur` ne porte que l'identifiant, l'empreinte du secret, des versions et des dates ; aucune adresse réseau |
| Journaux sans secret, jeton, identifiant de joueur ni adresse réseau | test `journaux.rs` (requêtes et erreurs portant ces valeurs) ; relevé des `tracing::` : seuls des nombres, des versions et des causes internes |
| Conservation | `purger` (commandes, quêtes du jour, réponses de ricochets du jour : 30 jours) ; durées documentées dans `purges.rs` et le README |
| Agrégats | aucun identifiant de joueur ; groupes de moins de 50 joueurs masqués (`cohortes.rs`, test) |

Non couvert : **mentions légales et licences** affichées au joueur (écran Réglages : « Licences » présent, contenu à faire relire), **information sur la collecte** avant diffusion publique (ADR 0010 : « le produit explique la collecte et offre les contrôles requis »), **télémétrie** (pas encore implémentée : J7). **E3** : texte d'information et contrôles de la télémétrie à écrire avant son activation.

## Accessibilité

Test automatique `web/src/a11y.test.tsx` (axe-core, 9 écrans : table, codex, plis, trois onglets des quêtes, boutique, ricochets, réglages), **hors contraste** (jsdom n'a pas de mise en page).

- Il a relevé **deux écarts réels, corrigés** : l'ordre des titres sur l'écran Table (état « Aucun mot possible pour l'instant ») et sur Réglages (des `h3` sans `h2`) ; ces titres sont devenus des `h2`.
- Les écrans restent à zéro violation, dont les nouvelles sections des quêtes (carte de lecteur, cadeau, quêtes initiales).

Non vérifiable ici, **à faire avec un appareil** :

- **E4** : contraste des textes et des bordures, jour et nuit, sur les 9 écrans (le contrôle `check_identity` ne vérifie que la palette de `styles.css`, pas le contraste rendu).
- **E5** : parcours complet **au clavier seul**, y compris la séance de ricochets (écrans modaux, découpe tactile, paires) et la table de fusion.
- **E6** : lecteur d'écran (VoiceOver iOS/macOS, TalkBack) sur la table, le pli, la séance de ricochets et la carte de lecteur ; annonces des changements d'état (tampon, récompense récupérée).
- **E7** : mouvement réduit : les animations sont écrites avec `prefers-reduced-motion` dans `codex.css`, `plis.css`, `ricochets.css` et `styles.css` ; `quetes.css` n'anime rien. Le comportement se contrôle à l'écran (skill `animation-check`).
- Les écrans ouverts par un geste (séance de ricochets, fiche d'une carte, réserve) ne sont pas dans le test automatique, qui ne charge que les routes.

## Écarts à ouvrir (une issue chacun, **non créées** : à décider)

| N° | Titre proposé | Gravité |
|---|---|---|
| E1 | Lancer `cargo audit` et `npm audit` chaque semaine, pas seulement à chaque PR | faible |
| E2 | Vérifier que la limitation par adresse reste juste si l'API n'est plus derrière le proxy | faible |
| E3 | Rédiger l'information sur la collecte et les contrôles avant d'activer la télémétrie (texte et opposition décidés par l'ADR 0072 du dépôt Design ; à implémenter, avis du conseil à obtenir) | bloquant avant J7 |
| E4 | Contrôler les contrastes rendus sur les neuf écrans, jour et nuit | moyen |
| E5 | Parcourir l'application au clavier seul, séance de ricochets comprise | moyen |
| E6 | Passer un lecteur d'écran sur les parcours principaux | moyen |
| E7 | Vérifier le mouvement réduit écran par écran | faible |
| E8 | Étendre le test axe aux écrans ouverts par un geste (séance de ricochets, réserve, fiche) | faible |
