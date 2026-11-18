import { clearBackdrop, submitBackdropUrl } from '../../app/backdrop'

/**
 * Backdrop for Seerr pages (`backdropService.submit("discover_<id>", url)`): forwarded to the shell's
 * backdrop service, which draws it like any other backdrop (500 ms settle, colour extraction, crossfade).
 */
export function submitDiscoverBackdrop(key: string | null, url: string | null | undefined) {
  if (key == null || !url) clearBackdrop()
  else submitBackdropUrl(key, url)
}

export function clearDiscoverBackdrop() {
  clearBackdrop()
}
