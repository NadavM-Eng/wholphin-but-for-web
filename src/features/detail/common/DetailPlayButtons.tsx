import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { ticksToMs } from '../../../lib/format'
import { ConfirmDialog, ExpandableButton, FaIcon, MaterialIcon, PlayButtons } from '../../../ui'
import { useItemActions } from '../../common/useItemActions'
import { useTranslate } from '../../common/useTranslate'
import styles from './DetailPlayButtons.module.css'
import { StreamChooserDialog } from './StreamChooserDialog'
import { TrailerButton } from './TrailerButton'
import type { Trailer } from './trailers'
import { mayTakeInitialFocus } from '../../../app/shell'

export type DetailPlayButtonsProps = {
  item: BaseItemDto
  /** Play / Resume / Restart / a chapter: start position in ms. */
  onPlay: (positionMs: number) => void
  onMore: () => void
  /** null = no trailer button (episodes); [] = "No trailers" (disabled). */
  trailers?: Trailer[] | null
  canDelete: boolean
  onConfirmDelete: () => void
  /** Navigation for local trailers. */
  navigate: (path: string) => void
  /** Called after the watched button was pressed (the series overview moves focus back to its strip). */
  onWatchedToggled?: () => void
  /** Focus Play once when the page opens (MovieDetails / EpisodeDetails request it on arrival). */
  initialFocus?: boolean
  className?: string
}

const RED = 'var(--fx-favorite-active)'

/**
 * Upstream `ExpandablePlayButtons` (W/ui/components/PlayButtons.kt): Play/Resume, Restart (only with a resume
 * point), Version (only with several sources), watched, favorite, trailers (three states), Delete (only when
 * allowed), More. Labels appear on hover / keyboard focus; on touch screens the first button keeps its label.
 */
export function DetailPlayButtons({ item, onPlay, onMore, trailers, canDelete, onConfirmDelete, navigate, onWatchedToggled, initialFocus, className }: DetailPlayButtonsProps) {
  const { t } = useTranslate()
  const actions = useItemActions()
  const [dialog, setDialog] = useState<'version' | 'delete' | null>(null)
  const resume = ticksToMs(item.UserData?.PlaybackPositionTicks ?? 0)
  const watched = item.UserData?.Played ?? false
  const favorite = item.UserData?.IsFavorite ?? false
  const sources = item.MediaSources ?? []
  const playRef = useRef<HTMLElement>(null)
  const restartRef = useRef<HTMLElement>(null)
  const hadRestart = useRef(resume > 0)

  // Play takes the initial keyboard focus (upstream focusRequester on Play), not the overview above it.
  useEffect(() => {
    playRef.current?.setAttribute('data-focus-default', '')
    // Like the library grid: never on touch screens and never stealing focus; on Back the shell's focus
    // restore puts the remembered element back over it.
    if (!initialFocus || matchMedia('(hover: none)').matches) return
    const id = requestAnimationFrame(() => {
      if (mayTakeInitialFocus()) playRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
    // on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If focus was on Restart and it disappears, focus moves to Play (PlayButtons.kt:63-68).
  useEffect(() => {
    if (hadRestart.current && resume === 0 && document.activeElement === document.body) playRef.current?.focus({ preventScroll: true })
    hadRestart.current = resume > 0
  }, [resume])

  return (
    <>
      {/* Back restores focus to Play (upstream focusRestorer(firstFocus) on the row). */}
      <div data-focus-key="detail-play-buttons" className={clsx(styles.row, className)}>
      <PlayButtons label={t('play')} className={styles.buttons}>
        <ExpandableButton
          ref={playRef}
          icon={<MaterialIcon name="play_arrow" size={28} />}
          label={resume > 0 ? t('resume') : t('play')}
          labelOnTouch
          onClick={() => onPlay(resume)}
        />
        {resume > 0 && (
          <ExpandableButton ref={restartRef} icon={<MaterialIcon name="refresh" size={28} mirror />} label={t('restart')} onClick={() => onPlay(0)} />
        )}
        {sources.length > 1 && (
          <ExpandableButton icon={<FaIcon name="file_video" />} iconKind="fa" label={t('version')} onClick={() => setDialog('version')} />
        )}
        <ExpandableButton
          icon={<FaIcon name={watched ? 'eye' : 'eye_slash'} />}
          iconKind="fa"
          label={watched ? t('mark_unwatched') : t('mark_watched')}
          onClick={() => {
            void actions.setPlayed(item, !watched)
            onWatchedToggled?.()
          }}
        />
        <ExpandableButton
          icon={<FaIcon name="heart" />}
          iconKind="fa"
          iconColor={favorite ? RED : undefined}
          label={favorite ? t('remove_favorite') : t('add_favorite')}
          onClick={() => void actions.setFavorite(item, !favorite)}
        />
        {trailers != null && <TrailerButton trailers={trailers} navigate={navigate} />}
        {canDelete && (
          <ExpandableButton icon={<MaterialIcon name="delete" size={24} />} label={t('delete')} destructive onClick={() => setDialog('delete')} />
        )}
        <ExpandableButton icon={<MaterialIcon name="more_vert" size={28} />} label={t('more')} onClick={onMore} />
      </PlayButtons>
      </div>
      {dialog === 'version' && <StreamChooserDialog item={item} choice="version" elevation={1} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <ConfirmDialog
          open
          variant="delete"
          title={t('delete_item')}
          body={item.Type === 'Episode' ? (item.SeriesName ?? item.Name) : item.Name}
          cancelLabel={t('cancel')}
          confirmLabel={t('confirm')}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null)
            onConfirmDelete()
          }}
        />
      )}
    </>
  )
}
