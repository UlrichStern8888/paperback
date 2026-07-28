import {
    SourceManga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    TagSection,
    Request,
    Response,
    SearchField,
    MangaProviding,
    ChapterProviding,
    SearchResultsProviding,
    HomePageSectionsProviding,
    HomeSectionType,
    CloudflareBypassRequestProviding
} from '@paperback/types'

import { CheerioAPI } from 'cheerio'

import {
    parseMangaDetails,
    parseChapters,
    parseChapterDetails,
    parseSearchResults,
    parseSearchTags,
    parseSearchFields
} from './parser'


export abstract class Madara implements MangaProviding, ChapterProviding, SearchResultsProviding, HomePageSectionsProviding, CloudflareBypassRequestProviding {

    abstract base_url: string
    abstract lang_code: string

    // Website Configuration
    source_path: string = "manga"
    search_cookies: string = "wpmanga-adault=1"
    post_type: string = "wp-manga"
    alt_ajax: boolean = false

    // Date Configuration
    date_format: string = "DD/MM/YYYY"
    date_lang: string = "fr"

    // Default Selectors Definition
    title_selector: string = "div.post-title h1"
    otherstitle_selector: string = "div.post-content_item:contains(Alternative) div.summary-content"
    image_selector: string = "div.summary_image img"
    author_selector: string = "[href*=manga-aut]"
    artist_selector: string = "[href*=manga-art]"
    description_selector: string = "div.description-summary div p"
    genres_selector: string = "div.genres-content > a"
    type_selector: string = "div.post-content_item:contains(Type) div.summary-content"
    status_selector: string = `div.post-content_item:contains(Statu) div.summary-content`
    rating_selector: string = ".post-total-rating .total_votes"
    search_selector: string = "div.c-tabs-item__content"
    chapters_selector: string = "li.wp-manga-chapter"
    chapters_date_selector: string = "span.chapter-release-date"
    chapter_pictures_selector: string = "div.page-break > img"
    badge_adult_selector: string = ".manga-title-badges.adult"
    badges_selector: string = "span.manga-title-badges"

    // String Personnalised
    search_fileds_name_list: { default: string; new: string }[] = [
        { default: "Author", new: "Auteur" },
        { default: "Artist", new: "Artiste" },
        { default: "Year", new: "Année" },
    ]
    genres_conditions_name_list: { default: string; new: string }[] = [
        { default: "OR (having one of selected genres)", new: "OU (ayant au moins un des genres sélectionné)" },
        { default: "AND (having all selected genres)", new: "ET (ayant tous les genres sélectionné)" }
    ]
    adult_content_name_list: { default: string; new: string }[] = [
        { default: "All", new: "Tout" },
        { default: "None adult content", new: "Aucun contenu pour adulte" },
        { default: "Only adult content", new: "Seulement du contenu pour adulte" }
    ]
    status_name_list: { default: string[]; new: string }[] = [
        { default: ["ongoing", "releasing", "en cours"], new: "En cours" },
        { default: ["completed", "terminé"], new: "Terminé" },
        { default: ["canceled", "dropped", "annulé"], new: "Annulé" },
        { default: ["hiatus", "on hold", "en attente", "en pause"], new: "En pause" },
        { default: ["upcoming", "à venir", "prochainement"], new: "Prochainement" }
    ]
    latest: string = "Dernières Sorties"
    trending: string = "Tendance"
    new_releases: string = "Nouveaux titres"
    most_viewed: string = "Les plus vus"

    // Functions
    viewer = ($: CheerioAPI, categories: { label: string }[]): string => {
        const seriesType = $(this.type_selector).text().trim().toLowerCase()
        const webtoonTags = ["manhwa", "manhua", "webtoon", "vertical", "korean", "chinese"]
        const rtlTags = ["manga", "japan"]

        const source = `${seriesType} ${categories.map(category => category.label).join(" ")}`.toLowerCase()

        return webtoonTags.find(tag => source.includes(tag))
            ?? rtlTags.find(tag => source.includes(tag))
            ?? "unknown"

    }
    status = ($: CheerioAPI): string => {
        let status_str = $(this.status_selector).text().trim().toLowerCase()
        
        const cleaned = status_str.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        const match = this.status_name_list.find(entry => entry.default.some(status => cleaned.includes(status)))

        return match ? match.new : "N/A"
    }
    nsfw = ($: CheerioAPI, categories: { label: string }[]): boolean => {
        if ($(this.badge_adult_selector).length > 0) {
            return true
        } else {
            for (const tag of ["adult", "mature", "ecchi", "hentai", "smut"]) {
                if (categories.some(category => category.label.toLowerCase().includes(tag))) {
                    return true
                }
            }
            return false
        }
    }


