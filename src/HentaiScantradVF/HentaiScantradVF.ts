import { BadgeColor, ContentRating, SourceInfo, SourceIntents } from '@paperback/types'
import { Madara } from '../templates/madara/base'

const DOMAIN = 'https://hentai.scantrad-vf.cc'

export const HentaiScantradVFInfo: SourceInfo = {
    version: '1.0',
    language: 'FR',
    name: 'Hentai Scantrad VF',
    icon: 'icon.png',
    description: 'Source française pour hentai.scantrad-vf.cc',
    author: 'UlrichStern',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: DOMAIN,
    sourceTags: [{ text: 'FR', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class HentaiScantradVF extends Madara {
    base_url = DOMAIN
    lang_code = 'FR'
    override source_path = 'manga'
    override alt_ajax = true
    override chapter_pictures_selector = '.reading-content img.wp-manga-chapter-img, .reading-content .page-break img, .reading-content img[data-src], .reading-content img[data-lazy-src]'
    override nsfw = (): boolean => true
}
