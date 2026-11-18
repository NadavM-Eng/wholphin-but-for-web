import { useEffect } from 'react'
import { clearDiscoverBackdrop } from './backdropStore'

/**
 * Seerr pages draw their backdrop through the shell's backdrop service (submitDiscoverBackdrop); this only
 * clears it when the page unmounts, so a Seerr image does not linger on the next page.
 */
export function DiscoverBackdrop() {
  useEffect(() => () => clearDiscoverBackdrop(), [])
  return null
}
