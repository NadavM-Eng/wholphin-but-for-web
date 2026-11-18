import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  initiateQuickConnect,
  loginWithPassword,
  SessionError,
  waitForQuickConnect,
  type SavedServer,
} from '../../api/session'
import { nav } from '../../app/nav'
import { toast } from '../../app/toast'
import { CircularProgress, TextButton, TextField } from '../../ui'
import styles from './setup.module.css'
import { SetupDialog } from './SetupDialog'
import { errorDetail } from './setupHelpers'

export type LoginDialogProps = {
  server: SavedServer
  /** Prefilled username (re-login of a saved or public user). */
  initialUsername: string
  /** Start in Quick Connect mode (decided once when the dialog opens, as upstream). */
  quickConnect: boolean
  onClose: () => void
  /** Signed in: the session is current. */
  onSuccess: () => void
  /** Quick Connect answered 401: the next dialog opens on the password form (SwitchUserViewModel.kt:233-241). */
  onQuickConnectRejected?: () => void
}

type LoginError = { message: string; detail?: string | null; expired?: boolean }

/**
 * The add-user / login dialog of SwitchUserContent (SwitchUserContent.kt:199-379, SwitchUserViewModel.kt:
 * 167-245). Quick Connect mode shows the code and polls every 5 s; "Use username/password" switches to the
 * credential form. After more than two failed attempts "Trouble logging in?" offers the debug page.
 */
