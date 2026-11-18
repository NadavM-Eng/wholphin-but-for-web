import type { RemoteSubtitleInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { plainT } from './text'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { toast } from '../../../app/toast'
import { abbreviateNumber } from '../../../lib/format'
import { getPrefs } from '../../../stores/preferences'
import { ErrorMessage, ListItem, MaterialIcon, TextField } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import { getPreferredLanguage } from '../engine/streamChoice'
import styles from './DownloadSubtitlesDialog.module.css'
import { PlayerSheet } from './PlayerSheet'
import { downloadAndFindSubtitle, searchRemoteSubtitles } from './subtitleSearch'

/** Default search language: preferred subtitle language, else the browser language (searchForSubtitles). */
function defaultLanguage(userConfig: unknown): string {
  const p = getPrefs()
  const pref = getPreferredLanguage(
    'Subtitle',
    { preferredAudioLanguage: p.preferredAudioLang, preferredSubtitleLanguage: p.preferredSubtitleLang, subtitleMode: p.subtitleMode },
    userConfig as Parameters<typeof getPreferredLanguage>[2],
  )
  return pref ?? (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en')
}

/**
 * `DownloadSubtitlesContent` in a BasicDialog (DownloadSubtitlesDialog.kt, PlaybackPage.kt:704-739): pauses
 * playback while open and resumes on close if it was playing; an editable language (Enter searches again), then
 * the results (overline "Hash matches", "provider - Forced - SDH - N downloads", rating with a gold star). Picking
 * one downloads it, waits for the server to add the stream and switches to it.
 */
export function DownloadSubtitlesDialog({ onClose }: { onClose: () => void }) {
  const { t: rawT, i18n } = useTranslation()
  const t = plainT(rawT)
  const api = useApi()
  const session = useSession()
  const engine = getPlaybackEngine()
  const itemId = usePlaybackStore((s) => s.item?.Id ?? '')
  const [language, setLanguage] = useState(() => defaultLanguage(session?.userDto.Configuration))
  const [submitted, setSubmitted] = useState(language)
  const wasPlaying = useRef(!engine.video.paused)

  useEffect(() => {
    engine.pause()
  }, [engine])

  const finish = () => {
    if (wasPlaying.current) engine.play()
    onClose()
  }

  const search = useQuery({
    queryKey: qk('remote-subtitles', itemId, submitted),
    queryFn: ({ signal }) => searchRemoteSubtitles(api, itemId, submitted, signal),
    enabled: !!itemId && !!submitted.trim(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const download = useMutation({
    mutationFn: async (sub: RemoteSubtitleInfo) => {
      const st = usePlaybackStore.getState()
      if (!sub.Id) throw new Error('Subtitle has no ID')
      if (!st.source || !session) throw new Error('Nothing is playing')
      return downloadAndFindSubtitle({ api, userId: session.user.id, itemId, source: st.source, subtitleId: sub.Id, audioIndex: st.audioIndex })
    },
    onSuccess: (r) => {
      if (r.kind === 'switched') void engine.reloadWithSubtitle(r.item, r.subtitleIndex, r.audioIndex)
      else if (r.kind === 'too-long') toast(t('subtitle_download_too_long'), { long: true })
      // upstream leaves the dialog stuck on "Downloading..." here; it is closed instead (spec 08 PB-4)
      else if (r.kind === 'source-gone') toast(t('web_playback_no_longer_playable'))
      finish()
    },
  })

  let body
  if (download.isPending) body = <div className={styles.status}>{t('downloading')}</div>
  else if (download.isError) body = <ErrorMessage title={t('error')} message={String(download.error instanceof Error ? download.error.message : download.error)} />
  else if (search.isError) body = <ErrorMessage title={t('error')} message={String(search.error instanceof Error ? search.error.message : search.error)} />
  else if (search.isPending && search.fetchStatus !== 'idle') body = <div className={styles.status}>{t('searching')}</div>
  else {
    const list = search.data ?? []
    body = (
      <>
        <div className={styles.title}>{t('search_and_download_subtitles')}</div>
        <div className={styles.langRow}>
          <span className={styles.langLabel}>{t('language')}</span>
          <TextField
            value={language}
            onChange={setLanguage}
            onSubmit={(v) => setSubmitted(v.trim())}
            label={t('language')}
            enterKeyHint="search"
          />
        </div>
        {list.length === 0 ? (
          <div className={styles.status}>{t('no_subtitles_found')}</div>
        ) : (
          <div className={styles.list} data-results>
            {list.map((s, i) => (
              <ListItem
                key={`${s.Id}-${i}`}
                overline={s.IsHashMatch ? t('hash_matches') : undefined}
                headline={s.Name ?? ''}
                supporting={[
                  s.ProviderName,
                  s.Forced ? t('forced_track') : null,
                  s.HearingImpaired ? t('subtitles_hearing_impaired') : null,
                  // plurals.downloads gets the abbreviated count ("10.5K downloads") as its argument
                  t('downloads', { count: s.DownloadCount ?? 0 }).replace(String(s.DownloadCount ?? 0), abbreviateNumber(s.DownloadCount ?? 0, i18n.language)),
                ]
                  .filter(Boolean)
                  .join(' - ')}
                trailing={
                  s.CommunityRating != null ? (
                    <span className={styles.rating}>
                      {s.CommunityRating}
                      <MaterialIcon name="star" size={18} color="var(--fx-golden-yellow)" />
                    </span>
                  ) : undefined
                }
                onClick={() => download.mutate(s)}
              />
            ))}
          </div>
        )}
      </>
    )
  }

  return (
    <PlayerSheet
      label={t('search_and_download_subtitles')}
      placement="center"
      surface={1}
      onClose={finish}
      className={styles.panel}
      initialFocus={search.data && search.data.length > 0 ? '[data-results] [data-focusable]' : undefined}
      key={search.data ? 'results' : 'pending'}
    >
      {body}
    </PlayerSheet>
  )
}
