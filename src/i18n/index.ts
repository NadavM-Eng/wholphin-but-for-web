import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import extraEn from './extra/en.json'
import en from './locales/en.json'
import { LOCALES, LOCALE_LOADERS } from './locales'

export { LOCALES } from './locales'
export type { LocaleInfo } from './locales'

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'yi'])
const LEGACY: Record<string, string> = { iw: 'he', in: 'id', ji: 'yi' }
const available = new Map(LOCALES.map((l) => [l.tag.toLowerCase(), l.tag]))

/** Best shipped locale for a BCP-47 tag: exact, then language-only, else null. */
export function matchLocale(tag: string | null | undefined): string | null {
  if (!tag) return null
  const [rawLang, ...rest] = tag.replace(/_/g, '-').split('-')
  const lang = LEGACY[rawLang.toLowerCase()] ?? rawLang.toLowerCase()
  const full = [lang, ...rest].join('-').toLowerCase()
  return available.get(full) ?? available.get(lang) ?? null
}

/** Language from the browser preferences (navigator.languages order), falling back to English. */
export function browserLocale(): string {
  const langs = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const l of langs) {
    const m = matchLocale(l)
    if (m) return m
  }
  return 'en'
}

export function isRtl(tag: string): boolean {
  return RTL_LANGUAGES.has(tag.split('-')[0].toLowerCase())
}

async function ensureLoaded(tag: string): Promise<void> {
  const chain = [tag]
  const base = tag.split('-')[0]
  if (base !== tag && available.has(base)) chain.push(base)
  await Promise.all(
    chain.map(async (t) => {
      if (t === 'en' || i18next.hasResourceBundle(t, 'translation')) return
      const loader = LOCALE_LOADERS[t]
      if (!loader) return
      const mod = await loader()
      i18next.addResourceBundle(t, 'translation', mod.default, true, false)
    }),
  )
}

function applyDocumentLanguage(tag: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = tag
  document.documentElement.dir = isRtl(tag) ? 'rtl' : 'ltr'
}

/**
 * English text shown in a right-to-left language (the `web_` strings and whatever a locale has not translated
 * yet) is wrapped in a left-to-right isolate (U+2066 … U+2069). Without it the paragraph's direction reorders
 * the sentence: the full stop moves to the front and "5 of 15" reads "of 15 5".
 */
const PLURAL_SUFFIXES = ['', '_zero', '_one', '_two', '_few', '_many', '_other']
function translatedIn(lng: string, key: string): boolean {
  const langs = lng.includes('-') ? [lng, lng.split('-')[0]] : [lng]
  return langs.some((l) => PLURAL_SUFFIXES.some((s) => i18next.getResource(l, 'translation', key + s) != null))
}
const ltrFallback = {
  type: 'postProcessor' as const,
  name: 'ltrFallback',
  process(value: string, key: string | string[]): string {
    const lng = i18next.language
    if (typeof value !== 'string' || !value || !lng || !isRtl(lng)) return value
    const k = Array.isArray(key) ? key[0] : key
    return translatedIn(lng, k) ? value : `\u2066${value}\u2069`
  },
}

/**
 * `"$label (n)"`, as upstream builds its counted titles (`stringResource(R.string.songs) + " (N)"`). An English
 * fallback in a right-to-left language comes back from `t()` wrapped in a left-to-right isolate (ltrFallback
 * above); the count goes inside it, or the line would read "(6) Songs" where Android, which takes the text
 * direction from the content, shows "Songs (6)".
 */
export function withCount(label: string, count: number): string {
  if (label.startsWith('\u2066') && label.endsWith('\u2069')) return `${label.slice(0, -1)} (${count})\u2069`
  return `${label} (${count})`
}

let initPromise: Promise<unknown> | null = null

/** Initializes i18next with English bundled; other locales load on demand. Safe to call repeatedly. */
export function initI18n(language?: string | null): Promise<unknown> {
  if (!initPromise) {
    initPromise = i18next.use(initReactI18next).use(ltrFallback).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: { ...en, ...extraEn } } },
      interpolation: { escapeValue: false },
      returnNull: false,
      postProcess: ['ltrFallback'],
      react: { useSuspense: false },
    })
  }
  return initPromise.then(() => setLanguage(language ?? null))
}

/**
 * Switches the UI language. `null` follows the browser (upstream: empty application locale list =
 * follow the system). Sets `<html lang dir>`.
 */
export async function setLanguage(tag: string | null): Promise<string> {
  const target = matchLocale(tag) ?? browserLocale()
  await ensureLoaded(target)
  if (i18next.language !== target) await i18next.changeLanguage(target)
  applyDocumentLanguage(target)
  return target
}

export { i18next }
