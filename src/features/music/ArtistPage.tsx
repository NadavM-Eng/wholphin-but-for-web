import clsx from 'clsx'
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { submitBackdrop } from '../../app/backdrop'
import { nav } from '../../app/nav'
import { useSession } from '../../api/session'
import { usePrefs } from '../../stores/preferences'
import { useMusicQueue } from '../../stores/musicQueue'
import { ErrorMessage, LoadingPage } from '../../ui'
import { useImageResolver } from '../common/imageResolver'
import { useItemContextMenu } from '../common/useItemContextMenu'
import { canDeleteItem, useItemActions } from '../common/useItemActions'
import { useTranslate } from '../common/useTranslate'
import { INSTANT_MIX_NAV_DELAY_MS } from './AlbumPage'
import { MusicButtons } from './components/MusicButtons'
import { MusicCardRow } from './components/MusicCardRow'
import { MusicHeader } from './components/MusicHeader'
import { SongRow } from './components/SongRow'
import { useArtistAlbums, useMusicItem, useMusicVideos, usePopularSongs, useSimilar } from './data/musicQueries'
import { useMusicContextMenu } from './menu/useMusicContextMenu'
import styles from './MusicPage.module.css'
import { setQueue, setQueueFromSource, startInstantMix } from './service/musicService'

export type ArtistPageProps = {
  /** MUSIC_ARTIST item id */
  itemId: string
}

/**
 * `ArtistDetailsPage` (W/ui/detail/music/ArtistDetailsPage.kt): header (portrait 20%), music buttons, then
 * Popular songs, Albums, Appears on, Music videos and More like this; empty rows are hidden. The backdrop is
 * the artist's own, submitted on every entry (MU-7).
 */
export function ArtistPage({ itemId }: ArtistPageProps) {
  const { t } = useTranslate()
  const navigate = useNavigate()
  const session = useSession()
  const manageMedia = usePrefs('manageMedia')
  const image = useImageResolver()
  const actions = useItemActions()
  const artistQ = useMusicItem(itemId)
  const artist = artistQ.data
  const popularQ = usePopularSongs(itemId)
  const albumsQ = useArtistAlbums(itemId, 'albums')
  const appearsQ = useArtistAlbums(itemId, 'appearsOn')
  const videosQ = useMusicVideos({ artistId: itemId })
  const exclude = useMemo(() => [itemId], [itemId])
  const similarQ = useSimilar(itemId, exclude)
  const currentId = useMusicQueue((s) => s.entries[s.currentIndex]?.id ?? null)
  const queued = useMusicQueue((s) => s.entries)
  const queuedIds = useMemo(() => new Set(queued.map((e) => e.id)), [queued])
  const menu = useMusicContextMenu({ pageItemId: itemId })
  // music videos are video items: the shared item menu (watched, favorite, playlist)
  const videoMenu = useItemContextMenu()

  useEffect(() => {
    if (artist) submitBackdrop(artist)
  }, [artist])

  if (artistQ.isError) return <ErrorMessage title={t('error')} detail={artistQ.error?.message} />
  if (!artist) return <LoadingPage delayMs={300} label={t('loading')} />

  const popular = popularQ.data ?? []
  const canDelete = canDeleteItem(artist, manageMedia, session?.userDto)
  return (
    <div className={clsx(styles.page, styles.pageArtist)}>
      <div className={clsx(styles.top, styles.topArtist)} data-focus-scroll-anchor>
        <MusicHeader item={artist} imageUrl={image(artist, 'Primary', { widthDp: 320 })} overviewDialog />
        <MusicButtons
          title={artist.Name ?? ''}
          favorite={artist.UserData?.IsFavorite ?? false}
          canDelete={canDelete}
          onPlay={(shuffle) => void setQueueFromSource({ kind: 'artist', id: itemId }, 0, shuffle)}
          onInstantMix={() => {
            void startInstantMix(itemId)
            setTimeout(() => void navigate(nav.nowPlaying()), INSTANT_MIX_NAV_DELAY_MS)
          }}
          onFavorite={() => void actions.setFavorite(artist, !(artist.UserData?.IsFavorite ?? false))}
          onMore={() => menu.open(artist, null, { index: 0 })}
          onConfirmDelete={() => void actions.deleteItem(artist).then(() => navigate(-1))}
        />
      </div>
      {popular.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>{t('popular_songs')}</h2>
          <div className={styles.songs} role="list">
            {popular.map((song, index) => (
              <SongRow
                key={song.Id}
                className={styles.song}
                indexText={song.IndexNumber != null ? String(song.IndexNumber) : ''}
                title={song.Name ?? null}
                runtimeMs={song.RunTimeTicks != null ? song.RunTimeTicks / 10_000 : null}
                isPlaying={currentId === song.Id}
                isQueued={!!song.Id && queuedIds.has(song.Id)}
                focusKey={`artist-song:${song.Id}`}
                // clicking a popular song plays only that song
                onClick={() => void setQueue([song], false)}
                onContextMenu={menu.cardActions(song, { index }).onContextMenu}
                onMore={() => menu.open(song, null, { index })}
              />
            ))}
          </div>
        </>
      )}
      <div className={styles.rows}>
        <MusicCardRow
          title={t('albums')}
          items={albumsQ.data ?? []}
          shape="square"
          menu={(item, index) => menu.cardActions(item, { index, showGoTo: true })}
          restoreKey={`artist-albums-${itemId}`}
          focusKeyPrefix="artist-album"
        />
        <MusicCardRow
          title={t('appears_on')}
          items={appearsQ.data ?? []}
          shape="square"
          menu={(item, index) => menu.cardActions(item, { index, showGoTo: true })}
          restoreKey={`artist-appears-${itemId}`}
          focusKeyPrefix="artist-appears"
        />
        <MusicCardRow
          title={t('music_videos')}
          items={videosQ.data ?? []}
          shape="item"
          overlays
          menu={(item) => videoMenu.cardActions(item)}
          restoreKey={`artist-videos-${itemId}`}
          focusKeyPrefix="artist-video"
        />
        <MusicCardRow
          title={t('more_like_this')}
          items={similarQ.data ?? []}
          shape="square"
          menu={(item, index) => menu.cardActions(item, { index, showGoTo: true })}
          restoreKey={`artist-similar-${itemId}`}
          focusKeyPrefix="artist-similar"
        />
      </div>
      {menu.element}
      {videoMenu.element}
    </div>
  )
}
