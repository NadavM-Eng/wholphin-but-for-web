import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  EMPTY_REQUEST_DATA,
  getProfilesAndFolders,
  requestToCancel,
  seerrApi,
  SeerrError,
  useInvalidateSeerr,
  useSeerrSession,
  type MediaRequest,
  type SeerrRequestData,
} from '../../api/seerr'
import { toast } from '../../app/toast'
import { errorText } from './errorText'

/**
 * Shared request plumbing of the movie and TV view models: load profiles / folders when the dialog opens
 * (advanced users only; failure toasts and continues without them), submit, cancel, then refetch.
 */
export function useRequestActions(type: 'movie' | 'tv') {
  const { t, i18n } = useTranslation()
  const { user } = useSeerrSession()
  const invalidate = useInvalidateSeerr()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [data, setData] = useState<SeerrRequestData | null>(null)
  const [busy, setBusy] = useState(false)
  // Synchronous guard: a double click must not send a second request / DELETE while the first is in flight.
  const busyRef = useRef(false)

  const openDialog = useCallback(() => {
    setDialogOpen(true)
    // Upstream never resets the loaded data, so a reopened dialog shows the previous lists until the new fetch lands.
    getProfilesAndFolders(type, user, i18n.language)
      .then(setData)
      .catch((e: unknown) => {
        toast(t('web_seerr_profiles_error', { p1: errorText(e) }), {
          long: true,
        })
        setData(EMPTY_REQUEST_DATA)
      })
  }, [type, user, i18n.language, t])

  const closeDialog = useCallback(() => setDialogOpen(false), [])

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        await fn()
      } catch (e) {
        // Upstream toasts only "An error occurred"; Seerr's own reason (e.g. a reached request limit) is appended.
        const reason =
          e instanceof SeerrError && e.status > 0 && e.message && !/^HTTP \d+$/.test(e.message) ? `: ${e.message}` : ''
        toast(`${t('web_seerr_error_occurred')}${reason}`, { long: !!reason })
      } finally {
        busyRef.current = false
        setBusy(false)
        await invalidate()
      }
    },
    [invalidate, t],
  )

  const cancel = useCallback(
    (requests: MediaRequest[] | null | undefined) => {
      const target = requestToCancel(user, requests)
      if (!target) return
      void run(() => seerrApi.deleteRequest(target.id))
    },
    [user, run],
  )

  return { dialogOpen, data, openDialog, closeDialog, run, cancel, busy }
}
