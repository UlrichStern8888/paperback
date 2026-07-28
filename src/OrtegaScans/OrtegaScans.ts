import {
    BadgeColor, Chapter, ChapterDetails, ChapterProviding, ContentRating, HomePageSectionsProviding,
    HomeSection, HomeSectionType, MangaProviding, PagedResults, PartialSourceManga, Request, Response,
    SearchRequest, SearchResultsProviding, SourceInfo, SourceIntents, SourceManga, TagSection
} from '@paperback/types'
import { CheerioAPI } from 'cheerio'
import { getImageUrl, getSlugFromUrl, parseDate } from '../templates/helper'

const DOMAIN = 'https://ortegascans.fr'

export const OrtegaScansInfo: SourceInfo = {
    version: '1.0', language: 'FR', name: 'OrtegaScans', icon: 'icon.png',
    description: 'Pornhwa et hentai en français depuis OrtegaScans.', author: 'UlrichStern',
    contentRating: ContentRating.ADULT, websiteBaseURL: DOMAIN,
    sourceTags: [{ text: 'FR', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}

export class OrtegaScans implements MangaProviding, ChapterProviding, SearchResultsProviding, HomePageSectionsProviding {
    constructor(private cheerio: CheerioAPI) {}
    requestManager = App.createRequestManager({ requestsPerSecond: 4, requestTimeout: 30000 })

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

    async getSearchResults(query: SearchRequest): Promise<PagedResults> {
        const $ = await this.load('/series')
        let results = this.parseSeries($, query.title ?? '')
        const included = (query.includedTags ?? []).map(tag => tag.id)
        const genre = included.find(id => id.startsWith('genre='))?.slice(6).toLowerCase()
        const status = included.find(id => id.startsWith('status='))?.slice(7).toLowerCase()
        if (genre || status) results = results.filter(item => {
            const card = $(`a[href="/serie/${item.mangaId}"]`).text().toLowerCase()
            return (!genre || card.includes(genre)) && (!status || card.includes(status))
        })
        return App.createPagedResults({ results })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const genres = ['Harem','Romance','Drame','Mature','MILF','Fantaisie','Comédie','Vie Scolaire','Système','Revanche']
        return [
            App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(label => App.createTag({ id: `genre=${label}`, label })) }),
            App.createTagSection({ id: 'status', label: 'Statut', tags: ['En cours','Terminé'].map(label => App.createTag({ id: `status=${label}`, label })) })
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
            const section = App.createHomeSection({ id: definition.id, title: definition.title, type: HomeSectionType.singleRowNormal, containsMoreItems: definition.id !== 'new' })
            section.items = definition.items
            callback(section)
        }
    }
    async getViewMoreItems(id: string): Promise<PagedResults> {
        if (id === 'latest' || id === 'new') {
            const $ = await this.load('/')
            const match = id === 'latest' ? /Dernières sorties/i : /Nouvelles séries/i
            const scope = $('section').filter((_, e) => match.test($('h1,h2', e).first().text())).first()
            return App.createPagedResults({ results: this.parseSeries($, '', scope) })
        }
        return this.getSearchResults({ title: '', includedTags: [], excludedTags: [], parameters: {} })
    }
}
