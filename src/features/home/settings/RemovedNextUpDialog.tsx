import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { getItemImageUrl, imagePx } from '../../../api/images'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { formatDate, type Translate } from '../../../lib/format'
import { normalizeId } from '../../../lib/ids'
import { Button, Dialog, ErrorMessage, ListItem, LoadingPage, MaterialIcon } from '../../../ui'
import { allowRemovedNextUp, getRemovedNextUp } from '../../common/displayPreferences'
import { homeRowsKey } from '../data/useHomeData'
import styles from './HomeSettings.module.css'

type Props = { open: boolean; t: Translate; locale: string; onClose: () => void }

/**
 * `RemovedNextUpContent` in a BasicDialog: the series removed from Next Up (80dp poster, title, removal
 * date), each with a delete button that allows it back. Ids the server no longer returns are left out.
 */
export function RemovedNextUpDialog({ open, t, locale, onClose }: Props) {
  const api = useApi()
  const qc = useQueryClient()
  const session = useSession()
  const userId = session?.user.id ?? ''
  const [pending, setPending] = useState(false)
  const key = qk('home', 'removedNextUp')
  const query = useQuery({
    queryKey: key,
    enabled: open && !!session,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const removed = await getRemovedNextUp(api, userId)
      const ids = Object.keys(removed)
      const out: { id: string; name: string; image: string | null; when: string }[] = []
      for (let i = 0; i < ids.length; i += 50) {
        const res = await getLibraryApi(api).getItems({ userId, ids: ids.slice(i, i + 50) }, { signal })
        for (const item of res.data.Items ?? []) {
          const id = normalizeId(item.Id)
          if (!id) continue
          out.push({
            id,
            name: item.Name ?? id,
            image: getItemImageUrl(api.basePath, item, 'Primary', { fillHeight: imagePx(80) }),
            when: removed[id] ?? '',
          })
        }
      }
      return out
    },
  })

  // upstream: LaunchedEffect focuses the list once it has loaded (the dialog opened on the loading state,
  // so its own initial focus landed on the panel). Also when the deleted row took focus with it: the next
  // row, or the panel once the list is empty, so focus never falls out of the dialog.
  const rootRef = useRef<HTMLDivElement>(null)
  const loadedCount = query.data?.length
  useEffect(() => {
    const root = rootRef.current
    const panel = root?.closest<HTMLElement>('[role="dialog"]')
    if (!root || !panel || loadedCount == null) return
    if (document.activeElement !== panel && document.activeElement !== document.body) return
    const first = root.querySelector<HTMLElement>('[data-focusable]')
    ;(first ?? panel).focus({ preventScroll: true })
  }, [loadedCount])

  const allow = async (id: string) => {
    setPending(true)
    try {
      await allowRemovedNextUp(api, userId, id)
      qc.setQueryData<typeof query.data>(key, (list) => list?.filter((x) => x.id !== id))
      // web: Next Up rows show the series again without waiting for the next Home refresh
      void qc.invalidateQueries({ queryKey: homeRowsKey() })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} variant="basic" label={t('web_removed_from_next_up')}>
      <div ref={rootRef} className={styles.removed}>
        <h2 className={styles.removedTitle}>{t('web_removed_from_next_up')}</h2>
        {query.isPending ? (
          <LoadingPage label={t('loading')} />
        ) : query.isError ? (
          <ErrorMessage title={t('compose_error_message_title')} detail={query.error instanceof Error ? query.error.message : String(query.error)} />
        ) : query.data.length === 0 ? (
          <p>{t('no_results')}</p>
        ) : (
          <div className={styles.removedList}>
            {query.data.map((item) => (
              <div key={item.id} className={styles.removedItem}>
                {/* upstream ListItem(onClick = {}): focusable, no action, focusedScale 1 */}
                <ListItem
                  noScale
                  leading={item.image ? <img className={styles.removedPoster} src={item.image} alt={item.name} /> : undefined}
                  headline={item.name}
                  supporting={formatDate(item.when, locale) ?? item.when}
                />
                <Button label={t('delete')} disabled={pending} onClick={() => void allow(item.id)}>
                  <MaterialIcon name="delete" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}
