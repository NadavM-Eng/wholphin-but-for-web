// Shared presentational components of Wholphin Web. See src/ui/LIB_DEFAULTS.md for the tv-material values.

// Icons
export { FaIcon, type FaIconProps } from './icons/FaIcon'
export { FA_CODEPOINTS, faChar, type FaName } from './icons/faCodepoints'
export { MaterialIcon, type MaterialIconName, type MaterialIconProps } from './icons/MaterialIcon'
export { DrawableIcon, type DrawableName, type DrawableIconProps } from './icons/DrawableIcon'
export { AppLogo, type AppLogoProps } from './icons/AppLogo'

// Buttons
export { Button, type ButtonProps, type ButtonVariant } from './buttons/Button'
export { TextButton, type TextButtonProps } from './buttons/TextButton'
export { IconButton, type IconButtonProps } from './buttons/IconButton'
export { ExpandableButton, type ExpandableButtonProps } from './buttons/ExpandableButton'
export { PlayButtons, type PlayButtonsProps } from './buttons/PlayButtons'

// Cards
export { CardFrame, type CardActions, type CardFrameProps } from './cards/CardFrame'
export { CardImage, type CardImageProps, type CardOverlayProps, type ImageFit } from './cards/CardImage'
export { CardTitle, type CardTitleProps } from './cards/CardTitle'
export { GridCard, type GridCardProps } from './cards/GridCard'
export { PosterCard, type PosterCardProps } from './cards/PosterCard'
export { BannerCard, type BannerCardProps } from './cards/BannerCard'
export { BannerCardWithTitle, type BannerCardWithTitleProps } from './cards/BannerCardWithTitle'
export { PersonCard, type PersonCardProps } from './cards/PersonCard'
export { GenreCard, type GenreCardProps } from './cards/GenreCard'
export { StudioCard, type StudioCardProps } from './cards/StudioCard'
export { ViewMoreCard, type ViewMoreCardProps } from './cards/ViewMoreCard'
export { ChapterCard, type ChapterCardProps } from './cards/ChapterCard'
export {
  DiscoverItemCard,
  type DiscoverAvailability,
  type DiscoverItemCardProps,
  type DiscoverMediaType,
} from './cards/DiscoverItemCard'
export { UserCircleCard, type UserCircleCardProps } from './cards/UserCircleCard'
export { ServerCircleCard, type ServerCircleCardProps, type ServerStatus } from './cards/ServerCircleCard'
export { WatchedBadge, type WatchedBadgeProps } from './cards/WatchedBadge'
export { Pill, type PillProps } from './cards/Pill'
export { ProgressBar, type ProgressBarProps } from './cards/ProgressBar'

// Rows and grids
export { ItemRow, type ItemRowProps } from './rows/ItemRow'
export { CardGrid, type CardGridHandle, type CardGridProps } from './rows/CardGrid'
export { AlphabetPicker, type AlphabetPickerProps } from './rows/AlphabetPicker'
export { LoadingRow, type LoadingRowProps } from './rows/LoadingRow'

// Feedback
export { CircularProgress, type CircularProgressProps } from './feedback/CircularProgress'
export { LoadingPage, type LoadingPageProps } from './feedback/LoadingPage'
export { ErrorMessage, type ErrorMessageProps } from './feedback/ErrorMessage'
export { Toast, type ToastProps } from './feedback/Toast'
export { ToastViewport } from './feedback/ToastViewport'

// Overlays
export { Dialog, type DialogProps, type DialogVariant } from './overlays/Dialog'
export { DialogPopup, type DialogPopupProps } from './overlays/DialogPopup'
export { type DialogEntry, type DialogItem, type DialogDivider } from './overlays/dialogItems'
export { ConfirmDialog, type ConfirmDialogProps } from './overlays/ConfirmDialog'
export { ContextMenu, type ContextMenuProps } from './overlays/ContextMenu'
export { DropdownMenu, type DropdownMenuProps, type MenuAnchor } from './overlays/DropdownMenu'
export { DropdownMenuItem, type DropdownMenuItemProps } from './overlays/DropdownMenuItem'
export { ListItem, type ListItemProps } from './overlays/ListItem'
export { SelectedDot } from './overlays/SelectedDot'

// Inputs
export { TextField, type TextFieldProps } from './inputs/TextField'
export { SearchField, type SearchFieldProps } from './inputs/SearchField'
export { Switch, type SwitchProps } from './inputs/Switch'
export { SwitchWithLabel, type SwitchWithLabelProps } from './inputs/SwitchWithLabel'
export { Slider, type SliderProps } from './inputs/Slider'

// Text
export { TabRow, type TabItem, type TabRowProps } from './text/TabRow'
export { CommunityRating, type CommunityRatingProps } from './text/CommunityRating'
export { CriticRating, type CriticRatingProps } from './text/CriticRating'
export { StarRating, type StarRatingProps } from './text/StarRating'
export { QuickDetails, DOT, type QuickDetailsProps } from './text/QuickDetails'
export { TitleOrLogo, type TitleOrLogoProps } from './text/TitleOrLogo'
export { OverviewText, type OverviewTextProps } from './text/OverviewText'
export { StreamChip, type StreamChipProps } from './text/StreamChip'
export { TitleValueText, type TitleValueTextProps } from './text/TitleValueText'
export { MarqueeText, type MarqueeTextProps } from './text/MarqueeText'

// Helpers
export { idColor, idColorCss, type Rgb } from './lib/idColor'
export { contextMenuPoint, type MenuPoint } from './lib/contextMenu'
export { clampAspect, columnCount, cardWidth, type GridColumns } from './lib/gridMath'
export { JUMP_LETTERS, letterForSortName } from './lib/letters'
export { nextStarRating, type StarPrecision } from './lib/starRating'
export { useFocusedAfterDelay } from './lib/useFocusedAfterDelay'
export { useLongPress, LONG_PRESS_MS, type LongPressHandlers } from './lib/useLongPress'
export { observeResize } from './lib/observeResize'
export {
  lastInput,
  lastPointerType,
  lastInputWasTouch,
  captureOpener,
  restoreFocus,
  focusFromScript,
  holdFocusLook,
  HELD_ATTR,
  pointerHighlight,
  type InputKind,
} from './lib/inputModality'
export { bringIntoView, pivotScrollTop, PIVOT_PARENT_FRACTION } from './lib/bringIntoView'
export { menuPositionBelow } from './lib/menuPosition'
