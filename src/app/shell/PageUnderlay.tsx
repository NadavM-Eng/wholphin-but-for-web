import { useLayoutEffect, useRef } from 'react'
import { mountPageSnapshot, pageOwner } from './pageSnapshot'
import styles from './PageUnderlay.module.css'

/**
 * The page Settings was opened from, as a lifeless copy behind the panel (pageSnapshot.ts). Empty without a copy.
 * Nothing is drawn over the copy: the page keeps its brightness (owner request; a light tint lay over it at first).
 */
export function PageUnderlay() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    return mountPageSnapshot(host, pageOwner())
  }, [])
  return <div ref={ref} className={styles.underlay} inert aria-hidden="true" data-page-underlay />
}
