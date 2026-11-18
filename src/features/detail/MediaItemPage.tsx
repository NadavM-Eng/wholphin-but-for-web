// `Destination.MediaItem` (W/ui/nav/DestinationContent.kt:146-289): one URL (/item/:id) for every item kind;
// the page fetches the item and shows the screen for its kind.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import { clearBackdrop } from '../../app/backdrop'
import { itemDestination, nav } from '../../app/nav'
import { ErrorMessage, LoadingPage } from '../../ui'
import { useTranslate } from '../common/useTranslate'
import { musicPageFor } from '../music/useMusicRoute'
import { photoPageFor } from '../photos/usePhotoRoute'
import { BoxSetDetails } from './collection/BoxSetDetails'
import { useDetailItem } from './common/detailQueries'
import { EpisodeDetails } from './episode/EpisodeDetails'
import styles from './MediaItemPage.module.css'
import { MovieDetails } from './movie/MovieDetails'
import { PersonPage } from './person/PersonPage'
import { PlaylistDetails } from './playlist/PlaylistDetails'
import { SeriesDetails } from './series/SeriesDetails'

function Unsupported({ item }: { item: BaseItemDto }) {
  const { t } = useTranslate()
  useEffect(() => clearBackdrop(), [])
  return <p className={styles.placeholderText}>{t('web_unsupported_item_type', { p1: item.Type ?? '' })}</p>
}

/** Route page (lazy default export of src/app/routes.tsx). */
export default function MediaItemPage() {
  const { itemId = '' } = useParams()
  const { t } = useTranslate()
  const [params] = useSearchParams()
  const q = useDetailItem(itemId)
  if (q.isError && !q.data) {
    return (
      <div className={styles.page}>
        <ErrorMessage title={t('compose_error_message_title')} detail={q.error instanceof Error ? q.error.message : String(q.error)} />
      </div>
    )
  }
  const item = q.data
  if (!item) {
    return (
      <div className={styles.page}>
        <LoadingPage label={t('loading')} />
      </div>
    )
  }
  // Music (album, artist, song, audio playlist; ?song= focuses a song) and photo kinds (album; a photo opens the
  // viewer on its album) have their own feature pages (DestinationContent.kt:192, 246-252, 256-275).
  const feature = musicPageFor(item, { songId: params.get('song') }) ?? photoPageFor(item, 'item')
  if (feature) return feature
  switch (item.Type) {
    case 'Recording':
    case 'Movie':
    case 'Video':
    case 'MusicVideo':
    case 'Trailer':
      // Upstream: VIDEO and MUSIC_VIDEO reuse MovieDetails ("TODO Use VideoDetails"); a trailer opened by URL too.
      return <MovieDetails key={item.Id} item={item} />
    case 'Episode':
      return <EpisodeDetails key={item.Id} item={item} />
    case 'BoxSet':
      return <BoxSetDetails key={item.Id} item={item} />
    case 'Playlist':
      return <PlaylistDetails key={item.Id} item={item} />
    case 'Person':
      return <PersonPage key={item.Id} item={item} />
    case 'Series':
      return <SeriesDetails key={item.Id} item={item} />
    case 'Season':
      return item.SeriesId ? <Navigate to={nav.series(item.SeriesId, { season: item.Id })} replace /> : <Unsupported item={item} />
    case 'CollectionFolder':
    case 'UserView':
    case 'Folder':
    case 'AggregateFolder':
    case 'ManualPlaylistsFolder':
    case 'PlaylistsFolder':
      return <Navigate to={nav.library(item.Id ?? itemId)} replace />
    case 'TvChannel':
    case 'Program':
    case 'LiveTvChannel':
    case 'LiveTvProgram':
    case 'TvProgram':
      // Upstream has no page for these: BaseItem.destination() plays the channel. A URL opened directly does the same.
      return <Navigate to={itemDestination({ ...item, Type: item.Type === 'Program' || item.Type === 'LiveTvProgram' || item.Type === 'TvProgram' ? 'Program' : 'TvChannel' })} replace />
    default:
      return <Unsupported item={item} />
  }
}
