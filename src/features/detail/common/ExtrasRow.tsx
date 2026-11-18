import { useSession } from '../../../api/session'
import { nav, useNav } from '../../../app/nav'
import { ItemRow, PosterCard } from '../../../ui'
import { cardOverlay, useCardContext } from '../../common/cardAdapters'
import type { GridRequestParams } from '../../browse/data/gridRequestKinds'
import { SLIM_ITEM_FIELDS } from '../../common/itemFields'
import { resumeMs } from '../../common/itemMenu'
import { useTranslate } from '../../common/useTranslate'
import { extraTypeTitleKey, type ExtrasItem } from './extras'

/**
 * Upstream `ExtrasRow`: "Extras", `SeasonCard`s 128dp tall (item aspect, default 16:9) with overlay. A single
 * extra plays (from its resume point); a group opens a grid of its items.
 */
export function ExtrasRow({ extras, restoreKey }: { extras: ExtrasItem[]; restoreKey: string }) {
  const { t } = useTranslate()
  const ctx = useCardContext()
  const go = useNav()
  const userId = useSession()?.user.id
  if (extras.length === 0) return null
  return (
    <ItemRow
      title={t('extras_title')}
      count={extras.length}
      itemWidth={(i) => 128 * aspectOf(extras[i])}
      restoreKey={restoreKey}
      previousLabel={t('web_previous')}
      nextLabel={t('web_next')}
      renderItem={(i) => {
        const e = extras[i]
        const imageItem = e.kind === 'single' ? e.item : e.imageItem
        const href = e.kind === 'single' ? nav.play(e.item.Id ?? '', { t: resumeMs(e.item) }) : undefined
        const overlay = e.kind === 'single' ? cardOverlay(e.item, ctx.locale) : { watched: e.played }
        return (
          <div data-focus-key={`extras:${i}`}>
            <PosterCard
              title={e.title}
              subtitle={e.subtitle}
              name={e.title}
              imageSrc={ctx.image(imageItem, 'Primary', { heightDp: 128 })}
              height={128}
              aspectRatio={aspectOf(e)}
              showOverlay
              {...overlay}
              favorite={false}
              unplayedCount={undefined}
              versionCount={0}
              playedPercent={e.kind === 'single' ? overlay.playedPercent : null}
              href={href}
              onClick={(ev) => {
                ev.preventDefault()
                if (e.kind === 'single') go.play(e.item.Id ?? '', { t: resumeMs(e.item) })
                else
                  go.openGrid({
                    title: extraTypeTitleKey(e.type),
                    titleIsKey: true,
                    // ExtrasItem.Group.destination: GetItemsRequest(ids, SORT_NAME ascending), ViewOptions(3, 24, WIDE).
                    // userId + fields so the grid's cards get user data (watched marks) like the rest of the app.
                    request: 'items',
                    params: {
                      query: {
                        userId,
                        ids: e.items.map((x) => x.Id).filter((x): x is string => !!x),
                        sortBy: ['SortName'],
                        sortOrder: ['Ascending'],
                        fields: SLIM_ITEM_FIELDS,
                        enableUserData: true,
                      },
                      columns: 3,
                      spacing: 24,
                      aspectRatio: 'WIDE',
                    } satisfies GridRequestParams,
                  })
              }}
            />
          </div>
        )
      }}
    />
  )
}

function aspectOf(e: ExtrasItem): number {
  const it = e.kind === 'single' ? e.item : e.imageItem
  const a = it.PrimaryImageAspectRatio
  return a && a > 0 ? a : 16 / 9
}
