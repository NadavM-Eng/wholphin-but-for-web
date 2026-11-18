import { useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'

/**
 * Click handler for the kit's `href` cards and buttons: a plain click (or Enter) navigates inside the app
 * through the router; middle / modified clicks keep the browser's own link behavior (new tab etc.).
 */
export function useSpaLink(): (href: string) => (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void {
  const navigate = useNavigate()
  return useCallback(
    (href: string) => (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
      if (e.defaultPrevented) return
      if ('button' in e && e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      void navigate(href)
    },
    [navigate],
  )
}
