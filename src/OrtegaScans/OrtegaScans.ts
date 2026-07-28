import {
    BadgeColor, Chapter, ChapterDetails, ChapterProviding, CloudflareBypassRequestProviding, ContentRating, HomePageSectionsProviding,
    HomeSection, HomeSectionType, MangaProviding, PagedResults, PartialSourceManga, Request, Response,
    SearchRequest, SearchResultsProviding, SourceInfo, SourceIntents, SourceManga, TagSection
} from '@paperback/types'
import { CheerioAPI } from 'cheerio'
import { getImageUrl, getSlugFromUrl, parseDate } from '../templates/helper'

const DOMAIN = 'https://ortegascans.fr'

interface OrtegaSeriesJson {
    slug: string; title: string; status: string; rating?: number; viewCount?: number; createdAt?: string; updatedAt?: string;
    isOrtegaSerie?: boolean; categories?: Array<{ name: string }>; _count?: { chapters?: number }
}
interface OrtegaSeriesResponse { success: boolean; data: OrtegaSeriesJson[]; total: number; hasMore: boolean }

export const OrtegaScansInfo: SourceInfo = {
    version: '1.2', language: 'FR', name: 'OrtegaScans', icon: 'icon.png',
    description: 'Pornhwa et hentai en français depuis OrtegaScans.', author: 'UlrichStern',
    contentRating: ContentRating.ADULT, websiteBaseURL: DOMAIN,
    sourceTags: [{ text: 'FR', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class OrtegaScans implements MangaProviding, ChapterProviding, SearchResultsProviding, HomePageSectionsProviding, CloudflareBypassRequestProviding {
    constructor(private cheerio: CheerioAPI) {}
    requestManager = App.createRequestManager({ requestsPerSecond: 4, requestTimeout: 30000 })

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({ url: DOMAIN, method: 'GET' })
    }

    private async load(path: string) {
        const response: Response = await this.requestManager.schedule(App.createRequest({ url: `${DOMAIN}${path}`, method: 'GET' }), 2)
        if (response.status < 200 || response.status >= 400) throw new Error(`OrtegaScans: erreur HTTP ${response.status}`)
        return this.cheerio.load(String(response.data))
    }

    private async raw(path: string): Promise<string> {
        const response: Response = await this.requestManager.schedule(App.createRequest({ url: `${DOMAIN}${path}`, method: 'GET' }), 2)
        if (response.status < 200 || response.status >= 400) throw new Error(`OrtegaScans: erreur HTTP ${response.status}`)
        return String(response.data)
    }

    private async getSeriesPage(parameters: Record<string, string | number | boolean | undefined>): Promise<OrtegaSeriesResponse> {
        const query = Object.entries(parameters)
            .filter(([, value]) => value !== undefined && String(value).trim() !== '')
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
            .join('&')
        const response: Response = await this.requestManager.schedule(App.createRequest({ url: `${DOMAIN}/api/series?${query}`, method: 'GET' }), 2)
        if (response.status < 200 || response.status >= 400) throw new Error(`OrtegaScans API: erreur HTTP ${response.status}`)
        const payload = JSON.parse(String(response.data)) as OrtegaSeriesResponse
        if (!payload.success || !Array.isArray(payload.data)) throw new Error('OrtegaScans API: réponse invalide')
        return payload
    }

    private seriesToManga(series: OrtegaSeriesJson): PartialSourceManga {
        const details = [
            series.status,
            ...(series.categories ?? []).map(category => category.name),
            `${series._count?.chapters ?? 0} chapitres`
        ].filter(Boolean).join(' • ')
        return App.createPartialSourceManga({
            mangaId: series.slug,
            title: series.title,
            image: `${DOMAIN}/api/covers/${encodeURIComponent(series.slug)}.webp`,
            subtitle: details
        })
    }

    getMangaShareUrl(mangaId: string) { return `${DOMAIN}/serie/${mangaId}` }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const $ = await this.load(`/serie/${mangaId}`)
        const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content')?.split(' - ')[0] || mangaId
        const main = $('main').text().replace(/\s+/g, ' ').trim()
        const value = (label: string) => {
            const match = main.match(new RegExp(`${label}\\s*:?\\s*([^|]+?)(?=Auteur|Artiste|Année de sortie|Tags|Type|Status|Statut|Chapitres|$)`, 'i'))
            return match?.[1]?.trim() ?? ''
        }
        const image = getImageUrl($, $(`img[alt="${title.replace(/"/g, '\\"')}"]`).first()) || `${DOMAIN}/api/covers/${mangaId}.webp`
        const genres = $('a[href*="genre"], a[href*="tag"]').map((_, e) => $(e).text().trim()).get().filter(Boolean)
        const tags = App.createTagSection({ id: 'genres', label: 'Genres', tags: Array.from(new Set(genres)).map(label => App.createTag({ id: label.toLowerCase(), label })) })
        return App.createSourceManga({ id: mangaId, mangaInfo: App.createMangaInfo({
            image, titles: [title, value('Noms alternatifs')].filter(Boolean), desc: $('meta[name="description"]').attr('content') ?? '',
            author: value('Auteur') || 'N/A', artist: value('Artiste') || 'N/A', status: value('Status') || value('Statut') || 'N/A',
            hentai: true, tags: [tags], additionalInfo: { viewer: 'webtoon' }
        }) })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const html = await this.raw(`/serie/${mangaId}`)
        const $ = this.cheerio.load(html)
        const found = new Map<number, { name: string, date: Date }>()
        $('a[href*="/chapter/"]').each((_, e) => {
            const href = $(e).attr('href') ?? ''
            const raw = href.match(/\/chapter\/(\d+(?:\.\d+)?)/)?.[1]
            const number = Number(raw)
            if (!raw || !Number.isFinite(number) || /PREMIUM/i.test($(e).text())) return
            found.set(number, { name: `Chapitre ${raw}`, date: parseDate($(e).text(), 'DD/MM/YYYY', 'fr') })
        })
        const list = html.match(/\\?"chapters\\?":\[(.*?)\],\\?"_count/)
        if (list?.[1]) for (const object of list[1].matchAll(/\{(.*?)\}/g)) {
            const number = Number(object[1]?.match(/\\?"number\\?":(\d+(?:\.\d+)?)/)?.[1])
            const premium = /\\?"isPremium\\?":true/.test(object[1] ?? '')
            if (Number.isFinite(number) && !premium && !found.has(number)) found.set(number, { name: `Chapitre ${number}`, date: new Date(0) })
        }
        return [...found.entries()].sort((a, b) => b[0] - a[0]).map(([number, data]) => App.createChapter({
            id: String(number), name: data.name, langCode: 'FR', chapNum: number, volume: 0, time: data.date
        }))
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const html = await this.raw(`/serie/${mangaId}/chapter/${chapterId}`)
        const escaped = [...html.matchAll(/\\?"url\\?":\\?"(\/api\/chapters\/[^"\\]+\/image\/[^"\\]+)\\?"/g)].map(match => match[1] ?? '')
        const pages = Array.from(new Set(escaped.filter(Boolean))).map(url => `${DOMAIN}${url}`)
        if (!pages.length) throw new Error(`OrtegaScans: aucune page pour ${mangaId}/${chapterId}`)
        return App.createChapterDetails({ id: chapterId, mangaId, pages })
    }

    private parseSeries($: CheerioAPI, query = '', scope?: any): PartialSourceManga[] {
        const normalized = query.toLowerCase().trim()
        const map = new Map<string, PartialSourceManga>()
        const links = scope ? $(scope).find('a[href^="/serie/"]') : $('a[href^="/serie/"]')
        links.each((_, e) => {
            const href = $(e).attr('href') ?? ''
            if (href.includes('/chapter/')) return
            const mangaId = getSlugFromUrl(href, 'serie')
            const img = $('img', e).first()
            const title = ($('h3', e).first().text() || img.attr('alt') || $(e).text()).trim()
            const image = getImageUrl($, img) || `${DOMAIN}/api/covers/${mangaId}.webp`
            const text = $(e).text().replace(/\s+/g, ' ').trim()
            if (!mangaId || !title || (normalized && !text.toLowerCase().includes(normalized))) return
            map.set(mangaId, App.createPartialSourceManga({ mangaId, title, image: image.startsWith('http') ? image : `${DOMAIN}${image}`, subtitle: text.match(/\d+\s*chapitres?/i)?.[0] ?? '' }))
        })
        return [...map.values()]
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const included = (query.includedTags ?? []).map(tag => tag.id)
        const genres = included.filter(id => id.startsWith('genre=')).map(id => id.slice(6))
        const status = included.find(id => id.startsWith('status='))?.slice(7)
        const sort = included.find(id => id.startsWith('sort='))?.slice(5) ?? 'popular'
        const minChapters = included.find(id => id.startsWith('minChapters='))?.slice(12) ?? '0'
        const isOrtegaOnly = included.includes('catalog=ortega')
        const payload = await this.getSeriesPage({
            limit: 18,
            page,
            search: query.title?.trim(),
            tags: genres.join(','),
            status,
            sort,
            minChapters,
            isOrtegaOnly,
            unreadOnly: false
        })
        const results = payload.data.map(series => this.seriesToManga(series))
        const signature = results.map(item => item.mangaId).join('|')
        const repeatedPage = Boolean(signature && signature === metadata?.signature)
        return App.createPagedResults({
            results: repeatedPage ? [] : results,
            metadata: !repeatedPage && results.length > 0 && payload.hasMore ? { page: page + 1, signature } : undefined
        })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const catalog = await this.getSeriesPage({ limit: 1000, page: 1, sort: 'popular', minChapters: 0, isOrtegaOnly: false, unreadOnly: false })
        const genres = Array.from(new Set(catalog.data.flatMap(series => (series.categories ?? []).map(category => category.name))))
            .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
        const statuses: Array<[string, string]> = [['en cours', 'En cours'], ['terminé', 'Terminé'], ['en pause', 'En pause'], ['annulé', 'Annulé']]
        return [
            App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(label => App.createTag({ id: `genre=${label}`, label })) }),
            App.createTagSection({ id: 'status', label: 'Statut', tags: statuses.map(([value, label]) => App.createTag({ id: `status=${value}`, label })) }),
            App.createTagSection({ id: 'sort', label: 'Tri', tags: [
                App.createTag({ id: 'sort=popular', label: 'Popularité' }),
                App.createTag({ id: 'sort=alpha', label: 'Ordre alphabétique' }),
                App.createTag({ id: 'sort=recent', label: 'Plus récent' })
            ] }),
            App.createTagSection({ id: 'chapters', label: 'Nombre de chapitres', tags: [1, 25, 50, 100, 150, 200].map(value => App.createTag({ id: `minChapters=${value}`, label: `${value}+ chapitres` })) }),
            App.createTagSection({ id: 'catalog', label: 'Catalogue', tags: [App.createTag({ id: 'catalog=ortega', label: 'Séries Ortega uniquement' })] })
        ]
    }

    async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
        const home = await this.load('/')
        const catalog = await this.load('/series')
        const definitions = [
            { id: 'latest', title: 'Dernières sorties', items: this.parseSeries(home, '', home('section').filter((_, e) => /Dernières sorties/i.test(home('h1,h2', e).first().text())).first()) },
            { id: 'new', title: 'Nouvelles séries', items: this.parseSeries(home, '', home('section').filter((_, e) => /Nouvelles séries/i.test(home('h1,h2', e).first().text())).first()) },
            { id: 'popular', title: 'Séries populaires', items: this.parseSeries(catalog).slice(0, 24) }
        ]
        for (const definition of definitions) {
            if (!definition.items.length) continue
            const section = App.createHomeSection({ id: definition.id, title: definition.title, type: HomeSectionType.singleRowNormal, containsMoreItems: true })
            section.items = definition.items
            callback(section)
        }
    }
    async getViewMoreItems(id: string, metadata: any): Promise<PagedResults> {
        const sort = id === 'popular' ? 'popular' : 'recent'
        return this.getSearchResults({ title: '', includedTags: [{ id: `sort=${sort}`, label: sort }], excludedTags: [], parameters: {} }, metadata)
    }
}
