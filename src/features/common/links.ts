import type { KeyboardEvent, MouseEvent } from 'react'
import { useCallback } from 'react'
import { useNavigate } from 'react-router'

/**
 * Client-side navigation for `<a href>` cards: a plain click (or Enter) navigates in the app; middle
 * click and Ctrl/Cmd/Shift/Alt-click keep the browser's open-in-new-tab behaviour.
 */
export function useLinkClick(): (href: string) => (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void {
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
