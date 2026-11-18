import type { PublicSystemInfo, UserDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { jellyfin, signInWithToken } from '../../api/session'
import { LoadingScreen } from '../LoadingScreen'
import { nav } from '../nav'

interface DevSession {
  serverUrl: string
  serverInfo: PublicSystemInfo
  user: UserDto
  accessToken: string
}

/**
 * DEV ONLY (registered in routes.tsx under import.meta.env.DEV): signs in through the Vite middleware
 * GET /__dev/session (tools/vite-dev-session.ts), which reads the test credentials server-side.
 * /dev/login?next=/item/123&server=test
 */
export default function DevLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const next = params.get('next')
    const q = new URLSearchParams({
      deviceId: jellyfin.deviceInfo.id,
      deviceName: jellyfin.deviceInfo.name,
    })
    if (params.get('server') === 'test') q.set('server', 'test')
    void (async () => {
      try {
        const res = await fetch(`/__dev/session?${q}`, { cache: 'no-store' })
        const body = (await res.json()) as Partial<DevSession> & { error?: string }
        if (!res.ok || !body.accessToken || !body.serverUrl || !body.serverInfo || !body.user) {
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        await signInWithToken(body.serverUrl, body.serverInfo, body.user, body.accessToken)
        void navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : nav.home(), { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [params, navigate])

  if (error) {
    return (
      <p className="t-bodyLarge" role="alert" style={{ padding: '2rem', color: 'var(--c-error)' }}>
        {t('web_dev_login_failed', { p1: error })}
      </p>
    )
  }
  return <LoadingScreen />
}
