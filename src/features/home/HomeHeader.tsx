import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useState } from 'react'
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
 * episode/season name, the quick-details line and the overview in a fixed box (3 lines, 2 for
 * episodes). Text swaps instantly; an empty header keeps its height.
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
  const twoLines = item?.Type === 'Episode'
  const overview = item?.Overview?.trim()
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
            <div className={twoLines ? styles.overview2 : styles.overview3}>
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
