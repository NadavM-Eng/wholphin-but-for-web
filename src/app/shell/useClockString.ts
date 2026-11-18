import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTimeOfDay } from '../../lib/format'

/** LocalClock.kt refreshes the shared time string every 2 s. */
const CLOCK_TICK_MS = 2000

/** Locale time string (12/24 h per locale, upstream `DateFormat.getTimeFormat`) refreshed every 2 s. */
export function useClockString(): string {
  const { i18n } = useTranslation()
  const locale = i18n.language
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  return formatTimeOfDay(new Date(now), locale)
}
