import {
    ContentRating,
    SourceInfo,
    BadgeColor,
    SourceIntents
} from '@paperback/types'

import {
    Madara
} from '../templates/madara/base'

const DOMAIN: string = 'https://hentai-origines.com'


export const HentaiOriginesInfo: SourceInfo = {
    version: "3.3",
    language: "FR",
    name: 'HentaiOrigines',
    icon: 'icon.png',
    description: `Extension that pulls mangas from ${DOMAIN}`,
    author: 'Moomooo95',
    authorWebsite: 'https://github.com/Moomooo95',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: DOMAIN,
    sourceTags: [
        {
            text: 'FR',
            type: BadgeColor.GREY
        },
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class HentaiOrigines extends Madara {
    base_url = DOMAIN
    lang_code = HentaiOriginesInfo.language!
    override source_path: string = "manga"
    override alt_ajax: boolean = true
    override title_selector: string = ".post-title h1"
    override otherstitle_selector: string = "div.post-content_item:contains(Alternatif) div.summary-content"
    override image_selector: string = ".summary_image img"
    override author_selector: string = '.post-content_item a[href*="/manga-author/"]'
    override artist_selector: string = '.post-content_item a[href*="/manga-artist/"]'
    override description_selector: string = ".description-summary .summary__content"
    override genres_selector: string = '.post-content_item a[href*="/manga-genre/"]'
    override status_selector: string = "div.post-content_item:contains(État) div.summary-content"
    override chapter_pictures_selector: string = ".reading-content img.wp-manga-chapter-img, .reading-content .page-break img, .reading-content img[data-src], .reading-content img[data-lazy-src]"
    override search_fileds_name_list: { default: string; new: string }[] = [
        { default: "Author", new: "Auteur" },
        { default: "Artist", new: "Artiste" },
        { default: "An", new: "Année" },
    ]
    override genres_conditions_name_list: { default: string; new: string }[] = [
        { default: "Au moins un des tag sélectionné", new: "OU (ayant au moins un des genres sélectionné)" },
        { default: "Tous les tags sélectionnés", new: "ET (ayant tous les genres sélectionné)" }
    ]
    override adult_content_name_list: { default: string; new: string }[] = [
        { default: "Oui", new: "Tout" },
        { default: "Pas de contenus pour adulte", new: "Aucun contenu pour adulte" },
        { default: "Seulement du contenus pour adulte", new: "Seulement du contenu pour adulte" }
    ]
    override nsfw = (): boolean => true
}
