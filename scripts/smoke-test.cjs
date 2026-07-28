const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const cheerio = require(path.join(projectRoot, 'node_modules', 'cheerio'))

const requestStats = { total: 0 }

global.App = {
  createRequestManager(configuration) {
    return {
      async schedule(originalRequest) {
        requestStats.total += 1
        const request = configuration.interceptor?.interceptRequest
          ? await configuration.interceptor.interceptRequest({ ...originalRequest })
          : originalRequest
        const fetchResponse = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.method === 'POST' ? request.data : undefined,
        })
        let response = { status: fetchResponse.status, data: await fetchResponse.text() }
        if (configuration.interceptor?.interceptResponse) {
          response = await configuration.interceptor.interceptResponse(response)
        }
        return response
      },
    }
  },
  createRequest: value => value,
  createSourceManga: value => value,
  createMangaInfo: value => value,
  createChapter: value => value,
  createChapterDetails: value => value,
  createPartialSourceManga: value => value,
  createTagSection: value => value,
  createTag: value => value,
  createSearchField: value => value,
  createPagedResults: value => value,
  createHomeSection: value => value,
}

const bundlePath = path.join(projectRoot, 'bundles', 'HentaiOrigines', 'source.js')
const { HentaiOrigines, HentaiOriginesInfo } = require(bundlePath)
const source = new HentaiOrigines(cheerio)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function verifyReader(mangaId, chapterId) {
  const details = await source.getChapterDetails(mangaId, chapterId)
  assert(details.id === chapterId, `Identifiant de chapitre incorrect : ${mangaId}`)
  assert(details.mangaId === mangaId, `Identifiant de manga incorrect : ${mangaId}`)
  assert(details.pages.length > 0, `Aucune page : ${mangaId}/${chapterId}`)
  assert(new Set(details.pages).size === details.pages.length, `Pages dupliquées : ${mangaId}/${chapterId}`)
  assert(details.pages.every(page => page.startsWith('https://')), `URL de page invalide : ${mangaId}/${chapterId}`)

  const imageResponse = await fetch(details.pages[0], { headers: { Range: 'bytes=0-63' } })
  const contentType = imageResponse.headers.get('content-type') ?? ''
  assert(imageResponse.ok && contentType.startsWith('image/'), `Image inaccessible : ${mangaId}/${chapterId}`)

  return { mangaId, chapterId, pages: details.pages.length, imageStatus: imageResponse.status, contentType }
}

async function main() {
  assert(HentaiOriginesInfo.version === '3.2', 'Version du bundle incorrecte')
  assert(HentaiOriginesInfo.contentRating === 'ADULT', 'Classification adulte incorrecte')

  const mangaId = 'mes-partenaires-etaient-en-realite-ma-famille'
  const manga = await source.getMangaDetails(mangaId)
  assert(manga.mangaInfo.titles[0], 'Titre de manga absent')
  assert(manga.mangaInfo.image.startsWith('https://'), 'Couverture invalide')
  assert(manga.mangaInfo.hentai === true, 'Classification de la fiche incorrecte')

  const chapters = await source.getChapters(mangaId)
  assert(chapters.length > 0, 'Liste des chapitres vide')
  assert(new Set(chapters.map(chapter => chapter.id)).size === chapters.length, 'Chapitres dupliqués')

  const readerSamples = await Promise.all([
    verifyReader(mangaId, 'chapitre-1'),
    verifyReader('secret-class', 'chapitre-302'),
    verifyReader('love-factory', 'chapitre-28'),
    verifyReader('my-daughter', 'chapitre-16'),
    verifyReader('the-hole-is-open', 'chapitre-150'),
  ])

  const tags = await source.getSearchTags()
  const fields = await source.getSearchFields()
  assert(tags.find(section => section.label === 'Genres')?.tags.length >= 60, 'Liste des genres incomplète')
  assert(tags.map(section => section.label).join('|') === 'Genres|Condition sur les genres|Contenu pour adulte|Statut|Tri', 'Ordre des filtres incorrect')
  assert(fields.map(field => field.id).join('|') === 'author|artist|release', 'Champs avancés incomplets')

  const search = await source.getSearchResults({
    title: 'Secret Class',
    includedTags: [{ id: 'm_orderby=alphabet', label: 'A-Z' }],
    excludedTags: [],
    parameters: {},
  })
  assert(search.results.some(result => result.title === 'Secret Class'), 'Recherche par titre incorrecte')

  const homeSections = []
  await source.getHomePageSections(section => homeSections.push(section))
  assert(homeSections.map(section => section.id).join('|') === 'latest|new-manga|trending|views', 'Sections d’accueil incorrectes')
  assert(homeSections.every(section => section.items.length > 0), 'Une section d’accueil est vide')

  const moreLatest = await source.getViewMoreItems('latest', null)
  assert(moreLatest.results.length > 0, 'Pagination de l’accueil vide')
  const nextLatest = await source.getViewMoreItems('latest', moreLatest.metadata)
  assert(nextLatest.results.length > 0, 'Deuxième page de l’accueil vide')
  assert(nextLatest.results[0].mangaId !== moreLatest.results[0].mangaId, 'La pagination répète la première page')

  const bypass = await source.getCloudflareBypassRequestAsync()
  assert(bypass.url === 'https://hentai-origines.com', 'URL de bypass Cloudflare incorrecte')

  console.log(JSON.stringify({
    version: HentaiOriginesInfo.version,
    manga: manga.mangaInfo.titles[0],
    chapters: chapters.length,
    readers: readerSamples,
    searchSections: tags.map(section => ({ label: section.label, count: section.tags.length })),
    homeSections: homeSections.map(section => ({ id: section.id, items: section.items.length })),
    networkRequests: requestStats.total,
    result: 'OK',
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
