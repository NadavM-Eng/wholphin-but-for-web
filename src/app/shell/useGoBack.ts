import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { nav } from '../nav'
import { historyIndex } from './historyMirror'

/**
 * Back (NavigationManager.goBack): pop one history entry. On the first entry of the tab (a deep link)
 * there is nothing of ours to pop and going back would leave the app, so it goes to Home instead,
 * like upstream deep links that run on top of a (re)loaded Home.
 */
export function useGoBack(): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    if (historyIndex() > 0) void navigate(-1)
    else void navigate(nav.home(), { replace: true })
  }, [navigate])
}
