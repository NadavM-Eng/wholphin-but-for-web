import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, TextButton, TextField } from '../../ui'
import styles from './Preference.module.css'

export type StringInputDialogProps = {
  title: string
  initialValue: string
  onSave: (value: string) => void
  onClose: () => void
}

/**
 * `StringInputDialog` (StringInputDialog.kt): BasicDialog at 3dp, 512dp wide, titleLarge title, a
 * single-line text box (no autocorrect, Enter saves) and Cancel / Save spaced around.
 * Mount it only while open so the text starts from `initialValue`.
 */
export function StringInputDialog({ title, initialValue, onSave, onClose }: StringInputDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)
  return (
    <Dialog open onClose={onClose} variant="basic" elevation={3} label={title}>
      <div className={styles.dialogColumn} style={{ width: 'min(32rem, 100%)' }}>
        <h2 className={styles.dialogTitle}>{title}</h2>
        <TextField
          value={value}
          onChange={setValue}
          onSubmit={(v) => onSave(v)}
          label={title}
          autoFocus
          autoComplete="off"
          enterKeyHint="done"
        />
        <div className={styles.dialogButtons}>
          <TextButton onClick={onClose}>{t('cancel')}</TextButton>
          <TextButton onClick={() => onSave(value)}>{t('save')}</TextButton>
        </div>
      </div>
    </Dialog>
  )
}
