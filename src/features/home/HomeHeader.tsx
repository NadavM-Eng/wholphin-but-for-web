import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { imagePx } from '../../api/images'
import { useSessionStore } from '../../stores/session'
import { useDp } from '../../theme/scale'
import { QuickDetails, TitleOrLogo } from '../../ui'
import { headerSubtitle, headerTitle, quickDetailsFor, type DisplayToggle } from '../common/itemText'
import { logoUrl } from '../common/logo'
import { useTranslate } from '../common/useTranslate'
import styles from './HomeHeader.module.css'

/** The 2-second `LocalClock` that drives "Ends at". */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const LOGO_HEIGHT_DP = 60

type Props = {
  item: BaseItemDto | null
  showLogo: boolean
  toggles: readonly DisplayToggle[]
}

/**
 * `HomePageHeader` (HomePage.kt:542-632): title or logo (75% wide), then a 60%-wide column with the
 * episode/season name, the quick-details line and the overview (upstream: a fixed box of 3 lines, 2 for
 * episodes; here as many lines as the header has room for, and wider, see HomeHeader.module.css). Text swaps
 * instantly; an empty header keeps its height.
 */
export function HomeHeader({ item, showLogo, toggles }: Props) {
  const { t, locale } = useTranslate()
  const now = useNow(2000)
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  // HeaderUtils.logoHeight (60dp), in device pixels
  const dp = useDp()
  const logoHeight = imagePx(dp(LOGO_HEIGHT_DP), 'css')
  const subtitle = headerSubtitle(item)
  const details = item ? quickDetailsFor(t, item, { toggles, nowMs: now, locale }) : null
  const overview = item?.Overview?.trim()
  // Whole lines that fit the overview's box: the room left under the title, the episode name and the details line
  const box = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState(3)
  const shown = item != null
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const text = el.firstElementChild
      const lineHeight = text ? parseFloat(getComputedStyle(text).lineHeight) : NaN
      if (lineHeight > 0) setLines(Math.max(1, Math.floor((el.clientHeight + 1) / lineHeight)))
    }
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [shown])
  return (
    <header className={styles.header} data-home-header>
      {item && (
        <>
          <div className={styles.title}>
            <TitleOrLogo key={item.Id} title={headerTitle(item)} logoSrc={logoUrl(baseUrl, item, logoHeight)} showLogo={showLogo} as="h1" dir="auto" />
          </div>
          <div className={styles.details}>
            {subtitle && (
              <p className={styles.subtitle} dir="auto">
                {subtitle}
              </p>
            )}
            {details && (
              <QuickDetails
                className={styles.quick}
                parts={details.parts}
                officialRating={details.officialRating}
                communityRating={details.communityRating}
                criticRating={details.criticRating}
                endsAt={details.endsAt}
                locale={locale}
              />
            )}
            <div ref={box} className={styles.overview} style={{ '--lines': lines } as CSSProperties}>
              <p className={styles.overviewText} dir="auto">
                {overview}
              </p>
            </div>
          </div>
        </>
      )}
    </header>
  )
}
