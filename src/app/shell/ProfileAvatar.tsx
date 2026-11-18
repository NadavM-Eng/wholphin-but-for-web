import { useState } from 'react'
import { idColorCss } from '../../ui'
import styles from './NavDrawer.module.css'

export type ProfileAvatarProps = {
  userId: string
  name: string | null
  imageUrl: string | null
  /** alpha of the id-colour circle only: .5 collapsed, 1 open (NavDrawer.kt:583-589) */
  alpha: number
}

/**
 * UserIconCardImage at 24dp (W/ui/setup/UserList.kt:300-343): the user image cropped to a circle over a
 * circle of `rememberIdColor(id, alpha)`; on a missing/failed image the first letter (14sp, onSurface).
 */
export function ProfileAvatar({ userId, name, imageUrl, alpha }: ProfileAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = !!imageUrl && failed !== imageUrl
  const letter = ((name ?? userId).charAt(0) || '?').toUpperCase()
  return (
    <span className={styles.avatar} style={{ background: idColorCss(userId, alpha) }}>
      {showImage ? (
        <img src={imageUrl} alt="" draggable={false} onError={() => setFailed(imageUrl)} />
      ) : (
        <span className={styles.avatarLetter}>{letter}</span>
      )}
    </span>
  )
}
