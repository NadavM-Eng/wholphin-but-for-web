import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mayTakeInitialFocus } from '../../../app/shell'
import { ConfirmDialog, ExpandableButton, FaIcon, MaterialIcon, PlayButtons } from '../../../ui'

export type MusicButtonsProps = {
  title: string
  favorite: boolean
  canDelete: boolean
  /** false on the song page (SongDetailsPage: `showShuffle = false`) */
  showShuffle?: boolean
  onPlay: (shuffle: boolean) => void
  onInstantMix: () => void
  onFavorite: () => void
  onMore: () => void
  onConfirmDelete: () => void
}

/**
 * `MusicExpandableButtons` (W/ui/detail/music/MusicExpandableButtons.kt): Play, Shuffle, Instant mix,
 * Favorite (red heart when on), Delete (with confirmation) and More, 16dp apart with 8dp padding.
 */
export function MusicButtons({
  title,
  favorite,
  canDelete,
  showShuffle = true,
  onPlay,
  onInstantMix,
  onFavorite,
  onMore,
  onConfirmDelete,
}: MusicButtonsProps) {
  const { t } = useTranslation()
  const [confirm, setConfirm] = useState(false)
  const playRef = useRef<HTMLElement>(null)
  // Upstream requests focus on Play when the page opens. Only with a hover pointer (keyboard / remote), and only
  // when nothing else holds focus yet (Back focus restore and AlbumPage's initial song win).
  useEffect(() => {
    if (!mayTakeInitialFocus()) return
    if (!matchMedia('(hover: hover)').matches) return
    playRef.current?.focus({ preventScroll: true })
  }, [])
  return (
    <PlayButtons label={title}>
      <ExpandableButton
        icon={<MaterialIcon name="play_arrow" size={28} />}
        label={t('play')}
        labelOnTouch
        onClick={() => onPlay(false)}
        ref={playRef}
      />
      {showShuffle && <ExpandableButton icon={<FaIcon name="shuffle" />} iconKind="fa" label={t('shuffle')} onClick={() => onPlay(true)} />}
      <ExpandableButton icon={<FaIcon name="compass" />} iconKind="fa" label={t('instant_mix')} onClick={onInstantMix} />
      <ExpandableButton
        icon={<FaIcon name="heart" />}
        iconKind="fa"
        label={t(favorite ? 'remove_favorite' : 'add_favorite')}
        iconColor={favorite ? 'var(--fx-favorite-active)' : undefined}
        onClick={onFavorite}
      />
      {canDelete && (
        <ExpandableButton icon={<MaterialIcon name="delete" size={28} />} label={t('delete')} destructive onClick={() => setConfirm(true)} />
      )}
      <ExpandableButton icon={<MaterialIcon name="more_vert" size={28} />} label={t('more')} onClick={onMore} />
      {confirm && (
        <ConfirmDialog
          open
          variant="delete"
          title={t('delete_item')}
          body={title}
          cancelLabel={t('cancel')}
          confirmLabel={t('confirm')}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            onConfirmDelete()
          }}
        />
      )}
    </PlayButtons>
  )
}
