import { useEffect, useState } from 'react'
import { cacheSummary, clearCacheStorage, getCacheUsage, type CacheUsage } from './cacheTools'
import { ClickPreference } from './ClickPreference'

/** ClearImageCache: summary from the storage estimate; click clears Cache Storage and refreshes the summary. */
export function ClearImageCachePreference({ id, title }: { id: string; title: string }) {
  const [usage, setUsage] = useState<CacheUsage>({ usage: null, quota: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    void getCacheUsage().then((u) => alive && setUsage(u))
    return () => {
      alive = false
    }
  }, [tick])
  return (
    <ClickPreference
      id={id}
      title={title}
      summary={cacheSummary(usage)}
      onClick={() => void clearCacheStorage().finally(() => setTick((n) => n + 1))}
    />
  )
}
