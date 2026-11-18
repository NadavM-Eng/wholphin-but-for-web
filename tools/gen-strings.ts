// Converts upstream Android string resources (reference/wholphin/app/src/main/res/values*/strings.xml)
// into i18next JSON (src/i18n/locales/<bcp47>.json) plus src/i18n/locales/index.ts.
// Run with `npm run gen:strings`. Output is committed so the app builds without the upstream checkout.
//
// Conversion rules (see also src/i18n/README in the report):
// - Keys are the Android resource names.
// - `%1$s`, `%2$d`, `%1$02d`, `%.2f`, `%s`, `%d` become `{{p1}}`, `{{p2}}`... Non-positional args are numbered
//   in order of appearance. Width/precision flags are dropped: callers pre-format padded or fixed-point
//   values (e.g. season_episode_number_padded, decimal_seconds) and pass the string.
// - Inside <plurals>, argument 1 becomes `{{count}}` (Android passes the quantity as the first format arg in
//   every upstream call); other args stay `{{pN}}`. Quantities become i18next suffix keys (`name_one`...).
//   Only CLDR categories that exist for the locale are emitted (Android ignores `zero` for English, while
//   i18next would always use `_zero` for count 0); missing categories fall back to `other`, as on Android.
// - <string-array>/<array> become JSON arrays with `@string/x` references resolved (locale first, then base).
// - Android escapes (`\n`, `\t`, `\'`, `\"`, `\@`, `\?`, `\\`, `\uXXXX`), double-quote whitespace preservation,
//   whitespace collapsing, CDATA and XML entities are decoded. Upstream strings contain no inline HTML tags,
//   so any tag that appears is stripped to its text (Android's getString() drops styling as well).
// - `translatable="false"` strings are kept in the base locale only. fa_strings.xml (icon glyphs) is skipped.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export type LocaleStrings = Record<string, string | string[]>

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const
type PluralCategory = (typeof PLURAL_CATEGORIES)[number]

/** Android resource qualifier (folder suffix) -> BCP-47 tag. */
export function androidQualifierToBcp47(qualifier: string): string {
  if (qualifier === '') return 'en'
  // values-b+sr+Latn style
  if (qualifier.startsWith('b+')) return qualifier.slice(2).split('+').join('-')
  const [lang, region] = qualifier.split('-r')
  const legacy: Record<string, string> = { iw: 'he', in: 'id', ji: 'yi' }
  const l = legacy[lang] ?? lang
  return region ? `${l}-${region}` : l
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Decodes XML entities and CDATA sections and strips inline tags; returns raw Android text. */
export function decodeXmlText(raw: string): string {
  let out = ''
  let i = 0
  while (i < raw.length) {
    if (raw.startsWith('<![CDATA[', i)) {
      const end = raw.indexOf(']]>', i)
      const inner = raw.slice(i + 9, end < 0 ? raw.length : end)
      // CDATA content is literal XML text, but Android's escape/quote processing still applies,
      // so protect nothing here: escapes are resolved later by unescapeAndroid().
      out += inner
      i = end < 0 ? raw.length : end + 3
    } else if (raw[i] === '<') {
      const end = raw.indexOf('>', i)
      i = end < 0 ? raw.length : end + 1
    } else if (raw[i] === '&') {
      const end = raw.indexOf(';', i)
      const name = raw.slice(i + 1, end)
      if (name.startsWith('#x')) out += String.fromCodePoint(parseInt(name.slice(2), 16))
      else if (name.startsWith('#')) out += String.fromCodePoint(parseInt(name.slice(1), 10))
      else out += ENTITIES[name] ?? `&${name};`
      i = end + 1
    } else {
      out += raw[i]
      i++
    }
  }
  return out
}

/** Applies aapt string processing: quotes, whitespace collapsing, backslash escapes. */
export function unescapeAndroid(text: string): string {
  const chars: { c: string; literal: boolean }[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\' && i + 1 < text.length) {
      const n = text[++i]
      if (n === 'n') chars.push({ c: '\n', literal: true })
      else if (n === 't') chars.push({ c: '\t', literal: true })
      else if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) {
        chars.push({ c: String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16)), literal: true })
        i += 4
      } else chars.push({ c: n, literal: true })
    } else if (c === '"') {
      quoted = !quoted
    } else if (/\s/.test(c) && !quoted) {
      const prev = chars[chars.length - 1]
      if (!(prev && !prev.literal && prev.c === ' ')) chars.push({ c: ' ', literal: false })
    } else {
      chars.push({ c, literal: quoted })
    }
  }
  while (chars.length && !chars[0].literal && chars[0].c === ' ') chars.shift()
  while (chars.length && !chars[chars.length - 1].literal && chars[chars.length - 1].c === ' ') chars.pop()
  return chars.map((x) => x.c).join('')
}

