import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { imagePx } from '../../../api/images'
import { usePrefs } from '../../../stores/preferences'
import { useSessionStore } from '../../../stores/session'
import { useDp } from '../../../theme/scale'
import { QuickDetails, TitleOrLogo } from '../../../ui'
import { useCardContext } from '../../common/cardAdapters'
import { headerTitle, quickDetailsFor } from '../../common/itemText'
import { logoUrl } from '../../common/logo'
import { useTranslate } from '../../common/useTranslate'
import styles from './ListDetails.module.css'

/**
 * `CollectionFolderListDetails` (CollectionFolderList.kt:140-200): a 33%-wide pane beside the list with
 * the logo (always, whatever the logo preference) or title, the primary image (radius 8), quick details
 * and the overview (5 lines).
 */
export function ListDetails({ item }: { item: BaseItemDto | null | undefined }) {
  const { t, locale } = useTranslate()
  const ctx = useCardContext()
  const toggles = usePrefs('displayToggles')
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  const dp = useDp()
  const details = item ? quickDetailsFor(t, item, { toggles, nowMs: Date.now(), locale }) : null
  const image = item ? ctx.image(item, 'Primary', { heightDp: 320, useSeries: true }) : null
  return (
    <aside className={styles.pane}>
      {item && (
        <>
          <div className={styles.logo}>
            <TitleOrLogo key={item.Id} title={headerTitle(item)} logoSrc={logoUrl(baseUrl, item, imagePx(dp(60), 'css'))} showLogo as="h2" dir="auto" />
          </div>
          <div className={styles.imageBox}>{image && <img className={styles.image} src={image} alt="" />}</div>
          {details && (
            <QuickDetails
              parts={details.parts}
              officialRating={details.officialRating}
              communityRating={details.communityRating}
              criticRating={details.criticRating}
              // QuickDetails(item.ui.quickDetails, null): no "Ends at" in this pane
              endsAt={null}
              locale={locale}
            />
          )}
          {/* OverviewText(maxLines = 5): a 5-line box whether or not there is an overview */}
          <div className={styles.overviewBox}>
            <p className={styles.overview} dir="auto">
              {item.Overview}
            </p>
          </div>
        </>
      )}
    </aside>
  )
}
