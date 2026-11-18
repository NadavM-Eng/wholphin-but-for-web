// Theme music (W/services/ThemeSongPlayer.kt) has one player, owned by the detail pages
// (src/features/detail/common/themeMusic.ts). The music service and MusicHost stop it when the queue or a video
// starts; the detail pages do not start it while the music queue is active.
export { stopThemeSong } from '../../detail/common/themeMusic'