/**
 * Converts Java format specifiers to i18next interpolation.
 * @param firstArgName name for argument 1 (`count` inside plurals)
 */
export function convertFormatArgs(text: string, firstArgName = 'p1'): string {
  let seq = 0
  return text.replace(/%(?:(\d+)\$)?[-#+ 0,(]*\d*(?:\.\d+)?([sdfSxXc%])/g, (_m, pos: string | undefined, conv: string) => {
    if (conv === '%') return '%'
    const n = pos ? Number(pos) : ++seq
    return n === 1 ? `{{${firstArgName}}}` : `{{p${n}}}`
  })
}

export function convertString(raw: string, firstArgName = 'p1'): string {
  return convertFormatArgs(unescapeAndroid(decodeXmlText(raw)), firstArgName)
}

export interface ParsedResources {
  strings: Map<string, { value: string; translatable: boolean }>
  plurals: Map<string, Partial<Record<PluralCategory, string>>>
  arrays: Map<string, string[]>
}

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1]
}

/** Parses a strings.xml document (strings, plurals, string-arrays; raw values, unconverted). */
export function parseResources(xml: string): ParsedResources {
  const res: ParsedResources = { strings: new Map(), plurals: new Map(), arrays: new Map() }
  const body = xml.replace(/<!--[\s\S]*?-->/g, '')
  for (const m of body.matchAll(/<string(?=[\s/>])([^>]*?)(?:\/>|>([\s\S]*?)<\/string>)/g)) {
    const name = attr(m[1], 'name')
    if (!name) continue
    res.strings.set(name, { value: m[2] ?? '', translatable: attr(m[1], 'translatable') !== 'false' })
  }
  for (const m of body.matchAll(/<plurals\b([^>]*)>([\s\S]*?)<\/plurals>/g)) {
    const name = attr(m[1], 'name')
    if (!name) continue
    const items: Partial<Record<PluralCategory, string>> = {}
    for (const it of m[2].matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)) {
      const q = attr(it[1], 'quantity') as PluralCategory | undefined
      if (q && (PLURAL_CATEGORIES as readonly string[]).includes(q)) items[q] = it[2]
    }
    res.plurals.set(name, items)
  }
  for (const m of body.matchAll(/<(string-array|array)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const name = attr(m[2], 'name')
    if (!name) continue
    res.arrays.set(name, [...m[3].matchAll(/<item\b[^>]*?(?:\/>|>([\s\S]*?)<\/item>)/g)].map((it) => it[1] ?? ''))
  }
  return res
}

