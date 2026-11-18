import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../api/session'
import { linkSeerr, SeerrLoginFailure, useSeerrSession, type SeerrAuthMethod } from '../../api/seerr'
import { toast } from '../../app/toast'
import { Button, CircularProgress, Dialog, DialogPopup, TextField } from '../../ui'
import styles from './SeerrLinkDialog.module.css'

export type SeerrLinkDialogProps = {
  open: boolean
  onClose: () => void
  /** Skip the chooser (re-login with the method used before). */
  method?: SeerrAuthMethod | null
}

/**
 * Upstream `AddSeerServerDialog` (W/ui/setup/seerr): choose "API Key" / "Jellyfin user" / "Local user",
 * then the matching form. There is no URL field on the web: the deployment's proxy decides the server.
 * Submit is enabled when the required fields are filled and no error is shown; editing clears the error;
 * Enter on the last field submits; Back (Esc) returns to the chooser; success toasts "Seerr server added".
 */
export function SeerrLinkDialog(props: SeerrLinkDialogProps) {
  // A fresh flow (chooser or the given method) every time it opens.
  return props.open ? <LinkFlow {...props} /> : null
}

function LinkFlow({ onClose, method: initialMethod }: SeerrLinkDialogProps) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<SeerrAuthMethod | null>(initialMethod ?? null)
  if (method == null) {
    return (
      <DialogPopup
        open
        title={t('seerr_login')}
        onClose={onClose}
        dismissOnClick={false}
        items={[
          {
            key: 'apiKey',
            headline: t('api_key'),
            onSelect: () => setMethod('apiKey'),
          },
          {
            key: 'jellyfin',
            headline: t('seerr_jellyfin_user'),
            onSelect: () => setMethod('jellyfin'),
          },
          {
            key: 'local',
            headline: t('seerr_local_user'),
            onSelect: () => setMethod('local'),
          },
        ]}
      />
    )
  }
  return (
    <SeerrLoginForm
      method={method}
      onBack={() => (initialMethod ? onClose() : setMethod(null))}
      onDone={() => {
        toast(t('seerr_server_added'))
        onClose()
      }}
    />
  )
}

function SeerrLoginForm({ method, onBack, onDone }: { method: SeerrAuthMethod; onBack: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const session = useSession()
  const { link } = useSeerrSession()
  const [username, setUsername] = useState(() =>
    method === 'apiKey' ? '' : ((link?.method === method ? link.username : null) ?? session?.user.name ?? ''),
  )
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const firstEmpty = useRef<HTMLInputElement | null>(null)
  const passwordRef = useRef<HTMLInputElement | null>(null)

  const canSubmit = !error && !loading && (method === 'apiKey' ? secret.trim().length > 0 : username.trim().length > 0)

  const submit = async () => {
    if (!canSubmit) return
    setLoading(true)
    try {
      await linkSeerr(method, username.trim(), secret)
      onDone()
    } catch (e) {
      const kind = e instanceof SeerrLoginFailure ? e.kind : 'other'
      const msg =
        kind === 'invalidCredentials'
          ? t('web_seerr_invalid_credentials')
          : kind === 'couldNotConnect'
            ? t('web_seerr_could_not_connect')
            : e instanceof Error
              ? e.message
              : String(e)
      toast(msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setError(null)
  }

  const title = method === 'apiKey' ? t('api_key') : t('username_or_password')
  return (
    <Dialog open onClose={onBack} variant="basic" label={title} initialFocus={() => firstEmpty.current ?? passwordRef.current}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>
          {method === 'apiKey' ? t('api_key') : t(method === 'jellyfin' ? 'seerr_jellyfin_user' : 'seerr_local_user')}
        </p>
        {method === 'apiKey' ? (
          <label className={styles.field}>
            <span className={styles.label}>{t('api_key')}</span>
            <TextField
              ref={(el) => {
                firstEmpty.current = el as HTMLInputElement | null
              }}
              value={secret}
              onChange={edit(setSecret)}
              onSubmit={() => void submit()}
              label={t('api_key')}
              type="password"
              autoComplete="off"
              enterKeyHint="go"
            />
          </label>
        ) : (
          <>
            <label className={styles.field}>
              <span className={styles.label}>{t('username')}</span>
              <TextField
                ref={(el) => {
                  firstEmpty.current = username ? null : (el as HTMLInputElement | null)
                }}
                value={username}
                onChange={edit(setUsername)}
                label={t('username')}
                autoComplete="username"
                name="username"
                enterKeyHint="next"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('password')}</span>
              <TextField
                ref={(el) => {
                  passwordRef.current = el as HTMLInputElement | null
                }}
                value={secret}
                onChange={edit(setSecret)}
                onSubmit={() => void submit()}
                label={t('password')}
                type="password"
                autoComplete="current-password"
                name="password"
                enterKeyHint="go"
              />
            </label>
          </>
        )}
        {method === 'apiKey' && <p className={styles.note}>{t('web_seerr_api_key_note')}</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="submit" disabled={!canSubmit}>
            {loading ? <CircularProgress size={24} label={t('loading')} /> : t('submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
