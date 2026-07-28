import {
    Chapter,
    ChapterDetails,
    Tag,
    SourceManga,
    PartialSourceManga,
    TagSection,
    SearchField,
} from '@paperback/types'

import { CheerioAPI } from 'cheerio'

import { Madara } from './base'
import { decodeHtmlEntity, parseDate, getImageUrl, getSlugFromUrl } from '../helper'


export const parseMangaDetails = async ($: CheerioAPI, mangaId: string, data: Madara): Promise<SourceManga> => {
    const mainTitle = decodeHtmlEntity($(data.title_selector).clone().children().remove().end().text().trim())
    const otherstitles = $(data.otherstitle_selector).text().trim().split(',')
        .map(title => decodeHtmlEntity(title.trim()))
        .filter(Boolean)
    const titles = Array.from(new Set([mainTitle, ...otherstitles].filter(Boolean)))
    const image = getImageUrl($, $(data.image_selector))
    const author = $(data.author_selector).text().trim() || "N/A"
    const artist = $(data.artist_selector).text().trim() || "N/A"
    const desc = decodeHtmlEntity($(data.description_selector).text().trim())
    const rating = Number($(data.rating_selector).text().trim())

    const categories: Tag[] = []
    const collectedCategories = new Set<string>()
    for (const tag of $(data.genres_selector).toArray()) {
        const id = getSlugFromUrl($(tag).attr('href') ?? '', 'manga-genre')
        const label = decodeHtmlEntity($(tag).text().trim())

        if (!id || !label || collectedCategories.has(id)) continue
        categories.push({ id: id, label: label })
        collectedCategories.add(id)
    }
    const tagSections: TagSection[] = [App.createTagSection({ id: 'genres', label: 'Genres', tags: categories.map(x => App.createTag(x)) })]

    const status = (data.status)($)
    const nsfw = (data.nsfw)($, categories)

    const additionalInfo: Record<string, string> = {
        "viewer": (data.viewer)($, categories),
        "badge": $(data.badges_selector).text().trim()
    }

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            image,
            artist,
            author,
            desc,
            status,
            hentai: nsfw,
            titles,
            rating,
            tags: tagSections,
            additionalInfo
        })
    })
}

export const parseChapters = ($: CheerioAPI, mangaId: string, data: Madara): Chapter[] => {
    const chapters: Chapter[] = []
    const collectedIds = new Set<string>()

    for (const chapter of $(data.chapters_selector).toArray()) {
        const title = $('a', chapter).text().trim()
        if (!title) continue

        const href = $("a", chapter).attr('href')?.trim() ?? ''
        const chapterId = getSlugFromUrl(href)
        if (!chapterId || collectedIds.has(chapterId)) continue
        
        const volumeMatch = chapterId.match(/(?:volume|vol|v)[-_ ]*(\d+(?:[.-]\d+)?)/i)
        const chapterMatch = chapterId.match(/(?:chapitre|chapter|chap|ch|c)[-_ ]*(\d+(?:[.-]\d+)?)/i)
            ?? title.match(/(?:chapitre|chapter|chap|ch|c)[\s#:_-]*(\d+(?:[.-]\d+)?)/i)
        const volNum = Number(volumeMatch?.[1]?.replace('-', '.') ?? 0)
        const chapNum = Number(chapterMatch?.[1]?.replace('-', '.') ?? 0)
        
        const dateText = $(`${data.chapters_date_selector} a`, chapter).attr('title')
            ?? $(data.chapters_date_selector, chapter).text().trim()
        const date = parseDate(dateText, data.date_format, data.date_lang)

        chapters.push(App.createChapter({
            id: chapterId,
            name: title,
            langCode: data.lang_code,
            volume: isNaN(volNum) ? 0 : volNum,
            chapNum: isNaN(chapNum) ? 0 : chapNum,
            time: date
        }))
        collectedIds.add(chapterId)
    }

    if (chapters.length == 0) {
        throw new Error(`Couldn't find any chapters for mangaId: ${mangaId}!`)
    }

    return chapters
}

export const parseChapterDetails = async ($: CheerioAPI, mangaId: string, chapterId: string, data: Madara): Promise<ChapterDetails> => {
    const pages: string[] = []
    const collectedPages = new Set<string>()

    for (const page of $(data.chapter_pictures_selector).toArray()) {
        const image = getImageUrl($, page)
        if (!image || collectedPages.has(image)) continue

        pages.push(image)
        collectedPages.add(image)
    }

    if (pages.length === 0) {
        throw new Error(`Aucune page trouvée pour ${mangaId}/${chapterId}`)
    }
    
    const chapterDetails = App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
    })

    return chapterDetails
}

