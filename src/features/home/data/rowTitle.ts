import type { Translate } from '../../../lib/format'
import type { RowTitle } from './rowFetchers'

export function rowTitleText(t: Translate, title: RowTitle): string {
  if ('text' in title) return title.text
  if (title.p1Key) return t(title.key, { p1: t(title.p1Key) })
  if (title.p1 != null) return t(title.key, { p1: title.p1 })
  return t(title.key)
}
