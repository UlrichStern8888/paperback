const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const cheerio = require(path.join(root, 'node_modules', 'cheerio'))

global.App = {
  createRequestManager(configuration) {
    return { async schedule(original) {
      const request = configuration.interceptor?.interceptRequest ? await configuration.interceptor.interceptRequest({ ...original }) : original
      const fetched = await fetch(request.url, { method: request.method, headers: request.headers, body: request.method === 'POST' ? request.data : undefined })
      let response = { status: fetched.status, data: await fetched.text() }
      if (configuration.interceptor?.interceptResponse) response = await configuration.interceptor.interceptResponse(response)
      return response
    } }
  },
  createRequest: value => value, createSourceManga: value => value, createMangaInfo: value => value,
  createChapter: value => value, createChapterDetails: value => value, createPartialSourceManga: value => value,
  createTagSection: value => value, createTag: value => value, createSearchField: value => value,
  createPagedResults: value => value, createHomeSection: value => value,
}

function assert(value, message) { if (!value) throw new Error(message) }
function source(folder, name) { const module = require(path.join(root, 'bundles', folder, 'source.js')); return new module[name](cheerio) }

async function imageWorks(url, referer) {
  const response = await fetch(url, { headers: { Referer: referer, Range: 'bytes=0-127' } })
  assert(response.ok, `Image HTTP ${response.status}: ${url}`)
  assert((response.headers.get('content-type') || '').startsWith('image/'), `Réponse non image: ${url}`)
}