export const parseSearchResults = ($: CheerioAPI, data: Madara): PartialSourceManga[] => {
    const mangaItems: PartialSourceManga[] = []
    const collectedIds: string[] = []

    for (const manga of $(data.search_selector).toArray()) {
        const mangaId = getSlugFromUrl($('h3 a', manga).attr('href') ?? '', data.source_path)
        const image: string = getImageUrl($, $('img', manga))
        const title: string = decodeHtmlEntity($('h3 a', manga).text()) ?? ''
        const subtitle: string = decodeHtmlEntity($('.latest-chap .chapter a', manga).text())

        if (!mangaId || !title || !image || collectedIds.includes(mangaId)) continue

        mangaItems.push(App.createPartialSourceManga({
            image,
            title,
            mangaId,
            subtitle
        }))
        
        collectedIds.push(mangaId)
    }

    return mangaItems
}

export const parseSearchTags = ($: CheerioAPI, data: Madara): TagSection[] => {
    const arrayGenres: Tag[] = []
    const arrayGenresConditions: Tag[] = []
    const arrayAdultContent: Tag[] = []
    const arrayStatutManga: Tag[] = []
    const arraySort: Tag[] = [
        { id: 'm_orderby=', label: 'Pertinence' },
        { id: 'm_orderby=latest', label: 'Récent' },
        { id: 'm_orderby=alphabet', label: 'A-Z' },
        { id: 'm_orderby=trending', label: 'Tendance' },
        { id: 'm_orderby=views', label: 'Les + vues' },
        { id: 'm_orderby=new-manga', label: 'Nouveau' }
    ]

    // Genres
    for (let item of $('#search-advanced .checkbox-group div:has([name*=genre])').toArray()) {
        let id = `${$('input', item).attr('name')}=${$('input', item).attr('value')}`
        let label = decodeHtmlEntity($('label', item).text().trim())

        arrayGenres.push({ id, label })
    }
    // Genres Conditions
    for (let item of $('#search-advanced .form-group:has([name*=op]) option').toArray()) {
        let id = `${$(item).parent().attr('name')}=${$(item).attr('value')}`
        
        const raw = decodeHtmlEntity($(item).text().trim())
        let label = data.genres_conditions_name_list.find(item => item.default === raw)?.new ?? raw

        arrayGenresConditions.push({ id, label })
    }
    // Adult Content
    for (let item of $('#search-advanced .form-group:has([name*=adult]) option').toArray()) {
        let id = `${$(item).parent().attr('name')}=${$(item).attr('value')}`

        const raw = decodeHtmlEntity($(item).text().trim())
        let label = data.adult_content_name_list.find(item => item.default === raw)?.new ?? raw

        arrayAdultContent.push({ id, label })
    }
    // Statut
    for (let item of $('#search-advanced .checkbox-inline:has([name*=statu])').toArray()) {
        const id = `${$('input', item).attr('name')}=${$('input', item).attr('value')}`

        const raw = $('label', item).text().trim()
        const cleaned = raw.toLowerCase().replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '')
        const label = data.status_name_list.find(entry => entry.default.includes(cleaned))?.new ?? raw
        
        arrayStatutManga.push({ id, label })
    }

    return [
        App.createTagSection({ id: '0', label: "Genres", tags: arrayGenres.map(x => App.createTag(x)) }),
        App.createTagSection({ id: '1', label: "Condition sur les genres", tags: arrayGenresConditions.map(x => App.createTag(x)) }),
        App.createTagSection({ id: '2', label: "Contenu pour adulte", tags: arrayAdultContent.map(x => App.createTag(x)) }),
        App.createTagSection({ id: '3', label: "Statut", tags: arrayStatutManga.map(x => App.createTag(x)) }),
        App.createTagSection({ id: '4', label: "Tri", tags: arraySort.map(x => App.createTag(x)) })
    ]
}

export const parseSearchFields = ($: CheerioAPI, data: Madara): SearchField[] => {
    const searchFields: SearchField[] = []

    for (let item of $('#search-advanced .form-group input[type=text]').toArray()) {
        const id = $(item).attr('name')
        
        const raw = $(item).attr('placeholder')?.trim()
        const name = data.search_fileds_name_list.find(item => item.default === raw)?.new ?? raw

        if (id && name) {
            searchFields.push(
                App.createSearchField({
                    id,
                    name,
                    placeholder : name
                })
            )

        }
    }

    return searchFields
}
