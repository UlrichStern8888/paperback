import {
    BadgeColor, Chapter, ChapterDetails, ChapterProviding, CloudflareBypassRequestProviding, ContentRating, HomePageSectionsProviding,
    HomeSection, HomeSectionType, MangaProviding, PagedResults, PartialSourceManga, Request, Response, SearchRequest,
    SearchResultsProviding, SourceInfo, SourceIntents, SourceManga, TagSection
} from '@paperback/types'
import { CheerioAPI } from 'cheerio'
import { getImageUrl } from '../templates/helper'

const DOMAIN = 'https://www.freecomics.xxx'

export const FreeComicsXXXInfo: SourceInfo = {
    version: '1.3', language: 'EN', name: 'FreeComics.XXX', icon: 'icon.png',
    description: 'Comics adultes avec séries, chapitres et lecteur complet.', author: 'UlrichStern',
    contentRating: ContentRating.ADULT, websiteBaseURL: `${DOMAIN}/main1.html`,
    sourceTags: [{ text: 'EN', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

type Identity = { kind: 'series' | 'book', value: string }
type SearchFacets = { genres: string[], artists: string[] }

function cleanText(value: string | undefined | null): string {
    let decoded = value ?? ''
    for (let pass = 0; pass < 3; pass++) {
        const previous = decoded
        decoded = decoded
            .replace(/&amp;/gi, '&')
            .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
                const codePoint = parseInt(hex, 16)
                return Number.isFinite(codePoint) && codePoint <= 0x10FFFF ? String.fromCodePoint(codePoint) : ''
            })
            .replace(/&#(\d+);?/g, (_, decimal: string) => {
                const codePoint = parseInt(decimal, 10)
                return Number.isFinite(codePoint) && codePoint <= 0x10FFFF ? String.fromCodePoint(codePoint) : ''
            })
            .replace(/&quot;/gi, '"')
            .replace(/&apos;|&#39;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&nbsp;/gi, ' ')
        if (decoded === previous) break
    }
    return decoded.replace(/[\s\u00A0]+/g, ' ').trim()
}

function destinationUrl(href: string): string {
    const tracked = href.match(/[?&]url=([^&]+)/)?.[1]
    if (!tracked) return href
    try { return decodeURIComponent(tracked) } catch { return tracked }
}

function routeSlug(href: string, type: 'genre' | 'artist'): string {
    return destinationUrl(href).match(new RegExp(`/${type}-(.+?)-page-\\d+\\.html`, 'i'))?.[1]?.toLowerCase() ?? ''
}

export class FreeComicsXXX implements MangaProviding, ChapterProviding, SearchResultsProviding, HomePageSectionsProviding, CloudflareBypassRequestProviding {
    constructor(private cheerio: CheerioAPI) {}
    requestManager = App.createRequestManager({ requestsPerSecond: 3, requestTimeout: 30000 })
    private coverCache = new Map<string, string>()

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({ url: `${DOMAIN}/main1.html`, method: 'GET' })
    }

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

    private rememberCover(mangaId: string, image: string): string {
        if (!image) return image
        if (this.coverCache.size >= 500) this.coverCache.delete(this.coverCache.keys().next().value ?? '')
        this.coverCache.set(mangaId, image)
        return image
    }

    private cardFacets($: CheerioAPI, card: any): SearchFacets {
        const genres = $('a[href*="genre-"]', card).map((_, element) => routeSlug($(element).attr('href') ?? '', 'genre')).get().filter(Boolean)
        const artists = $('a[href*="artist-"]', card).map((_, element) => routeSlug($(element).attr('href') ?? '', 'artist')).get().filter(Boolean)
        return { genres, artists }
    }

    private cardMatches($: CheerioAPI, card: any, query?: SearchRequest): boolean {
        if (!query) return true
        const text = cleanText($(card).text()).toLowerCase()
        if (query.title?.trim() && !text.includes(cleanText(query.title).toLowerCase())) return false

        const facets = this.cardFacets($, card)
        const included = (query.includedTags ?? []).map(tag => tag.id)
        const excluded = (query.excludedTags ?? []).map(tag => tag.id)
        const facetMatches = (id: string, whenMissing: boolean) => id.startsWith('genre=')
            ? (facets.genres.length === 0 ? whenMissing : facets.genres.includes(id.slice(6).toLowerCase()))
            : id.startsWith('artist=') && (facets.artists.length === 0 ? whenMissing : facets.artists.includes(id.slice(7).toLowerCase()))
        return included.every(id => facetMatches(id, true)) && !excluded.some(id => facetMatches(id, false))
    }

    private cardToManga($: CheerioAPI, card: any): PartialSourceManga | undefined {
        const main = $('a[href*="/books/"]', card).first()
        const bookUrl = main.attr('href') ?? main.attr('title') ?? ''
        const bookId = bookUrl.match(/\/books\/(\d+)\.html/)?.[1]
        if (!bookId) return undefined
        const seriesUrl = $('a[href*="/series-"]', card).first().attr('href') ?? ''
        const series = seriesUrl.match(/\/series-(.+)-page-\d+\.html/)?.[1]
        const mangaId = series ? `series--${series}` : `book--${bookId}`
        const img = $('img', main).first()
        const rawTitle = cleanText(main.attr('title') || img.attr('alt') || $('.bookinfo', card).first().text())
        const cardSeriesTitle = cleanText($('.bookinfo', card).first().clone().children().remove().end().text()).replace(/\s+by\s*$/i, '').trim()
        const title = cleanText(series ? cardSeriesTitle || rawTitle.replace(/\s*\(Chapter.*$/i, '') : rawTitle.replace(/\s*\(Chapter.*$/i, ''))
        const image = getImageUrl($, img)
        if (!title || !image) return undefined
        this.rememberCover(mangaId, image)
        return App.createPartialSourceManga({ mangaId, title, image, subtitle: cleanText($('.bookinfo', card).eq(1).text()) })
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const $ = await this.load(this.route(mangaId))
        const identity = this.identity(mangaId)
        const firstCard = $('.xcpreview').first()
        const title = cleanText(identity.kind === 'series'
            ? ($('.xheadtitle').clone().children().remove().end().text().replace(/^📚\s*/, '').trim() || $('h1').first().text().trim())
            : ($('title').text().replace(/\s*-\s*FreeComics.*$/i, '').replace(/\s*\(Chapter.*$/i, '').trim()))
        let image = this.coverCache.get(mangaId) ?? ''
        if (!image && identity.kind === 'series') image = getImageUrl($, $('img', firstCard).first())
        if (!image && identity.kind === 'book') {
            const search = await this.load(`/?search=${encodeURIComponent(title)}`)
            const matchingCard = search('.xcpreview').filter((_, card) => {
                const href = search('a[href*="/books/"]', card).first().attr('href') ?? ''
                return destinationUrl(href).includes(`/books/${identity.value}.html`)
            }).first()
            image = getImageUrl(search, search('img', matchingCard).first())
        }
        if (!image) image = $('meta[property="og:image"]').attr('content') ?? getImageUrl($, $('.ximg').first())
        image = this.rememberCover(mangaId, image)
        const artist = cleanText($('.xheadtitle a[href*="artist-"]').first().text() || $('a[href*="artist-"]').first().text()) || 'N/A'
        const genres = $('a[href*="genre-"]').map((_, e) => cleanText($(e).text()).replace(/^📚\s*/, '')).get().filter(Boolean)
        const tags = App.createTagSection({ id: 'genres', label: 'Genres', tags: Array.from(new Set(genres)).map(label => App.createTag({ id: label, label })) })
        return App.createSourceManga({ id: mangaId, mangaInfo: App.createMangaInfo({
            image, titles: [title], desc: cleanText($('meta[property="og:description"]').attr('content')), author: artist, artist,
            status: identity.kind === 'series' ? 'En cours' : 'Terminé', hentai: true, tags: [tags], additionalInfo: { viewer: 'webtoon' }
        }) })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const identity = this.identity(mangaId)
        let $ = await this.load(this.route(mangaId))

        if (identity.kind === 'series') {
            const firstBookHref = $('.xcpreview a[href*="/books/"]').first().attr('href') ?? ''
            const firstBookId = destinationUrl(firstBookHref).match(/\/books\/(\d+)\.html/)?.[1]
            if (firstBookId) $ = await this.load(`/books/${firstBookId}.html`)
        }

        const chapterIds: string[] = []
        $('.dropdown-content a[href*="/books/"]').each((_, link) => {
            const id = destinationUrl($(link).attr('href') ?? '').match(/\/books\/(\d+)\.html/)?.[1]
            if (id && !chapterIds.includes(id)) chapterIds.push(id)
        })
        if (!chapterIds.length && identity.kind === 'book') chapterIds.push(identity.value)

        return chapterIds.map((id, index) => App.createChapter({
            id,
            name: `Chapter ${index + 1}`,
            langCode: 'EN',
            chapNum: index + 1,
            volume: 0,
            time: new Date(0)
        })).reverse()
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const $ = await this.load(`/books/${chapterId}.html`)
        const pages = $('.ximg').map((_, e) => getImageUrl($, e)).get().filter(url => url.includes('cdn.freecomics.xxx/galleries/'))
        if (!pages.length) throw new Error(`FreeComics.XXX: aucune page pour ${chapterId}`)
        return App.createChapterDetails({ id: chapterId, mangaId, pages: Array.from(new Set(pages)) })
    }

    private parseCards($: CheerioAPI, query?: SearchRequest): PartialSourceManga[] {
        const map = new Map<string, PartialSourceManga>()
        $('.xcpreview').each((_, card) => {
            if (!this.cardMatches($, card, query)) return
            const item = this.cardToManga($, card)
            if (item) map.set(item.mangaId, item)
        })
        return [...map.values()]
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const included = (query.includedTags ?? []).map(tag => tag.id)
        const genre = included.find(id => id.startsWith('genre='))?.slice(6)
        const artist = included.find(id => id.startsWith('artist='))?.slice(7)
        let path: string
        if (query.title?.trim()) path = `/?search=${encodeURIComponent(query.title.trim())}`
        else if (artist) path = `/artist-${artist}-page-${page}.html`
        else if (genre) path = `/genre-${genre}-page-${page}.html`
        else path = `/new-porn-${page}.html`
        const results = this.parseCards(await this.load(path), query)
        return App.createPagedResults({ results, metadata: results.length >= 20 && !query.title?.trim() ? { page: page + 1 } : undefined })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const $ = await this.load('/main1.html')
        const genres = new Map<string, string>()
        $('.xcpreview a').each((_, link) => {
            const href = $(link).attr('href') ?? ''
            const slug = routeSlug(href, 'genre')
            const label = cleanText($('.xcpin', link).text() || $(link).text()).replace(/^📚\s*/, '')
            if (slug && label) genres.set(slug, label)
        })

        const artists = new Map<string, string>()
        $('a[href*="/artist-"][href*="-page-1.html"]').each((_, link) => {
            const href = $(link).attr('href') ?? ''
            const slug = routeSlug(href, 'artist')
            const label = cleanText($(link).text()).replace(/^🎨\s*/, '').replace(/\s*•\s*\d+\s*$/, '')
            if (slug && label && !artists.has(slug)) artists.set(slug, label)
        })

        const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], 'en', { sensitivity: 'base' })
        return [
            App.createTagSection({ id: 'genres', label: `Genres (${genres.size})`, tags: [...genres].sort(byLabel).map(([id, label]) => App.createTag({ id: `genre=${id}`, label })) }),
            App.createTagSection({ id: 'artists', label: `Artists (${artists.size})`, tags: [...artists].sort(byLabel).map(([id, label]) => App.createTag({ id: `artist=${id}`, label })) })
        ]
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
