import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { connectToServer, type SavedServer } from '../../api/session'
import { CircularProgress, TextButton, TextField } from '../../ui'
import styles from './setup.module.css'
import { SetupDialog } from './SetupDialog'
import { addServerErrorMessage } from './setupHelpers'

export type AddServerDialogProps = {
  open: boolean
  onClose: () => void
  /** The server answered and passed validation (UUID id, finished startup wizard). */
  onAdded: (server: SavedServer) => void
}

type AddState = { kind: 'pending' } | { kind: 'loading' } | { kind: 'error'; message: string }

/**
 * `AddServerDialog` (SwitchServerContent.kt:282-472), manual step only: browsers cannot send the UDP
 * broadcast that upstream's "Discovered Servers" step uses, so the dialog opens on "Enter Server IP or URL".
 * Submit stays disabled after an error until the text changes; Enter submits regardless (IME Go).
 * The field takes focus as the dialog's first focusable element; an `autoFocus` here would focus it before
 * the dialog notes its opener, and closing with the keyboard would then leave focus nowhere.
 */
export function AddServerDialog({ open, onClose, onAdded }: AddServerDialogProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [state, setState] = useState<AddState>({ kind: 'pending' })

  const close = () => {
    setUrl('')
    setState({ kind: 'pending' })
    onClose()
  }

  const submit = async () => {
    if (state.kind === 'loading') return
    setState({ kind: 'loading' })
    try {
      const { server } = await connectToServer(url)
      setState({ kind: 'pending' })
      setUrl('')
      onAdded(server)
    } catch (err) {
      setState({ kind: 'error', message: addServerErrorMessage(t, err) })
    }
  }

  return (
    <SetupDialog open={open} onClose={close} label={t('add_server')} elevation={10}>
      <p className={styles.dialogLabel}>{t('enter_server_url')}</p>
      <TextField
        className={styles.fullField}
        label={t('enter_server_url')}
        value={url}
        onChange={(v) => {
          setUrl(v)
          // LaunchedEffect(url) { clearAddServerState() }
          if (state.kind === 'error') setState({ kind: 'pending' })
        }}
        onSubmit={() => void submit()}
        type="url"
        inputMode="url"
        enterKeyHint="go"
        autoComplete="url"
        autoCapitalize="none"
        spellCheck={false}
        name="server-url"
      />
      {state.kind === 'error' && (
        <div className={styles.errors} role="alert" data-testid="add-server-error">
          <span>{state.message}</span>
        </div>
      )}
      <TextButton
        disabled={!url.trim() || state.kind !== 'pending'}
        onClick={() => void submit()}
        label={state.kind === 'loading' ? t('loading') : undefined}
      >
        {state.kind === 'loading' ? <CircularProgress size={32} /> : t('submit')}
      </TextButton>
    </SetupDialog>
  )
}
