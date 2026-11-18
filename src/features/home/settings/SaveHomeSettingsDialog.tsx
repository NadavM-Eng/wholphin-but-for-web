import type { Translate } from '../../../lib/format'
import { DialogPopup, FaIcon, MaterialIcon } from '../../../ui'

type Props = {
  open: boolean
  t: Translate
  onSaveLocal: () => void
  onSaveServer: () => void
  onDiscard: () => void
  onClose: () => void
}

/** `SaveHomeSettingsDialog`: DialogPopup (elevation 3dp) "Save" with local / server / discard (red trash). */
export function SaveHomeSettingsDialog({ open, t, onSaveLocal, onSaveServer, onDiscard, onClose }: Props) {
  return (
    <DialogPopup
      open={open}
      title={t('save')}
      elevation={3}
      onClose={onClose}
      dismissOnClick={false}
      items={[
        { key: 'local', headline: t('save_to_local'), leading: <FaIcon name="cloud_arrow_down" />, onSelect: onSaveLocal },
        { key: 'server', headline: t('save_to_server'), leading: <FaIcon name="cloud_arrow_up" />, onSelect: onSaveServer },
        {
          key: 'discard',
          headline: t('web_discard'),
          leading: <MaterialIcon name="delete" />,
          leadingColor: 'var(--fx-delete-red)',
          onSelect: onDiscard,
        },
      ]}
    />
  )
}