/** Converts parsed resources of one locale to an i18next resource object. */
export function toI18next(
  locale: string,
  parsed: ParsedResources,
  base: ParsedResources | null,
): LocaleStrings {
  const out: LocaleStrings = {}
  const isBase = base === null
  for (const [name, { value, translatable }] of parsed.strings) {
    if (!isBase && !translatable) continue
    if (name.startsWith('fa_')) continue
    out[name] = convertString(value)
  }
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories as PluralCategory[]
  for (const [name, items] of parsed.plurals) {
    const other = items.other ?? items.many ?? items.one ?? Object.values(items)[0]
    if (other === undefined) continue
    for (const cat of PLURAL_CATEGORIES) {
      if (!categories.includes(cat)) continue
      const raw = items[cat] ?? other
      out[`${name}_${cat}`] = convertString(raw, 'count')
    }
  }
  const resolveRef = (v: string): string => {
    const ref = /^@string\/(\w+)$/.exec(v.trim())
    if (!ref) return convertString(v)
    const local = parsed.strings.get(ref[1])
    if (local) return convertString(local.value)
    const fromBase = base?.strings.get(ref[1])
    return fromBase ? convertString(fromBase.value) : ''
  }
  for (const [name, items] of parsed.arrays) out[name] = items.map(resolveRef)
  return out
}

export interface LocaleInfo {
  tag: string
  nativeName: string
  englishName: string
  /** number of translated keys; 0 means the locale falls back to English entirely */
  keys: number
}

function displayName(tag: string, inLocale: string): string {
  try {
    const n = new Intl.DisplayNames([inLocale], { type: 'language' }).of(tag) ?? tag
    return n.charAt(0).toLocaleUpperCase(inLocale) + n.slice(1)
  } catch {
    return tag
  }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const resDir = resolve(root, 'reference/wholphin/app/src/main/res')
  const outDir = resolve(root, 'src/i18n/locales')
  if (!existsSync(resDir)) {
    console.warn('gen-strings: reference checkout missing, keeping committed locales')
    return
  }
  mkdirSync(outDir, { recursive: true })
  const folders = readdirSync(resDir).filter((d) => d === 'values' || d.startsWith('values-'))
  const base = parseResources(readFileSync(resolve(resDir, 'values/strings.xml'), 'utf8'))
  const infos: LocaleInfo[] = []
  for (const folder of folders) {
    const file = resolve(resDir, folder, 'strings.xml')
    if (!existsSync(file)) continue
    const qualifier = folder === 'values' ? '' : folder.slice('values-'.length)
    // Skip non-locale qualifiers (night, v26, television...)
    if (qualifier && !/^([a-z]{2,3})(-r[A-Z]{2})?$|^b\+/.test(qualifier)) continue
    const tag = androidQualifierToBcp47(qualifier)
    const parsed = folder === 'values' ? base : parseResources(readFileSync(file, 'utf8'))
    const json = toI18next(tag, parsed, folder === 'values' ? null : base)
    writeFileSync(resolve(outDir, `${tag}.json`), JSON.stringify(json, null, 2) + '\n')
    infos.push({ tag, nativeName: displayName(tag, tag), englishName: displayName(tag, 'en'), keys: Object.keys(json).length })
  }
  infos.sort((a, b) => a.tag.localeCompare(b.tag))
  const lines = [
    '// GENERATED by tools/gen-strings.ts. Do not edit.',
    '',
    'export interface LocaleInfo {',
    '  tag: string',
    '  nativeName: string',
    '  englishName: string',
    '  /** translated keys; 0 = falls back to English entirely */',
    '  keys: number',
    '}',
    '',
    `export const LOCALES: readonly LocaleInfo[] = ${JSON.stringify(infos, null, 2)}`,
    '',
    'type LocaleModule = { default: Record<string, string | string[]> }',
    '',
    '/** Lazy loaders; English is bundled by src/i18n/index.ts and has no loader. */',
    'export const LOCALE_LOADERS: Record<string, () => Promise<LocaleModule>> = {',
    ...infos.filter((i) => i.tag !== 'en').map((i) => `  '${i.tag}': () => import('./${i.tag}.json'),`),
    '}',
    '',
  ]
  writeFileSync(resolve(outDir, 'index.ts'), lines.join('\n'))
  console.log(`gen-strings: wrote ${infos.length} locales to src/i18n/locales`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
