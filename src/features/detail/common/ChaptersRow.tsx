import type { ChapterInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { getChapterImageUrl } from '../../../api/images'
import { formatDuration, roundSecondsMs, ticksToMs } from '../../../lib/format'
import { ChapterCard, ItemRow } from '../../../ui'
import { useCardContext } from '../../common/cardAdapters'
import { useTranslate } from '../../common/useTranslate'

const CHAPTER_HEIGHT = 120

/**
 * Upstream `ChapterRow`: "Chapters", 120dp tall chapter images (16:9 until loaded), name + position
 * (`formatDuration(roundSeconds)`); a click plays from the chapter. No long-press action.
 */
export function ChaptersRow({ itemId, chapters, onPlay, restoreKey }: { itemId: string; chapters: ChapterInfo[]; onPlay: (ms: number) => void; restoreKey: string }) {
  const { t } = useTranslate()
  const ctx = useCardContext()
  if (chapters.length === 0) return null
  // `Chapter.fromDto`: sorted by start position; the image index stays the server's index.
  const sorted = chapters.map((c, index) => ({ c, index })).sort((a, b) => (a.c.StartPositionTicks ?? 0) - (b.c.StartPositionTicks ?? 0))
  return (
    <ItemRow
      title={t('chapters')}
      count={sorted.length}
      itemWidth={(CHAPTER_HEIGHT * 16) / 9}
      restoreKey={restoreKey}
      previousLabel={t('web_previous')}
      nextLabel={t('web_next')}
      renderItem={(i) => {
        const { c, index } = sorted[i]
        const ms = ticksToMs(c.StartPositionTicks ?? 0)
        return (
          <div data-focus-key={`chapters:${i}`}>
            <ChapterCard
              name={c.Name}
              time={formatDuration(t, roundSecondsMs(ms))}
              imageSrc={c.ImageTag ? getChapterImageUrl(ctx.baseUrl, itemId, index, c.ImageTag) : null}
              height={CHAPTER_HEIGHT}
              onClick={() => onPlay(ms)}
            />
          </div>
        )
      }}
    />
  )
}
