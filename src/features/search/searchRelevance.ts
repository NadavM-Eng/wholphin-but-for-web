// `SearchRelevance` (W/util/SearchRelevance.kt): client-side ordering of search results, lower = better.
import type { BaseItemDto, BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'

const REGEX_PATTERN = /^\/(.+)\/(i)?$/

/** Kotlin `Int.MAX_VALUE`, the score of an item without a name. */
export const NO_NAME_SCORE = 2147483647

export function searchScore(name: string | null | undefined, type: BaseItemKind | null | undefined, query: string): number {
  if (name == null) return NO_NAME_SCORE
  const n = name.toLocaleLowerCase()
  const q = query.toLocaleLowerCase()

  // The pattern form is detected on the raw query but matched against the lower-cased name, so a
  // pattern with capitals and no `i` never matches (upstream behavior, kept).
  const match = REGEX_PATTERN.exec(query)
  if (match) return regexScore(n, match[1], match[2] === 'i') + typeBonus(type)

  let score: number
  if (n === q) score = 0
  else if (n.startsWith(q)) score = 100
  else if (n.includes(` ${q}`)) score = 200
  else if (n.includes(q)) score = 300
  else score = fuzzyScore(n, q)
  return score + typeBonus(type)
}

function regexScore(name: string, pattern: string, caseInsensitive: boolean): number {
  try {
    return new RegExp(pattern, caseInsensitive ? 'i' : '').test(name) ? 250 : 400
  } catch {
    return 400
  }
}

function fuzzyScore(name: string, query: string): number {
  const maxLen = Math.max(name.length, query.length)
  if (maxLen === 0) return 0
  const similarity = 1 - levenshtein(name, query) / maxLen
  if (similarity >= 0.8) return 350
  if (similarity >= 0.6) return 375
  return 400
}

export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1])
    }
    prev = cur
  }
  return prev[n]
}

function typeBonus(type: BaseItemKind | null | undefined): number {
  switch (type) {
    case 'Series':
      return 0
    case 'Movie':
      return 1
    case 'BoxSet':
      return 2
    case 'Episode':
      return 10
    default:
      return 5
  }
}

/** Stable ascending sort by score (ties keep the server order), as `sortedWith(compareBy { score })`. */
export function sortByRelevance(items: readonly BaseItemDto[], query: string): BaseItemDto[] {
  return items
    .map((item, i) => ({ item, i, s: searchScore(item.Name, item.Type, query) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.item)
}
