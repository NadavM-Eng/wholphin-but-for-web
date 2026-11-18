import { useEffect, useState } from 'react'

/** Wall clock that ticks every minute (upstream `LocalClock`), for "Ends at". */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer = 0
    const schedule = () => {
      const ms = 60_000 - (Date.now() % 60_000) + 50
      timer = window.setTimeout(() => {
        setNow(Date.now())
        schedule()
      }, ms)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])
  return now
}
