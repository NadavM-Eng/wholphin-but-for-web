import { useNavigate } from 'react-router'
import { nav } from '../../app/nav'
import { useSession } from '../../api/session'
import { usePrefs } from '../../stores/preferences'
import { ErrorMessage, LoadingPage } from '../../ui'
import { useImageResolver } from '../common/imageResolver'
import { canDeleteItem, useItemActions } from '../common/useItemActions'
import { useTranslate } from '../common/useTranslate'
import { INSTANT_MIX_NAV_DELAY_MS } from './AlbumPage'
import { MusicButtons } from './components/MusicButtons'
import { MusicHeader } from './components/MusicHeader'
import { useMusicItem } from './data/musicQueries'
import { useMusicContextMenu } from './menu/useMusicContextMenu'
import styles from './MusicPage.module.css'
import { setQueue, startInstantMix } from './service/musicService'

export type SongPageProps = {
  /** AUDIO item id (a song without an album; songs with one open their album page) */
  itemId: string
}

/** `SongDetailsPage` (W/ui/detail/music/SongDetailsPage.kt): album-style header and the buttons minus Shuffle. */
export function SongPage({ itemId }: SongPageProps) {
  const { t } = useTranslate()
  const navigate = useNavigate()
  const session = useSession()
  const manageMedia = usePrefs('manageMedia')
  const image = useImageResolver()
  const actions = useItemActions()
  const songQ = useMusicItem(itemId)
  const song = songQ.data
  const menu = useMusicContextMenu({ pageItemId: itemId })
  if (songQ.isError) return <ErrorMessage title={t('error')} detail={songQ.error?.message} />
  if (!song) return <LoadingPage delayMs={300} label={t('loading')} />
  return (
    <div className={styles.page}>
      <div className={styles.top} data-focus-scroll-anchor>
        <MusicHeader item={song} imageUrl={image(song, 'Primary', { widthDp: 320 })} />
        <MusicButtons
          title={song.Name ?? ''}
          favorite={song.UserData?.IsFavorite ?? false}
          canDelete={canDeleteItem(song, manageMedia, session?.userDto)}
          showShuffle={false}
          onPlay={() => void setQueue([song], false)}
          onInstantMix={() => {
            void startInstantMix(itemId)
            setTimeout(() => void navigate(nav.nowPlaying()), INSTANT_MIX_NAV_DELAY_MS)
          }}
          onFavorite={() => void actions.setFavorite(song, !(song.UserData?.IsFavorite ?? false))}
          onMore={() => menu.open(song, null, { index: 0 })}
          onConfirmDelete={() => void actions.deleteItem(song).then(() => navigate(-1))}
        />
      </div>
      {menu.element}
    </div>
  )
}
