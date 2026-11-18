import type { Translate } from '../../../lib/format'

/** An Android `string-array` resource (stored as a JSON array under its name). */
export function arrayLabels(t: Translate, key: string): string[] {
  const v = t(key, { returnObjects: true }) as unknown
  return Array.isArray(v) ? v.map(String) : []
}
