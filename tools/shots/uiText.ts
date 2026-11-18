// Interface text as the app shows it in the crawl's language, read from the app's own locale files (the keys are
// the upstream Android string names, src/i18n). Scene prepare steps find controls by these names, so the same
// steps work in the English run and in the Hebrew one (--rtl).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './devServer.ts'

/** Interface language of a crawl: English, or Hebrew with --rtl (the browser locale the app follows). */
export type CrawlLang = 'en' | 'he'

const RTL = new Set<CrawlLang>(['he'])

/** A string, or a string array (Android `string-array`, e.g. `view_options_types`). */
type Strings = Record<string, string | string[]>

function read(...parts: string[]): Strings {
  return JSON.parse(readFileSync(path.join(ROOT, 'src', 'i18n', ...parts), 'utf8')) as Strings
}

let en: Strings | null = null
const bundles = new Map<CrawlLang, Strings>()

function english(): Strings {
  en ??= { ...read('locales', 'en.json'), ...read('extra', 'en.json') }
  return en
}

/** `key`, or entry `index` of the string array `key`. */
function pick(b: Strings, key: string, index?: number): string | undefined {
  const v = b[key]
  if (v == null) return undefined
  if (Array.isArray(v)) return index == null ? undefined : v[index]
  return index == null ? v : undefined
}

function bundle(lang: CrawlLang): Strings {
  let b = bundles.get(lang)
  if (!b) {
    b = lang === 'en' ? english() : read('locales', `${lang}.json`)
    bundles.set(lang, b)
  }
  return b
}

/**
 * The text of `key` in `lang` as `t(key)` returns it: the translation, else the English text, which the app wraps
 * in a left-to-right isolate in a right-to-left language (src/i18n/index.ts, ltrFallback). Throws for a key the
 * app does not have, so a renamed string fails loudly instead of matching nothing. `index` picks an entry of a
 * string array.
 */
export function uiText(lang: CrawlLang, key: string, index?: number): string {
  const base = pick(english(), key, index)
  if (base == null) throw new Error(`tools/shots: no string "${key}${index == null ? '' : `[${index}]`}" in src/i18n`)
  if (lang === 'en') return base
  const own = pick(bundle(lang), key, index)
  if (own) return own
  return RTL.has(lang) ? `\u2066${base}\u2069` : base
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A pattern for the text of `key` in `lang`: the whole name (`exact`, default), its start (`prefix`) or anywhere in
 * it (`contains`); `i` ignores case.
 */
export function uiPattern(lang: CrawlLang, key: string, o: { match?: 'exact' | 'prefix' | 'contains'; i?: boolean } = {}): RegExp {
  const text = escape(uiText(lang, key))
  const match = o.match ?? 'exact'
  const src = match === 'exact' ? `^${text}$` : match === 'prefix' ? `^${text}` : text
  return new RegExp(src, o.i ? 'i' : '')
}
