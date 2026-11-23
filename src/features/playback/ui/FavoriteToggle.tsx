import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { FaIcon } from '../../../ui'
import { useItemActions } from '../../common/useItemActions'
import styles from './FavoriteToggle.module.css'
import { PlaybackButton } from './PlaybackButton'
import { plainT } from './text'

export interface FavoriteToggleProps {
  /** the item the button marks; its `UserData.IsFavorite` is the state shown */
  item: BaseItemDto
  /** shown, but a click does nothing (the item is still loading) */
  disabled?: boolean
  onInteract: () => void
  /** icon size in dp at the strip's full height */
  iconSize: number
}

/**
 * The strip button behind FavoriteButton, for an item that can be marked: the heart of the detail pages, and the
 * app's one favourite action (useItemActions, which needs a session and a query client).
 */
export function FavoriteToggle({ item, disabled, onInteract, iconSize }: FavoriteToggleProps) {
  const t = plainT(useTranslation().t)
  const actions = useItemActions()
  // The engine applies the action's cache patches to the store's item (engine.ts, `onItemPatched`), so this is the
  // new state at once and the old one again when the server refuses.
  const favorite = item.UserData?.IsFavorite ?? false
  return (
    <PlaybackButton
      flat
      name="favorite"
      icon={
        <FaIcon
          name="heart"
          className={styles.icon}
          color={favorite ? 'var(--fx-favorite-active)' : undefined}
          style={{ '--icon-dp': iconSize } as CSSProperties}
        />
      }
      label={favorite ? t('remove_favorite') : t('add_favorite')}
      pressed={favorite}
      disabled={disabled}
      onClick={() => {
        onInteract()
        void actions.setFavorite(item, !favorite)
      }}
    />
  )
}
