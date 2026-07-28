import {
    BadgeColor, Chapter, ChapterDetails, ChapterProviding, CloudflareBypassRequestProviding, ContentRating,
    HomePageSectionsProviding, HomeSection, HomeSectionType, MangaProviding, PagedResults, PartialSourceManga,
    Request, Response, SearchRequest, SearchResultsProviding, SourceInfo, SourceIntents, SourceManga, TagSection
} from '@paperback/types'
import { CheerioAPI } from 'cheerio'
import { getImageUrl, getSlugFromUrl } from '../templates/helper'

const DOMAIN = 'https://scansfr.com'
const API = 'https://api.scansfr.com'
const COOKIE = 'scansfr_age_verified=true'

interface MangaJson {
    title: string; description?: string; cover: string; status?: string; tags?: string[]; author?: string; artist?: string;
    alternativeTitles?: string[]; isNsfw: boolean; chaptersList?: Array<{ number: number; title?: string; date?: string; isEarlyAccess?: boolean }>
}
interface ChapterJson { id: string; pageCount: number; mangaIsNsfw: boolean }
interface TokenJson { sig: string; exp: number; sessionHash: string; chapterId: string; pageCount: number }

export const ScansFRNSFWInfo: SourceInfo = {
    version: '1.0', language: 'FR', name: 'ScansFR NSFW', icon: 'icon.png',
    description: 'Catalogue ScansFR limité strictement à /nsfw.', author: 'UlrichStern',
    contentRating: ContentRating.ADULT, websiteBaseURL: `${DOMAIN}/nsfw`,
    sourceTags: [{ text: 'NSFW FR', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class ScansFRNSFW implements MangaProviding, ChapterProviding, SearchResultsProviding, HomePageSectionsProviding, CloudflareBypassRequestProviding {
    constructor(private cheerio: CheerioAPI) {}
    requestManager = App.createRequestManager({ requestsPerSecond: 3, requestTimeout: 30000, interceptor: {
        interceptRequest: async (request: Request) => { request.headers = { ...(request.headers ?? {}), Cookie: COOKIE, Referer: `${DOMAIN}/nsfw` }; return request },
        interceptResponse: async (response: Response) => response
    } })

    private async request(url: string, method = 'GET', data?: string): Promise<Response> {
        const response = await this.requestManager.schedule(App.createRequest({ url, method, headers: data ? { 'Content-Type': 'application/json' } : undefined, data }), 2)
        if (response.status < 200 || response.status >= 400) throw new Error(`ScansFR NSFW: erreur HTTP ${response.status}`)
        return response
    }
    private async json<T>(url: string, method = 'GET', data?: string): Promise<T> { return JSON.parse(String((await this.request(url, method, data)).data)) as T }
    private async html(path: string) { return this.cheerio.load(String((await this.request(`${DOMAIN}${path}`)).data)) }
    private image(url: string) { return url.startsWith('http') ? url : `${API}${url}` }

    getMangaShareUrl(mangaId: string) { return `${DOMAIN}/nsfw/manga/${mangaId}` }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const manga = await this.json<MangaJson>(`${API}/api/v1/mangas/${encodeURIComponent(mangaId)}`)
        if (!manga.isNsfw) throw new Error('Ce titre ne fait pas partie du catalogue /nsfw de ScansFR.')
        const tags = App.createTagSection({ id: 'genres', label: 'Genres', tags: (manga.tags ?? []).map(label => App.createTag({ id: label.toLowerCase(), label })) })
        return App.createSourceManga({ id: mangaId, mangaInfo: App.createMangaInfo({
            image: this.image(manga.cover), titles: [manga.title, ...(manga.alternativeTitles ?? [])], desc: manga.description ?? '',
            status: manga.status ?? 'N/A', author: manga.author ?? 'N/A', artist: manga.artist ?? 'N/A', hentai: true,
            tags: [tags], additionalInfo: { viewer: 'webtoon', scope: '/nsfw uniquement' }
        }) })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const manga = await this.json<MangaJson>(`${API}/api/v1/mangas/${encodeURIComponent(mangaId)}`)
        if (!manga.isNsfw) throw new Error('Titre hors /nsfw refusé.')
        return (manga.chaptersList ?? []).filter(chapter => !chapter.isEarlyAccess).map(chapter => App.createChapter({
            id: String(chapter.number), name: chapter.title || `Chapitre ${chapter.number}`, chapNum: chapter.number,
            volume: 0, langCode: 'FR', time: chapter.date ? new Date(chapter.date) : new Date(0)
        }))
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const key = `${mangaId}-${chapterId}`
        const chapter = await this.json<ChapterJson>(`${API}/api/v1/chapters/${encodeURIComponent(key)}`)
        if (!chapter.mangaIsNsfw) throw new Error('Chapitre hors /nsfw refusé.')
        const sessionId = `paperback_${Date.now()}`
        const token = await this.json<TokenJson>(`${API}/api/v1/chapters/${encodeURIComponent(key)}/token`, 'POST', JSON.stringify({ sessionId }))
        const pages = Array.from({ length: token.pageCount || chapter.pageCount }, (_, index) =>
            `${API}/api/v1/images/${token.chapterId}/${index + 1}?sig=${encodeURIComponent(token.sig)}&exp=${token.exp}&s=${encodeURIComponent(token.sessionHash)}`)
        return App.createChapterDetails({ id: chapterId, mangaId, pages })
    }

    private parseCatalog($: CheerioAPI, scope?: any): PartialSourceManga[] {
        const results = new Map<string, PartialSourceManga>()
        const links = scope ? $(scope).find('a[href^="/nsfw/manga/"]') : $('a[href^="/nsfw/manga/"]')
        links.each((_, e) => {
            const href = $(e).attr('href') ?? ''
            const mangaId = getSlugFromUrl(href, 'manga')
            const img = $('img', e).first()
            const title = (img.attr('alt') || $('h2,h3,p', e).first().text()).replace(/^Couverture de\s+/i, '').trim()
            const image = getImageUrl($, img)
            if (!mangaId || !title || !image) return
            results.set(mangaId, App.createPartialSourceManga({ mangaId, title, image: this.image(image), subtitle: $(e).text().replace(/\s+/g, ' ').trim().slice(0, 100) }))
        })
        return [...results.values()]
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const params = new URLSearchParams({ page: String(page) })
        if (query.title?.trim()) params.set('search', query.title.trim())
        for (const tag of query.includedTags ?? []) {
            const split = tag.id.indexOf('=')
            if (split > 0) params.set(tag.id.slice(0, split), tag.id.slice(split + 1))
        }
        const $ = await this.html(`/nsfw/catalog?${params.toString()}`)
        const results = this.parseCatalog($)
        return App.createPagedResults({ results, metadata: results.length >= 20 ? { page: page + 1 } : undefined })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const genres = ['Hentai','Pornhwa','Mature','Smut','Ecchi','Harem','Yuri',"Boy's Love"]
        return [
            App.createTagSection({ id: 'genres', label: 'Genres NSFW', tags: genres.map(label => App.createTag({ id: `genre=${label}`, label })) }),
            App.createTagSection({ id: 'status', label: 'Statut', tags: ['En cours','Terminé'].map(label => App.createTag({ id: `status=${label}`, label })) }),
            App.createTagSection({ id: 'sort', label: 'Tri', tags: [
                App.createTag({ id: 'sort=updated', label: 'Dernière mise à jour' }), App.createTag({ id: 'sort=title', label: 'A–Z' }),
                App.createTag({ id: 'sort=views', label: 'Popularité' }), App.createTag({ id: 'sort=rating', label: 'Note' })
            ] })
        ]
    }

    async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
        const $ = await this.html('/nsfw')
        const hero = $('h2').first().closest('a[href^="/nsfw/manga/"]')
        const featured = App.createHomeSection({ id: 'featured', title: 'À la une', type: HomeSectionType.singleRowNormal, containsMoreItems: false })
        const heroId = getSlugFromUrl(hero.attr('href') ?? '', 'manga')
        const heroTitle = hero.text().trim()
        featured.items = heroId && heroTitle ? [App.createPartialSourceManga({ mangaId: heroId, title: heroTitle, image: `${API}/covers/${heroId}/cover.jpg`, subtitle: 'Sélection ScansFR NSFW' })] : []
        if (featured.items.length) callback(featured)

        const definitions = [
            { id: 'updated', title: 'Dernières sorties', match: /Dernieres Sorties/i },
            { id: 'latest', title: 'Nouveautés', match: /Nouveautes/i },
            { id: 'views', title: 'Top', match: /^Top$/i }
        ]
        for (const definition of definitions) {
            const container = $('section').filter((_, e) => definition.match.test($('h1,h2,h3', e).first().text().trim())).first()
            const items = container.length ? this.parseCatalog($, container) : []
            if (!items.length) continue
            const section = App.createHomeSection({ id: definition.id, title: definition.title, type: HomeSectionType.singleRowNormal, containsMoreItems: true })
            section.items = items
            callback(section)
        }
    }
    async getViewMoreItems(id: string, metadata: any): Promise<PagedResults> { return this.getSearchResults({ title: '', includedTags: [{ id: `sort=${id}`, label: id }], excludedTags: [], parameters: {} }, metadata) }
    async getCloudflareBypassRequestAsync(): Promise<Request> { return App.createRequest({ url: `${DOMAIN}/nsfw`, method: 'GET', headers: { Cookie: COOKIE } }) }
}
