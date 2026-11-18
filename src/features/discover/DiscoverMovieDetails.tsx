import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  canRequestMovies,
  canUserCancelRequest,
  createImageUrl,
  fromCredit,
  fromMovie,
  seerrApi,
  useDiscoverRating,
  useMovieDetails,
  useRelated,
  useSeerrImageContext,
  useSeerrSession,
  availabilityFrom,
} from '../../api/seerr'
import { formatDuration } from '../../lib/format'
import { ErrorMessage, LoadingPage } from '../../ui'
import { directorNames, localeCountry, movieCertification, trailersOf } from './detailHelpers'
import { DiscoverButtons } from './DiscoverButtons'
import styles from './DiscoverDetails.module.css'
import { DiscoverDetailsHeader } from './DiscoverDetailsHeader'
import { DiscoverPeopleRow } from './DiscoverPeopleRow'
import { DiscoverRow } from './DiscoverRow'
import { submitDiscoverBackdrop } from './backdropStore'
import { discoveredItemHref, goToJellyfinHref, jellyfinHref } from './links'
import { RequestMovieDialog, type MovieRequestChoice } from './RequestMovieDialog'
import { useRequestActions } from './useRequestActions'
import { jellyfinIdOf, requestServerId } from '../../api/seerr'
import { plainT } from './seerrText'

/**
 * Seerr movie page (`DiscoverMovieDetails`): header, buttons, people (cast then crew), "More like this",
 * "Recommended". Rows always open Seerr pages; "Go to" opens the Jellyfin movie.
 */
export function DiscoverMovieDetails({ id }: { id: number }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const seerr = useSeerrSession()
  const ctx = useSeerrImageContext()
  const movieQ = useMovieDetails(id)
  const rating = useDiscoverRating('movie', id).data
  const similar = useRelated('movie', 'similar', id)
  const recommended = useRelated('movie', 'recommendations', id)
  const actions = useRequestActions('movie')
  const movie = movieQ.data

  const item = useMemo(() => (movie ? fromMovie(ctx, movie) : null), [movie, ctx])
  useEffect(() => {
    if (item) submitDiscoverBackdrop(`discover_movie_${item.id}`, item.backdropUrl)
  }, [item])

  const submit = useCallback(
    (c: MovieRequestChoice) => {
      actions.closeDialog()
      const data = actions.data
      void actions.run(() =>
        seerrApi.createRequest({
          mediaType: 'movie',
          mediaId: id,
          is4k: c.is4k,
          serverId: data ? requestServerId(c.profileId, c.rootFolder, c.is4k, data.serverId, data.server4kId) : null,
          profileId: c.profileId,
          rootFolder: c.rootFolder,
          tags: [],
        }),
      )
    },
    [actions, id],
  )

  if (movieQ.isPending) return <LoadingPage delayMs={300} label={t('loading')} />
  if (movieQ.isError || !movie || !item) {
    return <ErrorMessage title={t('web_seerr_error_occurred')} detail={movieQ.error?.message} />
  }

  const people = [...(movie.credits?.cast ?? []), ...(movie.credits?.crew ?? [])].map((c) => fromCredit(ctx, c))
  const runtime = movie.runtime ? formatDuration(plainT(t), Math.round(movie.runtime) * 60_000) : null
  const cert = movieCertification(movie, localeCountry(i18n.language))
  const jfId = jellyfinIdOf(movie.mediaInfo)
  const title = `${movie.title ?? ''} (${movie.releaseDate ?? ''})`

  return (
    <div className={styles.page}>
      <section data-focus-scroll-anchor>
        <DiscoverDetailsHeader
          title={movie.title ?? null}
          logoSrc={createImageUrl(ctx, 'Logo', null, movie.mediaInfo)}
          parts={[movie.releaseDate ?? null, runtime, cert]}
          rating={rating}
          genres={(movie.genres ?? []).map((g) => g.name).filter((n): n is string => !!n)}
          tagline={movie.tagline}
          overview={movie.overview ?? null}
          directedBy={directorNames(movie)}
        />
        <DiscoverButtons
          availability={availabilityFrom(movie.mediaInfo?.status)}
          canRequest={canRequestMovies(seerr.user)}
          canCancel={canUserCancelRequest(seerr.user, movie.mediaInfo?.requests)}
          trailers={trailersOf(movie.relatedVideos)}
          onRequest={actions.openDialog}
          goToHref={jfId ? jellyfinHref('movie', jfId) : null}
          onGoToMissing={() => {
            const href = goToJellyfinHref(movie.mediaInfo, 'movie', plainT(t))
            if (href) void navigate(href)
          }}
          onCancel={() => actions.cancel(movie.mediaInfo?.requests)}
        />
      </section>
      <DiscoverPeopleRow people={people} />
      <DiscoverRow title={t('more_like_this')} query={similar} hrefOf={(i) => discoveredItemHref(i)} hideWhenEmpty />
      <DiscoverRow title={t('recommended')} query={recommended} hrefOf={(i) => discoveredItemHref(i)} hideWhenEmpty />
      <RequestMovieDialog
        open={actions.dialogOpen}
        data={actions.data}
        title={title}
        requestEnabled={seerr.flags.requestMovieEnabled}
        request4kEnabled={seerr.flags.request4kMovieEnabled}
        onSubmit={submit}
        onClose={actions.closeDialog}
      />
    </div>
  )
}
