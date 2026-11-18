import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SeerrProfile, SeerrRootFolder } from '../../api/seerr'
import { DialogPopup, ListItem, SelectedDot } from '../../ui'

export type RequestOptionsProps = {
  profiles: SeerrProfile[]
  folders: SeerrRootFolder[]
  profile: SeerrProfile | null
  folder: SeerrRootFolder | null
  onProfile: (p: SeerrProfile) => void
  onFolder: (f: SeerrRootFolder) => void
}

/**
 * `ChooseProfile` / `ChooseFolder` (RequestMovie.kt): "Quality profile" and "Root folder" list items showing
 * the choice ("(Default)" suffix, free space trailing) that open a picker with the selection marked.
 */
export function RequestOptions({ profiles, folders, profile, folder, onProfile, onFolder }: RequestOptionsProps) {
  const { t } = useTranslation()
  const [picker, setPicker] = useState<'profile' | 'folder' | null>(null)
  const def = t('is_default')
  return (
    <>
      {profiles.length > 0 && profile && (
        <ListItem
          headline={t('quality_profile')}
          supporting={profile.isDefault ? `${profile.name} (${def})` : profile.name}
          onClick={() => setPicker('profile')}
        />
      )}
      {folders.length > 0 && folder && (
        <ListItem
          headline={t('root_folder')}
          supporting={<span dir="ltr">{folder.isDefault ? `${folder.path} (${def})` : folder.path}</span>}
          trailing={folder.freeSpace}
          onClick={() => setPicker('folder')}
        />
      )}
      <DialogPopup
        open={picker === 'profile'}
        title={t('quality_profile')}
        elevation={3}
        onClose={() => setPicker(null)}
        items={profiles.map((p) => ({
          key: String(p.id),
          headline: p.name,
          supporting: p.isDefault ? def : undefined,
          leading: <SelectedDot selected={p.id === profile?.id} />,
          selected: p.id === profile?.id,
          onSelect: () => onProfile(p),
        }))}
      />
      <DialogPopup
        open={picker === 'folder'}
        title={t('root_folder')}
        elevation={3}
        onClose={() => setPicker(null)}
        items={folders.map((f) => ({
          key: String(f.id),
          headline: <span dir="ltr">{f.path}</span>,
          supporting: f.isDefault ? def : undefined,
          trailing: f.freeSpace,
          leading: <SelectedDot selected={f.id === folder?.id} />,
          selected: f.id === folder?.id,
          onSelect: () => onFolder(f),
        }))}
      />
    </>
  )
}
