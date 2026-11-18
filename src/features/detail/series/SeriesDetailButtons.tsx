import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useApi, useSession } from '../../../api/session'
import { useNav } from '../../../app/nav'
import { toast } from '../../../app/toast'
import { ConfirmDialog, ExpandableButton, FaIcon, MaterialIcon, PlayButtons } from '../../../ui'
import { resumeMs } from '../../common/itemMenu'
import { useItemActions } from '../../common/useItemActions'
import { useTranslate } from '../../common/useTranslate'
import buttonStyles from '../common/DetailPlayButtons.module.css'
import styles from './SeriesDetails.module.css'
import { TrailerButton } from '../common/TrailerButton'
import type { Trailer } from '../common/trailers'
import { findEpisodeToPlay } from './seriesQueries'
import { mayTakeInitialFocus } from '../../../app/shell'
import { SeriesDiscoverButton } from '../../discover/DetailDiscover'

const RED = 'var(--fx-favorite-active)'

/**
 * The series details button row (W/ui/detail/series/SeriesDetails.kt:386-507), in upstream order: Play (next up,
 * else the first episode, from its resume point), Shuffle (the whole series), watched (always asks first: "Mark
 * entire series as played?"), favorite, the three-state trailer button, Delete (when allowed). No Restart,
 * Version or More here. The Seerr "Discover" button comes last, once Seerr knows the series.
 */
export function SeriesDetailButtons({
  item,
  trailers,
  canDelete,
  onConfirmDelete,
}: {
  item: BaseItemDto
  trailers: Trailer[]
  canDelete: boolean
  onConfirmDelete: () => void
}) {
  const { t } = useTranslate()
  const go = useNav()
  const api = useApi()
  const userId = useSession()?.user.id
  const actions = useItemActions()
  const [dialog, setDialog] = useState<'watched' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const playRef = useRef<HTMLElement>(null)
  const id = item.Id ?? ''
  const played = item.UserData?.Played ?? false
  const favorite = item.UserData?.IsFavorite ?? false

  // Play takes the initial keyboard focus (focusRestorer(playFocusRequester) on the row).
  // ...and focus on arrival (SeriesDetails.kt RequestOrRestoreFocus); never on touch, never stealing focus.
  useEffect(() => {
    playRef.current?.setAttribute('data-focus-default', '')
    if (matchMedia('(hover: none)').matches) return
    const id = requestAnimationFrame(() => {
      if (mayTakeInitialFocus()) playRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const playNextUp = async () => {
    if (busy) return
    setBusy(true)
    try {
      const ep = await findEpisodeToPlay(api, userId, id)
      if (ep?.Id) go.play(ep.Id, { t: resumeMs(ep) })
      // Upstream literal toast text (SeriesViewModel.kt:524-528).
      else toast(t('web_could_not_find_episode'))
    } catch (err) {
      toast(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div data-focus-key="series-buttons" className={clsx(buttonStyles.row, styles.buttonRow)}>
        <PlayButtons label={t('play')} className={buttonStyles.buttons}>
          <ExpandableButton ref={playRef} icon={<MaterialIcon name="play_arrow" size={28} />} label={t('play')} labelOnTouch onClick={() => void playNextUp()} />
          <ExpandableButton icon={<FaIcon name="shuffle" />} iconKind="fa" label={t('shuffle')} onClick={() => go.playList(id, { shuffle: true })} />
          <ExpandableButton
            icon={<FaIcon name={played ? 'eye' : 'eye_slash'} />}
            iconKind="fa"
            label={played ? t('mark_unwatched') : t('mark_watched')}
            onClick={() => setDialog('watched')}
          />
          <ExpandableButton
            icon={<FaIcon name="heart" />}
            iconKind="fa"
            iconColor={favorite ? RED : undefined}
            label={favorite ? t('remove_favorite') : t('add_favorite')}
            onClick={() => void actions.setFavorite(item, !favorite)}
          />
          <TrailerButton trailers={trailers} navigate={(p) => go.to(p)} />
          {canDelete && (
            <ExpandableButton icon={<MaterialIcon name="delete" size={24} />} label={t('delete')} destructive onClick={() => setDialog('delete')} />
          )}
          <SeriesDiscoverButton series={item} />
        </PlayButtons>
      </div>
      {dialog === 'watched' && (
        <ConfirmDialog
          open
          title={item.Name ?? ''}
          body={t(played ? 'mark_entire_series_as_unplayed' : 'mark_entire_series_as_played')}
          cancelLabel={t('cancel')}
          confirmLabel={t('confirm')}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null)
            // POST|DELETE /UserPlayedItems/{seriesId}; the seasons row refetches (tagged 'played').
            void actions.setPlayed(item, !played)
          }}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          open
          variant="delete"
          title={t('delete_item')}
          body={item.Name}
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
