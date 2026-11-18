import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  canRequestTv,
  canUserCancelRequest,
  computeRequestSeasons,
  createImageUrl,
  fromCredit,
  fromTv,
  jellyfinIdOf,
  pendingOwnRequest,
  requestServerId,
  seerrApi,
  seriesAvailability,
  useDiscoverRating,
  useRelated,
  useSeerrImageContext,
  useSeerrSession,
  useTvDetails,
} from '../../api/seerr'
import { formatDuration } from '../../lib/format'
import { ErrorMessage, LoadingPage } from '../../ui'
import { meanEpisodeRuntime, trailersOf } from './detailHelpers'
import { DiscoverButtons } from './DiscoverButtons'
import styles from './DiscoverDetails.module.css'
import { DiscoverDetailsHeader } from './DiscoverDetailsHeader'
import { DiscoverPeopleRow } from './DiscoverPeopleRow'
import { DiscoverRow } from './DiscoverRow'
import { submitDiscoverBackdrop } from './backdropStore'
import { discoveredItemHref, goToJellyfinHref, jellyfinHref } from './links'
import { RequestSeasonsDialog, type TvRequestChoice } from './RequestSeasonsDialog'
import { SeasonStatusList } from './SeasonStatusList'
import { useRequestActions } from './useRequestActions'
import { plainT } from './seerrText'

/**
 * Seerr TV page (`DiscoverSeriesDetails`): header (first air date, mean episode runtime, critic score,
 * genres, overview), buttons, season status, people, "More like this", "Recommended". "Request" and
 * "Pending" both open the season dialog, so pending seasons can be edited.
 */
export function DiscoverSeriesDetails({ id }: { id: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const seerr = useSeerrSession()
  const ctx = useSeerrImageContext()
  const tvQ = useTvDetails(id)
  const rating = useDiscoverRating('tv', id).data
  const similar = useRelated('tv', 'similar', id)
  const recommended = useRelated('tv', 'recommendations', id)
  const actions = useRequestActions('tv')
  const tv = tvQ.data
  const userId = seerr.user?.id ?? null

  const item = useMemo(() => (tv ? fromTv(ctx, tv) : null), [tv, ctx])
  useEffect(() => {
    if (item) submitDiscoverBackdrop(`discover_tv_${item.id}`, item.backdropUrl)
  }, [item])

  const seasons = useMemo(() => (tv ? computeRequestSeasons(tv, false, userId) : []), [tv, userId])
  // 4K seasons only when the server and the user allow 4K TV (`updateSeasonStatus`).
  const seasons4k = useMemo(
    () => (tv && seerr.flags.request4kTvEnabled ? computeRequestSeasons(tv, true, userId) : []),
    [tv, userId, seerr.flags.request4kTvEnabled],
  )

  const submit = useCallback(
    (c: TvRequestChoice) => {
      actions.closeDialog()
      const data = actions.data
      const serverId = data ? requestServerId(c.profileId, c.rootFolder, c.is4k, data.serverId, data.server4kId) : null
      const pending = pendingOwnRequest(tv, userId)
      void actions.run(() =>
        pending
          ? seerrApi.updateRequest(pending.id, {
              mediaType: 'tv',
              seasons: c.seasons,
              is4k: c.is4k,
              serverId,
              profileId: c.profileId,
              rootFolder: c.rootFolder,
            })
          : seerrApi.createRequest({
              mediaType: 'tv',
              mediaId: id,
              seasons: c.seasons,
              is4k: c.is4k,
              serverId,
              profileId: c.profileId,
              rootFolder: c.rootFolder,
              tags: [],
            }),
      )
    },
    [actions, id, tv, userId],
  )

  if (tvQ.isPending) return <LoadingPage delayMs={300} label={t('loading')} />
  if (tvQ.isError || !tv || !item) return <ErrorMessage title={t('web_seerr_error_occurred')} detail={tvQ.error?.message} />

  const people = [...(tv.credits?.cast ?? []), ...(tv.credits?.crew ?? [])].map((c) => fromCredit(ctx, c))
  const runtime = meanEpisodeRuntime(tv)
  const jfId = jellyfinIdOf(tv.mediaInfo)

  return (
    <div className={styles.page}>
      <section data-focus-scroll-anchor>
        <DiscoverDetailsHeader
          title={tv.name ?? null}
          logoSrc={createImageUrl(ctx, 'Logo', null, tv.mediaInfo)}
          parts={[tv.firstAirDate ?? null, runtime ? formatDuration(plainT(t), runtime * 60_000) : null]}
          rating={rating}
          genres={(tv.genres ?? []).map((g) => g.name).filter((n): n is string => !!n)}
          overview={tv.overview ?? null}
        />
        <DiscoverButtons
          availability={seriesAvailability(tv, userId)}
          canRequest={canRequestTv(seerr.user)}
          canCancel={canUserCancelRequest(seerr.user, tv.mediaInfo?.requests)}
          trailers={trailersOf(tv.relatedVideos)}
          onRequest={actions.openDialog}
          onPending={actions.openDialog}
          goToHref={jfId ? jellyfinHref('tv', jfId) : null}
          onGoToMissing={() => {
            const href = goToJellyfinHref(tv.mediaInfo, 'tv', plainT(t))
            if (href) void navigate(href)
          }}
          onCancel={() => actions.cancel(tv.mediaInfo?.requests)}
        />
      </section>
      <SeasonStatusList seasons={seasons} />
      <DiscoverPeopleRow people={people} />
      <DiscoverRow title={t('more_like_this')} query={similar} hrefOf={(i) => discoveredItemHref(i)} hideWhenEmpty />
      <DiscoverRow title={t('recommended')} query={recommended} hrefOf={(i) => discoveredItemHref(i)} hideWhenEmpty />
      <RequestSeasonsDialog
        open={actions.dialogOpen}
        data={actions.data}
        title={tv.name ?? ''}
        seasons={seasons}
        seasons4k={seasons4k}
        requestEnabled={seerr.flags.requestTvEnabled}
        request4kEnabled={seerr.flags.request4kTvEnabled}
        onSubmit={submit}
        onClose={actions.closeDialog}
      />
    </div>
  )
}
