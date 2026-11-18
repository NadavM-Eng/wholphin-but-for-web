import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasAdvancedData, type SeerrRequestData } from '../../api/seerr'
import { Button, Dialog, DialogPopup, LoadingPage } from '../../ui'
import { ClickSwitch } from './ClickSwitch'
import styles from './RequestDialog.module.css'
import { RequestOptions } from './RequestOptions'

export interface MovieRequestChoice {
  is4k: boolean
  profileId: number | null
  rootFolder: string | null
}

export type RequestMovieDialogProps = {
  open: boolean
  /** null while the profiles / folders load */
  data: SeerrRequestData | null
  title: string
  requestEnabled: boolean
  request4kEnabled: boolean
  onSubmit: (c: MovieRequestChoice) => void
  onClose: () => void
}

/**
 * `RequestMovieDialog` (RequestMovie.kt). Without advanced data: a "Request" / "Request in 4K" choice when
 * both are allowed, else an immediate submit (4K iff only 4K is allowed). With advanced data (users with
 * REQUEST_ADVANCED): the 4K switch (when both are allowed), Submit, quality profile and root folder.
 */
export function RequestMovieDialog({
  open,
  data,
  title,
  requestEnabled,
  request4kEnabled,
  onSubmit,
  onClose,
}: RequestMovieDialogProps) {
  const { t } = useTranslation()
  const autoSubmitted = useRef(false)
  const simple = data != null && !hasAdvancedData(data)
  const bothAllowed = requestEnabled && request4kEnabled

  useEffect(() => {
    if (!open) {
      autoSubmitted.current = false
      return
    }
    if (simple && !bothAllowed && !autoSubmitted.current) {
      autoSubmitted.current = true
      onSubmit({ is4k: request4kEnabled, profileId: null, rootFolder: null })
    }
  }, [open, simple, bothAllowed, request4kEnabled, onSubmit])

  if (!open) return null
  if (data == null) {
    return (
      <Dialog open onClose={onClose} variant="basic" label={title}>
        <LoadingPage label={t('loading')} className={styles.loading} />
      </Dialog>
    )
  }
  if (simple) {
    if (!bothAllowed) return null
    return (
      <DialogPopup
        open
        title={title}
        onClose={onClose}
        dismissOnClick={false}
        items={[
          {
            key: 'hd',
            headline: t('request'),
            onSelect: () => onSubmit({ is4k: false, profileId: null, rootFolder: null }),
          },
          {
            key: '4k',
            headline: t('request_4k'),
            onSelect: () => onSubmit({ is4k: true, profileId: null, rootFolder: null }),
          },
        ]}
      />
    )
  }
  return (
    <AdvancedMovieRequest
      data={data}
      title={title}
      bothAllowed={bothAllowed}
      requestEnabled={requestEnabled}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  )
}

function AdvancedMovieRequest({
  data,
  title,
  bothAllowed,
  requestEnabled,
  onSubmit,
  onClose,
}: {
  data: SeerrRequestData
  title: string
  bothAllowed: boolean
  requestEnabled: boolean
  onSubmit: (c: MovieRequestChoice) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [is4k, setIs4k] = useState(!requestEnabled)
  const profiles = is4k ? data.profiles4k : data.profiles
  const folders = is4k ? data.rootFolders4k : data.rootFolders
  const [choice, setChoice] = useState(() => defaults(data, !requestEnabled))
  const switch4k = (v: boolean) => {
    setIs4k(v)
    setChoice(defaults(data, v))
  }
  return (
    <Dialog open onClose={onClose} variant="basic" label={title}>
      <div className={styles.body}>
        <h2 className={styles.title} dir="auto">
          {title}
        </h2>
        <div className={styles.topRow}>
          {bothAllowed ? <ClickSwitch label={t('request_4k')} checked={is4k} onChange={switch4k} /> : <span />}
          <Button
            onClick={() =>
              onSubmit({
                is4k,
                profileId: choice.profile?.id ?? null,
                rootFolder: choice.folder?.path ?? null,
              })
            }
          >
            {t('submit')}
          </Button>
        </div>
        <RequestOptions
          profiles={profiles}
          folders={folders}
          profile={choice.profile}
          folder={choice.folder}
          onProfile={(p) => setChoice((c) => ({ ...c, profile: p }))}
          onFolder={(f) => setChoice((c) => ({ ...c, folder: f }))}
        />
      </div>
    </Dialog>
  )
}

/** The default-flagged profile / folder, else the first (for the 4K or normal server). */
function defaults(data: SeerrRequestData, is4k: boolean) {
  const profiles = is4k ? data.profiles4k : data.profiles
  const folders = is4k ? data.rootFolders4k : data.rootFolders
  return {
    profile: profiles.find((p) => p.isDefault) ?? profiles[0] ?? null,
    folder: folders.find((f) => f.isDefault) ?? folders[0] ?? null,
  }
}
