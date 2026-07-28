# Sources adultes pour Paperback 0.8

Dépôt de sources Paperback orienté lecture adulte. Toutes les sources compilent avec `@paperback/types` 0.8 et leurs bundles installables sont générés dans `bundles/`.

> Contenu strictement réservé à un public majeur.

## Sources disponibles

| Source | Langue | Périmètre | Recherche | Accueil | Chapitres / pages |
| :-- | :--: | :-- | :--: | :--: | :--: |
| HentaiOrigines | FR | Site complet | Avancée | 4 sections | Oui |
| ScansFR NSFW | FR | **Uniquement `/nsfw`** | Titre, genre, statut, tri | 4 sections | Oui, jetons d’images inclus |
| OrtegaScans | FR | Site complet | Titre, genre, statut | 3 sections | Oui, séries complètes |
| Hentai Scantrad VF | FR | Site complet | Avancée Madara | 4 sections | Oui, bypass Cloudflare |
| FreeComics.XXX | EN | `main1.html` et catalogue | Titre, genre | 5 sections | Oui, regroupement par série |

## Points importants

- ScansFR refuse toute fiche ou tout chapitre dont l’API ne confirme pas `isNsfw: true`. Les URLs Paperback restent sous `/nsfw` et le cookie de la barrière adulte est fourni par la source.
- Le lecteur ScansFR récupère un jeton de chapitre éphémère puis construit toutes les URLs signées des pages.
- OrtegaScans lit les données serveur Next.js et exclut les chapitres Premium encore verrouillés.
- FreeComics.XXX regroupe les livres partageant une page `series-*` en une seule série Paperback ; chaque livre devient un chapitre et toutes les images `cdn.freecomics.xxx/galleries/` sont rendues dans l’ordre.
- Hentai Scantrad VF déclare le bypass Cloudflare requis par Paperback.

## Recherche

La recherche standard de Paperback correspond au champ titre du site. Les filtres supplémentaires sont exposés quand le site les fournit :

- HentaiOrigines : auteur, artiste, année, genres avec condition OU/ET, statut, contenu adulte et tris officiels.
- ScansFR NSFW : genres adultes, statut, dernière mise à jour, ordre alphabétique, popularité et note.
- OrtegaScans : genres principaux et statut, avec filtrage local du catalogue complet rendu par le site.
- FreeComics.XXX : recherche texte native et navigation par genres.

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
