// Selected tab of a tabbed page (TabViewModel, W/ui/components/TabbedPage.kt + RememberedTabService). The
// tab lives in the URL (?tab=) so Back and links restore it; the "remember selected tab" preference
// also stores it per library and user, and a fresh visit opens on the remembered tab.
import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useSession } from '../../../api/session'
import { clearBackdrop } from '../../../app/backdrop'
import { usePrefs } from '../../../stores/preferences'
import { loadRememberedTab, saveRememberedTab } from '../model/displayInfo'

/**
 * `keys` are the tab keys in order; the remembered value is the tab index (upstream stores an index for
 * libraries and the BaseItemKind ordinal for favorites: pass `toStored` / `fromStored` for that).
 */
export function useTabState(
  itemId: string,
  keys: readonly string[],
  opts: { toStored?: (key: string) => number; fromStored?: (n: number) => string | null; fallback?: string | null } = {},
): [string | null, (key: string) => void] {
  const [params, setParams] = useSearchParams()
  const session = useSession()
  const remember = usePrefs('rememberSelectedTab')
  const serverId = session?.server.id ?? ''
  const userId = session?.user.id ?? ''
  const fromUrl = params.get('tab')
  const toStored = opts.toStored ?? ((k: string) => keys.indexOf(k))
  const fromStored = opts.fromStored ?? ((n: number) => keys[Math.min(Math.max(0, n), keys.length - 1)] ?? null)

  let selected: string | null = null
  if (fromUrl && keys.includes(fromUrl)) selected = fromUrl
  else if (fromUrl && /^\d+$/.test(fromUrl) && keys[Number(fromUrl)]) selected = keys[Number(fromUrl)]
  else if (remember) {
    const stored = loadRememberedTab(serverId, userId, itemId)
    const k = stored != null ? fromStored(stored) : null
    if (k && keys.includes(k)) selected = k
  }
  selected ??= opts.fallback !== undefined ? opts.fallback : (keys[0] ?? null)

  // Write the resolved tab into the URL (replace), so Back to this entry reopens the same tab.
  useEffect(() => {
    if (selected && fromUrl !== selected) {
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          next.set('tab', selected)
          return next
        },
        { replace: true },
      )
    }
  }, [selected, fromUrl, setParams])

  const select = useCallback(
    (key: string) => {
      clearBackdrop()
      if (remember) saveRememberedTab(serverId, userId, itemId, toStored(key))
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          next.set('tab', key)
          return next
        },
        { replace: true },
      )
    },
    // toStored is rebuilt every render from stable inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remember, serverId, userId, itemId, setParams],
  )
  return [selected, select]
}
