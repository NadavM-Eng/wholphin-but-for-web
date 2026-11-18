import type { CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import bannerUrl from '../assets/app_banner_foreground.png'
import logoUrl from '../assets/app_logo_foreground.webp'

export type AppLogoProps = {
  /** `icon`: launcher foreground (cube), square. `banner`: TV banner art (cube + "Wholphin"), 16:9-ish. */
  variant?: 'icon' | 'banner'
  /** Height in dp. */
  size?: number
  /** Paint the launcher/banner background color behind the art, as the Android adaptive icon does. */
  withBackground?: boolean
  alt?: string
  className?: string
  style?: CSSProperties
}

/**
 * The app logo. Upstream ships it only as raster mipmaps (`mipmap-xxxhdpi/ic_launcher_foreground.webp`,
 * `mipmap-xhdpi/ic_banner_foreground.png`), so these are the same files, not an SVG conversion.
 */
export function AppLogo({ variant = 'icon', size = 48, withBackground, alt = '', className, style }: AppLogoProps) {
  const src = variant === 'icon' ? logoUrl : bannerUrl
  // Adaptive-icon backgrounds from res/values/ic_launcher_background.xml / ic_banner_background.xml.
  const bg = variant === 'icon' ? '#101010' : '#000B25'
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={false}
      style={{
        height: dpCss(size),
        width: 'auto',
        borderRadius: withBackground && variant === 'icon' ? '50%' : undefined,
        background: withBackground ? bg : undefined,
        ...style,
      }}
    />
  )
}
