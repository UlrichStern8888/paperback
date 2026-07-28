import * as cheerio from 'cheerio';

import moment from 'moment/min/moment-with-locales';

export function decodeHtmlEntity(str: string) {
  return str.replace(/&#(\d+);/g, function (match, dec) {
    return String.fromCharCode(dec);
  })
}

export function isEncoded(uri: string) {
  uri = uri || '';
  try {
    return uri !== decodeURIComponent(uri);
  } catch {
    return true;
  }
}

export function getSlugFromUrl(url: string, segment?: string): string {
  const pathname = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? ''
  const parts = pathname.split('/').filter(Boolean)

  if (segment) {
    const segmentIndex = parts.indexOf(segment)
    return segmentIndex >= 0 ? parts[segmentIndex + 1] ?? '' : ''
  }

  return parts[parts.length - 1] ?? ''
}

export function parseDate(date_str: string, date_format: string, date_lang: string) : Date {
  moment.locale(date_lang)
  
  date_str = decodeHtmlEntity(date_str).trim().toLowerCase()

  let date = moment(date_str, [date_format, "D MMMM YYYY", "D MMM YYYY"], true)
  
  if (!date.isValid()) {
    if (date_str === "hier") return moment().subtract(1, "day").toDate()

    let tab = date_str.match(/(\d+)\s+([\p{L}]+)/u)
    if (tab && tab[1] && tab[2]) {
      const amount = parseInt(tab[1], 10)
      const rawUnit = tab[2].toLowerCase()
      let unit: moment.unitOfTime.DurationConstructor = "day"

      if (rawUnit.startsWith("min")) unit = "minute"
      else if (rawUnit.startsWith("h")) unit = "hour"
      else if (rawUnit.startsWith("j")) unit = "day"
      else if (rawUnit.startsWith("sem") || rawUnit.startsWith("s")) unit = "week"
      else if (rawUnit.startsWith("mois")) unit = "month"
      else if (rawUnit.startsWith("an")) unit = "year"

      date = moment().subtract(amount, unit)
    } else {
      date = moment().startOf("day")
    }
  }    

  return date.toDate()
}

export function getImageUrl($: cheerio.CheerioAPI, item: cheerio.BasicAcceptedElems<any>) {
  if (!item || $(item).length === 0) return ""

  const element = $(item).get(0)
  if (!element || !("attribs" in element)) return ""

  const attrs = element.attribs
  const directCandidates = [
    attrs['data-src'],
    attrs['data-lazy-src'],
    attrs['data-original'],
    attrs['data-cfsrc'],
    attrs.src
  ].filter((value): value is string => Boolean(value) && !value.includes('data:image'))

  const srcset = attrs['data-srcset'] ?? attrs.srcset ?? ''
  const srcsetCandidates: { url: string; width: number }[] = String(srcset).split(',').map((candidate: string) => {
    const [url = '', descriptor = '0'] = candidate.trim().split(/\s+/)
    const width = Number(descriptor.replace(/[^\d.]/g, '')) || 0
    return { url, width }
  }).filter((candidate: { url: string; width: number }) => Boolean(candidate.url) && !candidate.url.includes('data:image'))
    .sort((a: { url: string; width: number }, b: { url: string; width: number }) => b.width - a.width)

  const image = srcsetCandidates[0]?.url ?? directCandidates[0] ?? ''
  const uri = image.replace(/(\r\n|\n|\r)/gm, '').replace(/^http:/, 'https:').trim()

  return isEncoded(uri) ? uri : encodeURI(uri)
}
