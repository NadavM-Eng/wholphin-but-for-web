import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  allEditableSelected,
  initialSelectedSeasons,
  lockedOnSeasonNumbers,
  toggleSeason,
  toggleSelectAll,
  type RequestSeason,
  type SeerrRequestData,
} from '../../api/seerr'
import { formatSeasonNumber } from '../../lib/format'
import { Button, Dialog, ListItem, LoadingPage, Switch } from '../../ui'
import { ClickSwitch } from './ClickSwitch'
import styles from './RequestDialog.module.css'
import { RequestOptions } from './RequestOptions'
import { SeasonBadge } from './SeasonBadge'
import { plainT } from './seerrText'

export interface TvRequestChoice {
  seasons: number[]
  is4k: boolean
  profileId: number | null
  rootFolder: string | null
}

export type RequestSeasonsDialogProps = {
  open: boolean
  /** null while the profiles / folders load */
  data: SeerrRequestData | null
  title: string
  seasons: RequestSeason[]
  seasons4k: RequestSeason[]
  requestEnabled: boolean
  request4kEnabled: boolean
  onSubmit: (c: TvRequestChoice) => void
  onClose: () => void
}

/**
 * `RequestSeasonsDialog` (RequestSeasons.kt): series name; [Request in 4K] + Submit; quality profile and
 * root folder for advanced users; "Seasons" with "Select all" (editable seasons only) and one row per
 * season (badge, "N episodes", switch). Already requested / available seasons show checked and disabled
 * and are not sent; Submit sends only the selected seasons and is disabled when none are selected.
 */
export function RequestSeasonsDialog(props: RequestSeasonsDialogProps) {
  const { t } = useTranslation()
  if (!props.open) return null
  if (props.data == null) {
    return (
      <Dialog open onClose={props.onClose} variant="basic" label={props.title}>
        <LoadingPage label={t('loading')} className={styles.loading} />
      </Dialog>
    )
  }
  return <SeasonsForm {...props} data={props.data} />
}

function SeasonsForm({
  data,
  title,
  seasons: normal,
  seasons4k,
  requestEnabled,
  request4kEnabled,
  onSubmit,
  onClose,
}: RequestSeasonsDialogProps & { data: SeerrRequestData }) {
  const { t } = useTranslation()
  const [is4k, setIs4k] = useState(!requestEnabled)
  const seasons = is4k ? seasons4k : normal
  const locked = useMemo(() => new Set(lockedOnSeasonNumbers(seasons)), [seasons])
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialSelectedSeasons(seasons)))
  const profiles = is4k ? data.profiles4k : data.profiles
  const folders = is4k ? data.rootFolders4k : data.rootFolders
  const [choice, setChoice] = useState(() => defaults(data, !requestEnabled))

  const switch4k = (v: boolean) => {
    setIs4k(v)
    setSelected(new Set(initialSelectedSeasons(v ? seasons4k : normal)))
    setChoice(defaults(data, v))
  }
  const submit = () =>
    onSubmit({
      seasons: [...selected],
      is4k,
      profileId: choice.profile?.id ?? null,
      rootFolder: choice.folder?.path ?? null,
    })
  const submitButton = (
    <Button onClick={submit} disabled={selected.size === 0}>
      {t('submit')}
    </Button>
  )
  const allOn = allEditableSelected(seasons, selected)

  return (
    <Dialog open onClose={onClose} variant="basic" label={title}>
      <div className={styles.body}>
        <h2 className={styles.title} dir="auto">
          {title}
        </h2>
        <div className={styles.topRow}>
          {requestEnabled && request4kEnabled ? (
            <ClickSwitch label={t('request_4k')} checked={is4k} onChange={switch4k} />
          ) : (
            <span />
          )}
          {submitButton}
        </div>
        <RequestOptions
          profiles={profiles}
          folders={folders}
          profile={choice.profile}
          folder={choice.folder}
          onProfile={(p) => setChoice((c) => ({ ...c, profile: p }))}
          onFolder={(f) => setChoice((c) => ({ ...c, folder: f }))}
        />
        <hr className={styles.divider} />
        <h3 className={styles.sectionTitle}>{t('tv_seasons')}</h3>
        <ClickSwitch label={t('select_all')} checked={allOn} onChange={() => setSelected((s) => toggleSelectAll(seasons, s))} />
        <div className={styles.seasonList} role="group" aria-label={t('tv_seasons')}>
          {seasons.map((s) => {
            const checked = selected.has(s.seasonNumber) || locked.has(s.seasonNumber)
            const name = s.season.name || formatSeasonNumber(plainT(t), s.seasonNumber)
            return (
              <ListItem
                key={s.seasonNumber}
                disabled={!s.editable}
                headline={<span dir="auto">{name}</span>}
                supporting={s.season.episodeCount != null ? t('episodes_count', { count: s.season.episodeCount }) : undefined}
                leading={<SeasonBadge availability={s.availability} />}
                trailing={<Switch checked={checked} disabled={!s.editable} presentational />}
                onClick={() => setSelected((sel) => toggleSeason(s.seasonNumber, sel, locked))}
              />
            )
          })}
        </div>
        {seasons.length > 3 && <div className={styles.centered}>{submitButton}</div>}
      </div>
    </Dialog>
  )
}

function defaults(data: SeerrRequestData, is4k: boolean) {
  const profiles = is4k ? data.profiles4k : data.profiles
  const folders = is4k ? data.rootFolders4k : data.rootFolders
  return {
    profile: profiles.find((p) => p.isDefault) ?? profiles[0] ?? null,
    folder: folders.find((f) => f.isDefault) ?? folders[0] ?? null,
  }
}