export function LoginDialog({
  server,
  initialUsername,
  quickConnect,
  onClose,
  onSuccess,
  onQuickConnectRejected,
}: LoginDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const serverName = server.name ?? server.url
  const [useQuickConnect, setUseQuickConnect] = useState(quickConnect)
  const [qcCode, setQcCode] = useState<string | null>(null)
  const [qcRun, setQcRun] = useState(0)
  const [username, setUsername] = useState(initialUsername)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<LoginError | null>(null)
  const [attempts, setAttempts] = useState(0)
  const usernameRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const passwordRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const qcButton = useRef<HTMLElement>(null)
  // Latest callbacks for the long-running Quick Connect task (a language change must not restart it).
  const successRef = useRef(onSuccess)
  const rejectedRef = useRef(onQuickConnectRejected)
  const tRef = useRef(t)
  const initialUsernameRef = useRef(initialUsername)
  useEffect(() => {
    successRef.current = onSuccess
    rejectedRef.current = onQuickConnectRejected
    tRef.current = t
  })
  // A password login keeps running after the dialog is dismissed, as upstream's view-model job does.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const fail = useCallback((e: LoginError) => {
    setError(e)
    setAttempts((a) => a + 1)
  }, [])

  // initiateQuickConnect: get a code, poll until authorized, then authenticate. Cancelled on close/switch.
  useEffect(() => {
    if (!useQuickConnect) return
    const abort = new AbortController()
    void (async () => {
      try {
        const req = await initiateQuickConnect(server)
        if (abort.signal.aborted) return
        setQcCode(req.code)
        await waitForQuickConnect(server, req.secret, abort.signal)
        successRef.current()
      } catch (err) {
        if (abort.signal.aborted || (err instanceof SessionError && err.kind === 'cancelled')) return
        const t = tRef.current
        setQcCode(null)
        const status = err instanceof SessionError ? err.status : null
        // Jellyfin forgets a request after a few minutes: polling then answers 404. Upstream polls forever
        // and only shows the raw error; the web says the code expired and offers a new one.
        if (status === 404) {
          fail({ message: t('web_quick_connect_expired'), expired: true })
        } else {
          if (status === 401) rejectedRef.current?.()
          fail({ message: t('web_quick_connect_error'), detail: errorDetail(t, err) })
        }
      }
    })()
    return () => abort.abort()
  }, [useQuickConnect, server, qcRun, fail])

  const switchToPassword = () => {
    setError(null)
    setUseQuickConnect(false)
  }

  // Password form focus: the username box when empty, else the password box.
  useEffect(() => {
    if (useQuickConnect) return
    const target = initialUsernameRef.current.trim() ? passwordRef.current : usernameRef.current
    target?.focus()
  }, [useQuickConnect])

  useEffect(() => {
    if (useQuickConnect && qcCode) qcButton.current?.focus({ preventScroll: true })
  }, [useQuickConnect, qcCode])

  const submit = async () => {
    if (busy || !username.trim()) return
    setBusy(true)
    setError(null)
    try {
      await loginWithPassword(server, username, password)
      successRef.current()
    } catch (err) {
      const invalid = err instanceof SessionError && err.kind === 'invalid-credentials'
      if (!mounted.current) {
        // Dismissed while signing in: SwitchUserContent.kt:107-118 toasts "Error: <msg>" when the dialog is closed.
        const msg = invalid ? t('web_error_invalid_credentials') : (errorDetail(t, err) ?? t('web_error_login'))
        toast(`${t('error')}: ${msg}`, { long: true })
        return
      }
      // Upstream counts only non-401 failures (SwitchUserViewModel.kt:184-191 skips setError for 401), so
      // repeated wrong passwords never reveal the debug button; every failed attempt counts here.
      if (invalid) {
        fail({ message: t('web_error_invalid_credentials') })
      } else {
        fail({ message: t('web_error_login'), detail: errorDetail(t, err) })
      }
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const errorBlock = error && (
    <div className={styles.errors} role="alert" data-testid="login-error">
      <span>{error.message}</span>
      {error.detail && <span>{error.detail}</span>}
    </div>
  )

  return (
    <SetupDialog
      open
      onClose={onClose}
      label={t('login')}
      initialFocus={() => (useQuickConnect ? qcButton.current : null)}
    >
      {useQuickConnect ? (
        <>
          {!qcCode && !error && (
            <div className={styles.waiting}>
              <CircularProgress size={20} />
              <p className={styles.dialogText}>{t('web_quick_connect_waiting')}</p>
            </div>
          )}
          {qcCode && (
            <>
              <p className={styles.dialogText}>{t('web_quick_connect_instructions', { p1: serverName })}</p>
              <p className={styles.code} data-testid="quick-connect-code">
                {qcCode}
              </p>
            </>
          )}
          {errorBlock}
          {error?.expired && (
            <TextButton
              onClick={() => {
                setError(null)
                setQcCode(null)
                setQcRun((n) => n + 1)
              }}
            >
              {t('web_quick_connect_new_code')}
            </TextButton>
          )}
          <TextButton ref={qcButton} onClick={switchToPassword}>
            {t('username_or_password')}
          </TextButton>
        </>
      ) : (
        <form
          className={`${styles.dialogColumn} ${styles.form}`}
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <p className={styles.dialogText}>{t('web_login_instructions', { p1: serverName })}</p>
          {errorBlock}
          <div className={styles.fieldRow}>
            <span className={styles.fieldRowLabel}>{t('username')}</span>
            <TextField
              ref={usernameRef}
              className={styles.rowField}
              label={t('username')}
              value={username}
              onChange={setUsername}
              onSubmit={() => passwordRef.current?.focus()}
              invalid={!!error}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
            />
          </div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldRowLabel}>{t('password')}</span>
            <TextField
              ref={passwordRef}
              className={styles.rowField}
              label={t('password')}
              type="password"
              value={password}
              onChange={(v) => {
                setPassword(v)
                // LaunchedEffect(password) { clearSwitchUserState() }
                setError(null)
              }}
              onSubmit={() => void submit()}
              invalid={!!error}
              name="password"
              autoComplete="current-password"
              enterKeyHint="go"
            />
          </div>
          <TextButton type="submit" disabled={!username.trim() || busy}>
            {busy ? <CircularProgress size={24} /> : t('login')}
          </TextButton>
        </form>
      )}
      {attempts > 2 && (
        <>
          <p className={styles.trouble}>{t('web_trouble_logging_in')}</p>
          <TextButton onClick={() => void navigate(nav.debug())}>{t('show_debug_info')}</TextButton>
        </>
      )}
    </SetupDialog>
  )
}
