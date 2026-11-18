import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'

/** `DateUtils.formatDateRange(SHOW_TIME | SHOW_DATE | SHOW_WEEKDAY)`; null if either end is missing. */
export function programDateRange(item: BaseItemDto, locale: string): string | null {
  if (!item.StartDate || !item.EndDate) return null
  const start = new Date(item.StartDate)
  const end = new Date(item.EndDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const f = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return f.formatRange(start, end)
}
