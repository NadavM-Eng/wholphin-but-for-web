import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { Fragment, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { submitBackdrop } from '../../app/backdrop'
import { nav } from '../../app/nav'
import { useSession } from '../../api/session'
import { withCount } from '../../i18n'
import { usePrefs } from '../../stores/preferences'
import { useMusicQueue } from '../../stores/musicQueue'
import { ErrorMessage, LoadingPage } from '../../ui'
import { useImageResolver } from '../common/imageResolver'
import { canDeleteItem, useItemActions } from '../common/useItemActions'
import { useTranslate } from '../common/useTranslate'
import { MusicButtons } from './components/MusicButtons'
import { MusicCardRow } from './components/MusicCardRow'
import { MusicHeader } from './components/MusicHeader'
import { SongRow } from './components/SongRow'
import { useAlbumBackdropItem, useAlbumSongs, useExtras, useMusicItem, useMusicVideos, useSimilar } from './data/musicQueries'
import { useMusicContextMenu } from './menu/useMusicContextMenu'
import styles from './MusicPage.module.css'
import { discGroups, isVariousArtists } from './musicText'
import { playItem, setQueueFromSource, startInstantMix } from './service/musicService'

export type AlbumPageProps = {
  /** MUSIC_ALBUM item id */
  itemId: string
  /** `initialSongId`: scroll to and focus this song (a song card's destination) */
  initialSongId?: string | null
}

/** Upstream starts the instant mix and opens Now Playing 250 ms later. */
export const INSTANT_MIX_NAV_DELAY_MS = 250

/**
 * `AlbumDetailsPage` (W/ui/detail/music/AlbumDetailsPage.kt): header, music buttons, "Songs (N)" and the
 * track list (75% wide, centred), then Music videos, Extras and More like this rows.
 */
export function AlbumPage({ itemId, initialSongId }: AlbumPageProps) {
  const { t } = useTranslate()
  const navigate = useNavigate()
  const session = useSession()
  const manageMedia = usePrefs('manageMedia')
  const image = useImageResolver()
  const actions = useItemActions()
  const albumQ = useMusicItem(itemId)
  const album = albumQ.data
  const songsQ = useAlbumSongs(itemId)
  const songs = useMemo(() => songsQ.data ?? [], [songsQ.data])
  const artistIds = useMemo(() => (album?.AlbumArtists ?? []).map((a) => a.Id).filter((x): x is string => !!x), [album])
  const similarQ = useSimilar(album ? itemId : null, artistIds)
  const videosQ = useMusicVideos({ albumId: itemId })
  const extrasQ = useExtras(itemId)
  const backdropQ = useAlbumBackdropItem(album)
  const currentId = useMusicQueue((s) => s.entries[s.currentIndex]?.id ?? null)
  const queued = useMusicQueue((s) => s.entries)
  const queuedIds = useMemo(() => new Set(queued.map((e) => e.id)), [queued])
  const various = album ? isVariousArtists(album) : false
  const groups = useMemo(() => discGroups(songs), [songs])
  const scrolled = useRef(false)

  // the album's own backdrop, else one of its album artists'
  useEffect(() => {
    if (backdropQ.isSuccess) submitBackdrop(backdropQ.data)
  }, [backdropQ.isSuccess, backdropQ.data])

  // initialSongId: bring the song into view and focus it once
  useEffect(() => {
    if (scrolled.current || !initialSongId || songs.length === 0) return
    scrolled.current = true
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-focus-key="album-song:${CSS.escape(initialSongId)}"]`)
      el?.scrollIntoView({ block: 'center' })
      el?.focus({ preventScroll: true })
    })
  }, [initialSongId, songs.length])

  const menu = useMusicContextMenu({
    pageItemId: itemId,
    // songs of this album: play the album from that song; other cards play the pressed item (MU-5)
    onPlay: (index, item) => (item.Type === 'Audio' && item.AlbumId === itemId ? void setQueueFromSource({ kind: 'album', id: itemId }, index, false) : void playItem(item)),
  })

  if (albumQ.isError) return <ErrorMessage title={t('error')} detail={albumQ.error?.message} />
  if (!album) return <LoadingPage delayMs={300} label={t('loading')} />

  const coverUrl = image(album, 'Primary', { widthDp: 320 })
  const canDelete = canDeleteItem(album, manageMedia, session?.userDto)
  const play = (index: number, shuffle: boolean) => void setQueueFromSource({ kind: 'album', id: itemId }, index, shuffle)

  const songRow = (song: BaseItemDto, index: number) => (
    <SongRow
      key={song.Id}
      className={styles.song}
      indexText={song.IndexNumber != null ? String(song.IndexNumber) : ''}
      title={song.Name ?? null}
      artist={various ? (song.Artists?.join(', ') ?? null) : null}
      runtimeMs={song.RunTimeTicks != null ? song.RunTimeTicks / 10_000 : null}
      isPlaying={currentId === song.Id}
      isQueued={!!song.Id && queuedIds.has(song.Id)}
      focusKey={`album-song:${song.Id}`}
      onClick={() => play(index, false)}
      onContextMenu={menu.cardActions(song, { index }).onContextMenu}
      onMore={() => menu.open(song, null, { index })}
    />
  )

  return (
    <div className={styles.page}>
      <div className={styles.top} data-focus-scroll-anchor>
        <MusicHeader item={album} imageUrl={coverUrl} />
        <MusicButtons
          title={album.Name ?? ''}
          favorite={album.UserData?.IsFavorite ?? false}
          canDelete={canDelete}
          onPlay={(shuffle) => play(0, shuffle)}
          onInstantMix={() => {
            void startInstantMix(itemId)
            setTimeout(() => void navigate(nav.nowPlaying()), INSTANT_MIX_NAV_DELAY_MS)
          }}
          onFavorite={() => void actions.setFavorite(album, !(album.UserData?.IsFavorite ?? false))}
          onMore={() => menu.open(album, null, { index: 0 })}
          onConfirmDelete={() => void actions.deleteItem(album).then(() => navigate(-1))}
        />
      </div>
      <h2 className={styles.sectionTitle}>{withCount(t('songs'), songs.length)}</h2>
      {songsQ.isPending ? (
        <LoadingPage delayMs={300} label={t('loading')} className={styles.inlineLoading} />
      ) : (
        <div className={styles.songs} role="list">
          {groups.length > 1
            ? groups.map((g) => (
                <Fragment key={g.disc ?? 'none'}>
                  <h3 className={styles.disc}>{g.disc != null ? t('web_music_disc', { p1: g.disc }) : ''}</h3>
                  {g.items.map(({ item, index }) => songRow(item, index))}
                </Fragment>
              ))
            : songs.map((s, i) => songRow(s, i))}
        </div>
      )}
      <div className={styles.rows}>
        <MusicCardRow
          title={t('music_videos')}
          items={videosQ.data ?? []}
          shape="item"
          overlays
          restoreKey={`album-videos-${itemId}`}
          focusKeyPrefix="album-video"
        />
        <MusicCardRow title={t('extras_title')} items={extrasQ.data ?? []} shape="item" restoreKey={`album-extras-${itemId}`} focusKeyPrefix="album-extra" />
        <MusicCardRow
          title={t('more_like_this')}
          items={similarQ.data ?? []}
          shape="square"
          menu={(item, index) => menu.cardActions(item, { index, showGoTo: true })}
          restoreKey={`album-similar-${itemId}`}
          focusKeyPrefix="album-similar"
        />
      </div>
      {menu.element}
    </div>
  )
}
