# Sources adultes pour Paperback 0.8

Dépôt de sources Paperback orienté lecture adulte. Toutes les sources compilent avec `@paperback/types` 0.8 et leurs bundles installables sont générés dans `bundles/`.

> Contenu strictement réservé à un public majeur.

## Sources disponibles

| Source | Langue | Périmètre | Recherche | Accueil | Chapitres / pages |
| :-- | :--: | :-- | :--: | :--: | :--: |
| HentaiOrigines | FR | Site complet | Avancée | 4 sections | Oui |
| ScansFR NSFW | FR | **Uniquement `/nsfw`** | Titre, type, genre, statut, chapitres, tri | 4 sections | Oui, jetons d’images inclus |
| OrtegaScans | FR | Site complet | API complète, genres, statut, chapitres, catalogue, tri | 3 sections | Oui, séries complètes |
| Hentai Scantrad VF | FR | Site complet | Avancée Madara et pagination progressive | 4 sections | Oui, bypass Cloudflare |
| FreeComics.XXX | EN | `main1.html` et catalogue | Titre, 114 genres dynamiques, artistes | 5 sections | Oui, regroupement par série |

## Points importants

- ScansFR refuse toute fiche ou tout chapitre dont l’API ne confirme pas `isNsfw: true`. Les URLs Paperback restent sous `/nsfw` et le cookie de la barrière adulte est fourni par la source.
- Le lecteur ScansFR récupère un jeton de chapitre éphémère puis construit toutes les URLs signées des pages.
- OrtegaScans utilise l’API paginée du site au lieu des seules cartes SSR et exclut les chapitres Premium encore verrouillés.
- FreeComics.XXX regroupe les livres partageant une page `series-*` en une seule série Paperback. La liste canonique des livres vient du menu `.dropdown-content`, puis les chapitres sont renumérotés proprement. Les entités HTML, y compris les formes doublement encodées `&amp;#x…;`, sont décodées.
- Les couvertures FreeComics sont conservées entre la liste et la fiche. Pour un livre ouvert directement, la source retrouve sa miniature dans la recherche du site avant d'utiliser la première page du lecteur en dernier recours.
- Les cinq sources déclarent le bypass Cloudflare : le bouton nuage reste disponible dans Paperback même lorsqu'une protection apparaît temporairement.

## Recherche

La recherche standard de Paperback correspond au champ titre du site. Les filtres supplémentaires sont exposés quand le site les fournit :

- HentaiOrigines : auteur, artiste, année, genres avec condition OU/ET, statut, contenu adulte et tris officiels.
- ScansFR NSFW : 4 types, genres dynamiques, 4 statuts, chapitres minimum et les 5 tris officiels. Les pages sont chargées progressivement par lots de 24.
- OrtegaScans : catalogue API complet, 30 genres dynamiques actuellement, 4 statuts, chapitres minimum, séries Ortega uniquement et les tris Popularité, Ordre alphabétique et Plus récent. Les résultats sont chargés progressivement par lots de 18.
- Hentai Scantrad VF : filtres Madara complets et chargement progressif tant que le site expose une page suivante, quelle que soit la taille de la page.
- FreeComics.XXX : recherche texte native, tous les genres de `main1.html`, liste dynamique des artistes, filtres inclus/exclus et pagination par artiste ou genre.

## Page d’accueil Paperback

- HentaiOrigines : dernières sorties, nouveaux titres, tendances, plus vus.
- ScansFR NSFW : à la une, dernières sorties, nouveautés et top, sans mélange avec le catalogue général.
- OrtegaScans : dernières sorties, nouvelles séries et séries populaires.
- FreeComics.XXX : nouveaux comics, populaires, Western, Hentai et 3D.

## Icônes

Chaque source possède son propre favicon officiel dans `src/<Source>/includes/icon.png`. Les icônes ne sont plus dupliquées. Lorsque Cloudflare empêche le téléchargement direct (Hentai Scantrad VF), le favicon PNG mis en cache pour le domaine est utilisé.

## Installer et compiler

Prérequis : Node.js 22 et npm.

```bash
npm ci
npm run typecheck
npm run bundle
```

Le dossier à publier sur GitHub est **le projet complet**, pas seulement `src/`. Conservez au minimum :

```text
.github/
bundles/
scripts/
src/
package.json
package-lock.json
tsconfig.json
README.md
LICENSE
```

Ne publiez pas `node_modules/`.

## Vérification réelle

```bash
npm run verify:live
```

Cette commande effectue le typage, produit les cinq bundles, puis teste sur les sites réels les fiches, listes de chapitres, recherches, pages d’accueil et lecteurs. Le test multi-source contrôle notamment 25 pages OrtegaScans, 7 URLs signées ScansFR, le blocage d’un titre non-NSFW et une série FreeComics de plusieurs chapitres.

## Structure

```text
src/
├── FreeComicsXXX/
├── HentaiOrigines/
├── HentaiScantradVF/
├── OrtegaScans/
├── ScansFRNSFW/
└── templates/
scripts/
├── smoke-test.cjs
└── smoke-test-multisource.cjs
bundles/
```