async function main() {
  const ortega = source('OrtegaScans', 'OrtegaScans')
  const omanga = await ortega.getMangaDetails('love-quest')
  const ochapters = await ortega.getChapters('love-quest')
  const opages = await ortega.getChapterDetails('love-quest', '25')
  const ohome = []
  await ortega.getHomePageSections(section => ohome.push(section))
  assert(omanga.mangaInfo.titles[0] === 'Love Quest', 'Fiche Ortega incorrecte')
  assert(ochapters.length >= 25, 'Chapitres Ortega incomplets')
  assert(opages.pages.length === 25, 'Pages Ortega incomplètes')
  assert(ohome.map(section => section.id).join('|') === 'latest|new|popular', 'Accueil Ortega incomplet')
  assert(ohome.every(section => section.items.length > 0), 'Section Ortega vide')
  const otags = await ortega.getSearchTags()
  assert((otags.find(section => section.id === 'genres')?.tags.length ?? 0) >= 25, 'Genres Ortega incomplets')
  assert((otags.find(section => section.id === 'status')?.tags.length ?? 0) === 4, 'Statuts Ortega incomplets')
  assert((otags.find(section => section.id === 'sort')?.tags.length ?? 0) === 3, 'Tris Ortega incomplets')
  const allOrtega = []
  let ometadata
  let opageCount = 0
  do {
    const page = await ortega.getSearchResults({ title: '', includedTags: [], excludedTags: [], parameters: {} }, ometadata)
    allOrtega.push(...page.results)
    ometadata = page.metadata
    opageCount++
  } while (ometadata && opageCount < 20)
  assert(allOrtega.length >= 200, `Catalogue Ortega incomplet: ${allOrtega.length}`)
  assert(new Set(allOrtega.map(item => item.mangaId)).size === allOrtega.length, 'Pagination Ortega dupliquée')
  assert(!ometadata, 'Pagination Ortega sans fin')
  const oalpha = await ortega.getSearchResults({ title: '', includedTags: [{ id: 'sort=alpha' }], excludedTags: [], parameters: {} })
  const alphaTitles = oalpha.results.map(item => item.title)
  assert(alphaTitles.every((title, index) => index === 0 || alphaTitles[index - 1].localeCompare(title, 'fr', { sensitivity: 'base' }) <= 0), 'Tri alphabétique Ortega incorrect')
  await imageWorks(opages.pages[0], 'https://ortegascans.fr/')

  const scansfr = source('ScansFRNSFW', 'ScansFRNSFW')
  const smanga = await scansfr.getMangaDetails('a-wonderful-new-world')
  const schapters = await scansfr.getChapters('a-wonderful-new-world')
  const spages = await scansfr.getChapterDetails('a-wonderful-new-world', '1')
  const shome = []
  await scansfr.getHomePageSections(section => shome.push(section))
  const stags = await scansfr.getSearchTags()
  const stype = stags.find(section => section.id === 'types')?.tags ?? []
  const sstatus = stags.find(section => section.id === 'status')?.tags ?? []
  const ssort = stags.find(section => section.id === 'sort')?.tags ?? []
  const smore = await scansfr.getViewMoreItems('views')
  assert(smanga.mangaInfo.hentai === true, 'Classification ScansFR incorrecte')
  assert(schapters.length >= 250, 'Chapitres ScansFR incomplets')
  assert(spages.pages.length === 7, 'Pages ScansFR incomplètes')
  assert(shome.map(section => section.id).join('|') === 'featured|updated|latest|views', `Accueil ScansFR incomplet: ${shome.map(section => `${section.id}:${section.items.length}`).join('|')}`)
  assert(shome.every(section => section.items.length > 0), 'Section ScansFR vide')
  assert(stype.length === 4, `Types ScansFR incomplets: ${stype.length}`)
  assert(sstatus.length === 4, `Statuts ScansFR incomplets: ${sstatus.length}`)
  assert(ssort.length === 5, `Tris ScansFR incomplets: ${ssort.length}`)
  assert(smore.results.length === 24 && smore.metadata?.page === 2, 'Voir plus ScansFR non paginé')
  await imageWorks(spages.pages[0], 'https://scansfr.com/nsfw/')
  let blocked = false
  try { await scansfr.getMangaDetails('killing-lawyer') } catch { blocked = true }
  assert(blocked, 'ScansFR laisse passer un manga hors NSFW')

  const free = source('FreeComicsXXX', 'FreeComicsXXX')
  const fsearch = await free.getSearchResults({ title: 'The Bet', includedTags: [], excludedTags: [], parameters: {} })
  const target = fsearch.results.find(item => item.mangaId.startsWith('series--the-bet'))
  assert(target, 'Recherche FreeComics incorrecte')
  const fchapters = await free.getChapters(target.mangaId)
  assert(fchapters.length >= 5, 'Regroupement des chapitres FreeComics incorrect')
  assert(fchapters.every((chapter, index) => chapter.chapNum === fchapters.length - index), 'Numérotation FreeComics incorrecte')
  assert(fchapters.every(chapter => chapter.name === `Chapter ${chapter.chapNum}`), 'Noms de chapitres FreeComics incorrects')
  const ftags = await free.getSearchTags()
  const genreTags = ftags.find(section => section.id === 'genres')?.tags ?? []
  const artistTags = ftags.find(section => section.id === 'artists')?.tags ?? []
  assert(genreTags.length >= 100, `Genres FreeComics incomplets: ${genreTags.length}`)
  assert(artistTags.length >= 100, `Artistes FreeComics incomplets: ${artistTags.length}`)
  const artistSearch = await free.getSearchResults({ title: '', includedTags: [{ id: 'artist=bdone' }], excludedTags: [], parameters: {} })
  assert(artistSearch.results.length > 0, 'Filtre artiste FreeComics vide')
  const singleSearch = await free.getSearchResults({ title: 'The Breakfast! Ben 10', includedTags: [], excludedTags: [], parameters: {} })
  const singleBook = singleSearch.results.find(item => item.mangaId === 'book--11826')
  assert(singleBook, 'Livre individuel FreeComics introuvable')
  const singleDetails = await free.getMangaDetails(singleBook.mangaId)
  assert(singleDetails.mangaInfo.image === singleBook.image, 'La couverture FreeComics change ou disparaît après ouverture')
  const encodedText = [...fsearch.results.map(item => item.title), ...fchapters.map(chapter => chapter.name), ...genreTags.map(tag => tag.label), ...artistTags.map(tag => tag.label)].join('|')
  assert(!/&(amp;)?#x?[0-9a-f]+;/i.test(encodedText), 'Entités HTML FreeComics non décodées')
  const fpages = await free.getChapterDetails(target.mangaId, fchapters[0].id)
  const fhome = []
  await free.getHomePageSections(section => fhome.push(section))
  assert(fpages.pages.length > 1, 'Lecteur FreeComics vide')
  assert(fhome.map(section => section.id).join('|') === 'new|popular|western|hentai|3d', 'Accueil FreeComics incomplet')
  assert(fhome.every(section => section.items.length > 0), 'Section FreeComics vide')
  await imageWorks(fpages.pages[0], 'https://www.freecomics.xxx/main1.html')

  const scantrad = source('HentaiScantradVF', 'HentaiScantradVF')
  const bypass = await scantrad.getCloudflareBypassRequestAsync()
  assert(bypass.url === 'https://hentai.scantrad-vf.cc', 'Bypass Hentai Scantrad VF incorrect')

  const iconFolders = ['HentaiOrigines', 'ScansFRNSFW', 'OrtegaScans', 'HentaiScantradVF', 'FreeComicsXXX']
  const iconHashes = iconFolders.map(folder => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'src', folder, 'includes', 'icon.png'))).digest('hex'))
  assert(new Set(iconHashes).size === iconFolders.length, 'Les favicons des sources ne sont pas distincts')

  console.log(JSON.stringify({
    OrtegaScans: { chapters: ochapters.length, pages: opages.pages.length, catalog: allOrtega.length, catalogPages: opageCount, genres: otags.find(section => section.id === 'genres')?.tags.length, home: ohome.map(section => `${section.id}:${section.items.length}`) },
    ScansFRNSFW: { chapters: schapters.length, pages: spages.pages.length, types: stype.length, statuses: sstatus.length, sorts: ssort.length, outsideNsfwBlocked: blocked, home: shome.map(section => `${section.id}:${section.items.length}`) },
    FreeComicsXXX: { chapters: fchapters.length, pages: fpages.pages.length, genres: genreTags.length, artists: artistTags.length, artistResults: artistSearch.results.length, home: fhome.map(section => `${section.id}:${section.items.length}`) },
    HentaiScantradVF: { cloudflareBypass: true }, result: 'OK'
  }, null, 2))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
