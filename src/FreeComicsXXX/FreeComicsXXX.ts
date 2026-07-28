import {
    BadgeColor, Chapter, ChapterDetails, ChapterProviding, ContentRating, HomePageSectionsProviding,
    HomeSection, HomeSectionType, MangaProviding, PagedResults, PartialSourceManga, Response, SearchRequest,
    SearchResultsProviding, SourceInfo, SourceIntents, SourceManga, TagSection
} from '@paperback/types'
import { CheerioAPI } from 'cheerio'
import { getImageUrl } from '../templates/helper'

const DOMAIN = 'https://www.freecomics.xxx'

export const FreeComicsXXXInfo: SourceInfo = {
    version: '1.0', language: 'EN', name: 'FreeComics.XXX', icon: 'icon.png',
    description: 'Comics adultes avec séries, chapitres et lecteur complet.', author: 'UlrichStern',
    contentRating: ContentRating.ADULT, websiteBaseURL: `${DOMAIN}/main1.html`,
    sourceTags: [{ text: 'EN', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}

type Identity = { kind: 'series' | 'book', value: string }

export class FreeComicsXXX implements MangaProviding, ChapterProviding, SearchResultsProviding, HomePageSectionsProviding {
    constructor(private cheerio: CheerioAPI) {}
    requestManager = App.createRequestManager({ requestsPerSecond: 3, requestTimeout: 30000 })

    private async load(path: string) {
        const response: Response = await this.requestManager.schedule(App.createRequest({ url: path.startsWith('http') ? path : `${DOMAIN}${path}`, method: 'GET', headers: { Referer: `${DOMAIN}/main1.html` } }), 2)
        if (response.status < 200 || response.status >= 400) throw new Error(`FreeComics.XXX: erreur HTTP ${response.status}`)
        return this.cheerio.load(String(response.data))
    }
    private identity(id: string): Identity {
        if (id.startsWith('series--')) return { kind: 'series', value: id.slice(8) }
        return { kind: 'book', value: id.replace(/^book--/, '') }
    }
    private route(id: string) {
        const item = this.identity(id)
        return item.kind === 'series' ? `/series-${item.value}-page-1.html` : `/books/${item.value}.html`
    }
    getMangaShareUrl(mangaId: string) { return `${DOMAIN}${this.route(mangaId)}` }

    private cardToManga($: CheerioAPI, card: any): PartialSourceManga | undefined {
        const main = $('a[href*="/books/"]', card).first()
        const bookUrl = main.attr('href') ?? main.attr('title') ?? ''
        const bookId = bookUrl.match(/\/books\/(\d+)\.html/)?.[1]
        if (!bookId) return undefined
        const seriesUrl = $('a[href*="/series-"]', card).first().attr('href') ?? ''
        const series = seriesUrl.match(/\/series-(.+)-page-\d+\.html/)?.[1]
        const mangaId = series ? `series--${series}` : `book--${bookId}`
        const img = $('img', main).first()
        const rawTitle = main.attr('title') || img.attr('alt') || $('.bookinfo', card).first().text()
        const title = series ? $('.bookinfo', card).first().clone().children().remove().end().text().replace(/\s+by\s*$/i, '').trim() || rawTitle.replace(/\s*\(Chapter.*$/i, '') : rawTitle.replace(/\s*\(Chapter.*$/i, '')
        const image = getImageUrl($, img)
        if (!title || !image) return undefined
        return App.createPartialSourceManga({ mangaId, title, image, subtitle: $('.bookinfo', card).eq(1).text().trim() })
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const $ = await this.load(this.route(mangaId))
        const identity = this.identity(mangaId)
        const firstCard = $('.xcpreview').first()
        const title = identity.kind === 'series'
            ? ($('.xheadtitle').clone().children().remove().end().text().replace(/^📚\s*/, '').trim() || $('h1').first().text().trim())
            : ($('title').text().replace(/\s*-\s*FreeComics.*$/i, '').replace(/\s*\(Chapter.*$/i, '').trim())
        const image = identity.kind === 'series' ? getImageUrl($, $('img', firstCard).first()) : ($('meta[property="og:image"]').attr('content') ?? getImageUrl($, $('.ximg').first()))
        const artist = $('.xheadtitle a[href*="artist-"]').first().text().trim() || $('a[href*="artist-"]').first().text().trim() || 'N/A'
        const genres = $('a[href*="genre-"]').map((_, e) => $(e).text().trim()).get().filter(Boolean)
        const tags = App.createTagSection({ id: 'genres', label: 'Genres', tags: Array.from(new Set(genres)).map(label => App.createTag({ id: label, label })) })
        return App.createSourceManga({ id: mangaId, mangaInfo: App.createMangaInfo({
            image, titles: [title], desc: $('meta[property="og:description"]').attr('content') ?? '', author: artist, artist,
            status: identity.kind === 'series' ? 'En cours' : 'Terminé', hentai: true, tags: [tags], additionalInfo: { viewer: 'webtoon' }
        }) })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const identity = this.identity(mangaId)
        const $ = await this.load(this.route(mangaId))
        if (identity.kind === 'book') {
            const name = $('.dropbtn').first().text().replace(/^📖\s*/, '').trim() || 'Chapter 1'
            const number = Number(name.match(/\d+(?:\.\d+)?/)?.[0] ?? 1)
            return [App.createChapter({ id: identity.value, name, langCode: 'EN', chapNum: number, volume: 0, time: new Date(0) })]
        }
        const chapters = new Map<string, Chapter>()
        $('.xcpreview').each((_, card) => {
            const href = $('a[href*="/books/"]', card).first().attr('href') ?? ''
            const id = href.match(/\/books\/(\d+)\.html/)?.[1]
            if (!id) return
            const label = $('.bookinfo', card).eq(1).text().trim() || $('a[href*="/books/"]', card).first().attr('title')?.match(/\((Chapter[^)]+)\)/i)?.[1] || `Chapter ${id}`
            const number = Number(label.match(/\d+(?:\.\d+)?/)?.[0] ?? chapters.size + 1)
            const date = $('.xdate', card).text().trim()
            chapters.set(id, App.createChapter({ id, name: label, langCode: 'EN', chapNum: number, volume: 0, time: date ? new Date(date) : new Date(0) }))
        })
        return [...chapters.values()].sort((a, b) => b.chapNum - a.chapNum)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const $ = await this.load(`/books/${chapterId}.html`)
        const pages = $('.ximg').map((_, e) => getImageUrl($, e)).get().filter(url => url.includes('cdn.freecomics.xxx/galleries/'))
        if (!pages.length) throw new Error(`FreeComics.XXX: aucune page pour ${chapterId}`)
        return App.createChapterDetails({ id: chapterId, mangaId, pages: Array.from(new Set(pages)) })
    }

    private parseCards($: CheerioAPI): PartialSourceManga[] {
        const map = new Map<string, PartialSourceManga>()
        $('.xcpreview').each((_, card) => { const item = this.cardToManga($, card); if (item) map.set(item.mangaId, item) })
        return [...map.values()]
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const genre = (query.includedTags ?? []).find(tag => tag.id.startsWith('genre='))?.id.slice(6)
        let path: string
        if (query.title?.trim()) path = `/?search=${encodeURIComponent(query.title.trim())}`
        else if (genre) path = `/genre-${genre}-page-${page}.html`
        else path = `/new-porn-${page}.html`
        const results = this.parseCards(await this.load(path))
        return App.createPagedResults({ results, metadata: results.length >= 20 && !query.title?.trim() ? { page: page + 1 } : undefined })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const genres = ['western','hentai','3d','cartoon','webtoon','full-color','romance','fantasy','comedy','futanari','bdsm','harem']
        return [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(id => App.createTag({ id: `genre=${id}`, label: id.replace(/-/g, ' ') })) })]
    }

    async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
        const definitions = [
            { id: 'new', title: 'Nouveaux comics', path: '/new-porn-1.html' },
            { id: 'popular', title: 'Populaires', path: '/popular-porn-1.html' },
            { id: 'western', title: 'Western', path: '/genre-western-page-1.html' },
            { id: 'hentai', title: 'Hentai', path: '/genre-hentai-page-1.html' },
            { id: '3d', title: '3D', path: '/genre-3d-page-1.html' }
        ]
        for (const definition of definitions) {
            const section = App.createHomeSection({ id: definition.id, title: definition.title, type: HomeSectionType.singleRowNormal, containsMoreItems: true })
            section.items = this.parseCards(await this.load(definition.path))
            callback(section)
        }
    }
    async getViewMoreItems(id: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const path = id === 'new' || id === 'popular' ? `/${id}-porn-${page}.html` : `/genre-${id}-page-${page}.html`
        const results = this.parseCards(await this.load(path))
        return App.createPagedResults({ results, metadata: results.length >= 20 ? { page: page + 1 } : undefined })
    }
}