    constructor(private cheerio: CheerioAPI) { }


    /////////////////////////////////
    /////    REQUEST MANAGER    /////
    /////////////////////////////////


    requestManager = App.createRequestManager({
        requestsPerSecond: 5,
        requestTimeout: 30000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    ...{
                        'referer': this.base_url
                    }
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    });


    /////////////////////////////////
    /////    MANGA PROVIDING    /////
    /////////////////////////////////


    getMangaShareUrl(mangaId: string): string { return `${this.base_url}/${this.source_path}/${mangaId}` }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${this.base_url}/${this.source_path}/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 2);
        this.validateResponse(response.status, `fiche du manga ${mangaId}`)
        const $ = this.cheerio.load(response.data as string)

        return parseMangaDetails($, mangaId, this);
    }


    ///////////////////////////////////
    /////    CHAPTER PROVIDING    /////
    ///////////////////////////////////


    async getChapters(mangaId: string): Promise<Chapter[]> {
        let url = `${this.base_url}/wp-admin/admin-ajax.php`
        if (this.alt_ajax) {
            url = `${this.base_url}/${this.source_path}/${mangaId}/ajax/chapters`
        }

        const int_id = await this.getIntMangaId(mangaId)

        const request = App.createRequest({
            url,
            method: 'POST',
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: `action=manga_get_chapters&manga=${int_id}`
        })

        const response = await this.requestManager.schedule(request, 2);
        this.validateResponse(response.status, `chapitres du manga ${mangaId}`)
        const $ = this.cheerio.load(response.data as string)

        return parseChapters($, mangaId, this);
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: `${this.base_url}/${this.source_path}/${mangaId}/${chapterId}?style=list`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 2);
        this.validateResponse(response.status, `lecteur ${mangaId}/${chapterId}`)
        const $ = this.cheerio.load(response.data as string)

        return parseChapterDetails($, mangaId, chapterId, this);
    }


    //////////////////////////////////////////
    /////    SEARCH RESULTS PROVIDING    /////
    //////////////////////////////////////////


    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const search = encodeURIComponent(query.title?.trim() ?? '')

        let url = `${this.base_url}/?post_type=${this.post_type}&s=${search}&paged=${page}`

        for (const tag of query.includedTags ?? []) {
            const separator = tag.id.indexOf('=')
            if (separator === -1) continue

            const key = tag.id.slice(0, separator)
            const value = tag.id.slice(separator + 1)
            url += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        }

        for (const [key, value] of Object.entries(query.parameters ?? {})) {
            if (value === undefined || value === null || String(value).trim() === '') continue

            if (Array.isArray(value)) {
                for (const item of value) {
                    url += `&${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
                }
            } else {
                url += `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
            }
        }

        const request = App.createRequest({
            url,
            method: 'GET',
            headers: {"Cookie": this.search_cookies}
        })

        const response = await this.requestManager.schedule(request, 2)
        this.validateResponse(response.status, `recherche page ${page}`)

        const $ = this.cheerio.load(response.data as string)
        const manga = parseSearchResults($, this)
        const signature = manga.map(item => item.mangaId).join('|')
        const repeatedPage = Boolean(signature && signature === metadata?.signature)
        const hasNextPage = $('a.nextpostslink, a.next.page-numbers, .pagination a.next, link[rel="next"]').length > 0
        metadata = !repeatedPage && manga.length > 0 && hasNextPage ? { page: page + 1, signature } : undefined

        return App.createPagedResults({
            results: repeatedPage ? [] : manga,
            metadata
        })
    }

    private searchConfiguration?: CheerioAPI

    private async getSearchConfiguration(): Promise<CheerioAPI> {
        if (this.searchConfiguration) return this.searchConfiguration

        const request = App.createRequest({
            url: `${this.base_url}/?s=&post_type=${this.post_type}`,
            method: 'GET',
            headers: { "Cookie": this.search_cookies }
        })

        const response = await this.requestManager.schedule(request, 2)
        this.validateResponse(response.status, 'configuration de la recherche')
        this.searchConfiguration = this.cheerio.load(response.data as string)
        return this.searchConfiguration
    }

    async getSearchTags?(): Promise<TagSection[]> {
        const $ = await this.getSearchConfiguration()
        return parseSearchTags($, this)
    }

    async getSearchFields?(): Promise<SearchField[]> {
        const $ = await this.getSearchConfiguration()
        return parseSearchFields($, this)
    }


    /////////////////////////////////////////////
    /////    HOMEPAGE SECTIONS PROVIDING    /////
    /////////////////////////////////////////////


    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const definitions = [
            { id: 'latest', title: this.latest, order: 'latest' },
            { id: 'new-manga', title: this.new_releases, order: 'new-manga' },
            { id: 'trending', title: this.trending, order: 'trending' },
            { id: 'views', title: this.most_viewed, order: 'views' }
        ]

        const sections = await Promise.all(definitions.map(async definition => {
            const section = App.createHomeSection({
                id: definition.id,
                title: definition.title,
                type: HomeSectionType.singleRowNormal,
                containsMoreItems: true
            })
            const request = App.createRequest({
                url: `${this.base_url}/?s=&post_type=${this.post_type}&m_orderby=${definition.order}&paged=1`,
                method: 'GET',
                headers: { "Cookie": this.search_cookies }
            })
    
            const response = await this.requestManager.schedule(request, 2)
            this.validateResponse(response.status, `accueil ${definition.title}`)
            const $ = this.cheerio.load(response.data as string)

            section.items = parseSearchResults($, this)
            return section
        }))

        for (const section of sections) {
            sectionCallback(section)
        }
    } 

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const supportedSections = ['latest', 'new-manga', 'trending', 'views']

        if (!supportedSections.includes(homepageSectionId)) {
            throw new Error(`Invalid homeSectionId | ${homepageSectionId}`)
        }

        const request = App.createRequest({
            url: `${this.base_url}/?s=&post_type=${this.post_type}&m_orderby=${homepageSectionId}&paged=${page}`,
            method: 'GET',
            headers: { "Cookie": this.search_cookies }
        })

        const response = await this.requestManager.schedule(request, 2)
        this.validateResponse(response.status, `${homepageSectionId} page ${page}`)
        const $ = this.cheerio.load(response.data as string)

        const results = parseSearchResults($, this)
        const signature = results.map(item => item.mangaId).join('|')
        const repeatedPage = Boolean(signature && signature === metadata?.signature)
        const hasNextPage = $('a.nextpostslink, a.next.page-numbers, .pagination a.next, link[rel="next"]').length > 0

        return App.createPagedResults({
            results: repeatedPage ? [] : results,
            metadata: !repeatedPage && results.length > 0 && hasNextPage ? { page: page + 1, signature } : undefined
        })
    }


    /////////////////////////////////////////////////////
    /////    CLOUDFLARE BYPASS REQUEST PROVIDING    /////
    /////////////////////////////////////////////////////


    async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: this.base_url,
            method: 'GET'
        })
    }

    validateResponse(status: number, context: string) {
        if (status === 403) {
            throw new Error("Contourner Cloudflare avant d'utiliser la source !")
        }
        if (status === 429) {
            throw new Error(`HentaiOrigines limite temporairement les requêtes (${context}). Réessayer dans quelques instants.`)
        }
        if (status < 200 || status >= 400) {
            throw new Error(`Erreur HTTP ${status} pendant le chargement : ${context}`)
        }
    }

    async getIntMangaId(mangaId: string): Promise<string> {
        const request = App.createRequest({
            url: `${this.base_url}/${this.source_path}/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 2)
        this.validateResponse(response.status, `identifiant interne du manga ${mangaId}`)
        const $ = this.cheerio.load(response.data as string)

        const script = $('script#wp-manga-js-extra').html() ?? ''
        const match = script.match(/["']manga_id["']\s*:\s*["'](\d+)["']/)

        if (!match?.[1]) {
            throw new Error(`Impossible de trouver l'identifiant interne du manga : ${mangaId}`)
        }

        return match[1]
    }
}
