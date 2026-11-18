import type { CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'

/**
 * Upstream vector drawables (`res/drawable/*.xml`) converted 1:1: viewport -> viewBox, pathData -> d.
 * `fill: null` paths take `currentColor` (upstream tints them at the use site); others keep their own color.
 */
type Path = { d: string; fill: string | null }
type Drawable = { w: number; h: number; paths: Path[] }

const DRAWABLES = {
  /** `video_solid.xml`: card placeholder (FA "video"). */
  video_solid: {
    w: 576,
    h: 512,
    paths: [
      {
        d: 'M0,128C0,92.7 28.7,64 64,64l256,0c35.3,0 64,28.7 64,64l0,256c0,35.3 -28.7,64 -64,64L64,448c-35.3,0 -64,-28.7 -64,-64L0,128zM559.1,99.8c10.4,5.6 16.9,16.4 16.9,28.2l0,256c0,11.8 -6.5,22.6 -16.9,28.2s-23,5 -32.9,-1.6l-96,-64L416,337.1l0,-17.1 0,-128 0,-17.1 14.2,-9.5 96,-64c9.8,-6.5 22.4,-7.2 32.9,-1.6z',
        fill: null,
      },
    ],
  },
  /** `gf_dvr.xml`: Live TV nav icon. */
  gf_dvr: {
    w: 960,
    h: 960,
    paths: [
      {
        d: 'M279.98,553q14.02,0 23.52,-9.48t9.5,-23.5q0,-14.02 -9.48,-23.52t-23.5,-9.5q-14.02,0 -23.52,9.48t-9.5,23.5q0,14.02 9.48,23.52t23.5,9.5ZM279.98,393q14.02,0 23.52,-9.48t9.5,-23.5q0,-14.02 -9.48,-23.52t-23.5,-9.5q-14.02,0 -23.52,9.48t-9.5,23.5q0,14.02 9.48,23.52t23.5,9.5ZM360,550h360v-60L360,490v60ZM360,390h360v-60L360,330v60ZM330,840v-80L140,760q-24,0 -42,-18t-18,-42v-520q0,-24 18,-42t42,-18h680q24,0 42,18t18,42v520q0,24 -18,42t-42,18L630,760v80L330,840ZM140,700h680v-520L140,180v520ZM140,700v-520,520Z',
        fill: null,
      },
    ],
  },
  /** `ic_rotten_tomatoes_fresh.xml` */
  rt_fresh: {
    w: 138.75,
    h: 141.25,
    paths: [
      { d: 'm20.15,40.83c-28.15,27.62 -13.66,61.01 -5.73,71.93 35.25,41.95 92.79,25.34 111.89,-5.91 4.76,-8.2 22.55,-53.47 -23.98,-78.01z', fill: '#f93208' },
      { d: 'm39.61,39.26 l4.78,-8.86 28.41,-5.04 11.12,9.21z', fill: '#f93208' },
      {
        d: 'm39.44,8.57 l8.97,-5.28 6.76,15.48c3.79,-6.32 13.79,-16.32 24.94,-4.67 -4.73,1.26 -7.52,3.86 -7.74,8.48 15.15,-4.17 31.34,3.21 33.54,9.09 -10.95,-4.31 -27.69,10.38 -41.77,2.33 0.01,15.05 -12.62,16.64 -19.9,17.08 2.08,-5 5.59,-9.99 1.47,-14.99 -7.62,8.17 -13.87,10.67 -33.17,4.67 4.88,-1.68 14.84,-11.39 24.45,-11.43 -6.78,-2.47 -12.29,-2.09 -17.81,-1.48 2.92,-3.96 12.15,-15.2 28.63,-8.48z',
        fill: '#02902e',
      },
    ],
  },
  /** `ic_rotten_tomatoes_rotten.xml` */
  rt_rotten: {
    w: 145,
    h: 140,
    paths: [
      {
        d: 'M47.4,35.34c-13.61,-7.93 -12.32,-25.2 2.1,-31.88 26.12,-6.53 29.12,13.78 22.65,30.41 -6.54,24.11 18.09,23.66 19.92,10.07 3.61,-18.41 19.39,-26.69 31.67,-16.36 12.6,12.14 7.07,36.58 -17.83,34.19 -16.03,-1.54 -19.55,19.58 0.84,21.18 32.23,1.91 42.49,22.17 31.04,35.87 -15.99,15.15 -37.69,-4.44 -45.51,-19.5 -6.8,-9.31 -17.32,0.11 -13.42,6.5 12.98,19.47 2.92,31.23 -10.91,30.62 -13.37,-0.85 -20.96,-9.06 -13.21,-29.15 3.9,-12.48 -8.6,-15.39 -16.57,-5.45 -11.71,19.61 -28.86,13.68 -33.98,4.19 -3.24,-7.62 -2.92,-25.85 24.12,-23.7 16.69,4.14 11.78,-12.56 -0.63,-13.63 -9.24,-0.44 -30.5,-7.3 -22.86,-24.54 7.34,-11.06 24.96,-11.77 33.35,6.29 3.04,4.23 8.36,11.04 18.04,5.03 3.51,-5.2 1.21,-13.9 -8.81,-20.14z',
        fill: '#0fc755',
      },
    ],
  },
  /** `captions_svgrepo_com.xml` */
  captions: {
    w: 24,
    h: 24,
    paths: [
      { d: 'M6,10v4c0,1.103 0.897,2 2,2h3v-2L8,14v-4h3L11,8L8,8c-1.103,0 -2,0.897 -2,2zM13,10v4c0,1.103 0.897,2 2,2h3v-2h-3v-4h3L18,8h-3c-1.103,0 -2,0.897 -2,2z', fill: null },
      { d: 'M20,4H4c-1.103,0 -2,0.897 -2,2v12c0,1.103 0.897,2 2,2h16c1.103,0 2,-0.897 2,-2V6c0,-1.103 -0.897,-2 -2,-2zM4,18V6h16l0.002,12H4z', fill: null },
    ],
  },
  /** `circular_arrow_right.xml`: skip indicator. */
  circular_arrow_right: {
    w: 75.695,
    h: 75.695,
    paths: [
      {
        d: 'M75.695,37.846c0,20.869 -16.98,37.85 -37.848,37.85C16.981,75.695 0,58.715 0,37.846C0,16.977 16.981,0 37.848,0c7.628,0 15.055,2.331 21.31,6.592l5.816,-5.817l4.679,17.946l-17.949,-4.678l4.069,-4.072c-5.319,-3.422 -11.538,-5.3 -17.929,-5.3c-18.294,0 -33.176,14.882 -33.176,33.174c0,18.294 14.882,33.178 33.176,33.178c18.293,0 33.175,-14.884 33.175,-33.178H75.695z',
        fill: null,
      },
    ],
  },
  play: { w: 24, h: 24, paths: [{ d: 'M8,5v14l11,-7z', fill: null }] },
  pause: { w: 24, h: 24, paths: [{ d: 'M6,19h4L10,5L6,5v14zM14,5v14h4L18,5h-4z', fill: null }] },
  stop: { w: 24, h: 24, paths: [{ d: 'M6,6h12v12H6z', fill: null }] },
  skip_next: { w: 24, h: 24, paths: [{ d: 'M6,18l8.5,-6L6,6v12zM16,6v12h2V6h-2z', fill: null }] },
  skip_previous: { w: 24, h: 24, paths: [{ d: 'M6,6h2v12L6,18zM9.5,12l8.5,6L18,6z', fill: null }] },
  fast_forward: { w: 24, h: 24, paths: [{ d: 'M4,18l8.5,-6L4,6v12zM13,6v12l8.5,-6L13,6z', fill: null }] },
  fast_rewind: { w: 24, h: 24, paths: [{ d: 'M11,18L11,6l-8.5,6 8.5,6zM11.5,12l8.5,6L20,6l-8.5,6z', fill: null }] },
  undo: {
    w: 24,
    h: 24,
    paths: [
      {
        d: 'M12.5,8c-2.65,0 -5.05,0.99 -6.9,2.6L2,7v9h9l-3.62,-3.62c1.39,-1.16 3.16,-1.88 5.12,-1.88 3.54,0 6.55,2.31 7.6,5.5l2.37,-0.78C21.08,11.03 17.15,8 12.5,8z',
        fill: null,
      },
    ],
  },
} as const satisfies Record<string, Drawable>

export type DrawableName = keyof typeof DRAWABLES

export type DrawableIconProps = {
  name: DrawableName
  /** Height in dp; width follows the drawable's aspect. Omit to size with CSS (`1em` high). */
  size?: number
  color?: string
  label?: string
  className?: string
  style?: CSSProperties
}

export function DrawableIcon({ name, size, color, label, className, style }: DrawableIconProps) {
  const dr: Drawable = DRAWABLES[name]
  const h = size != null ? dpCss(size) : '1em'
  return (
    <svg
      viewBox={`0 0 ${dr.w} ${dr.h}`}
      height={h}
      width={size != null ? dpCss((size * dr.w) / dr.h) : undefined}
      className={className}
      style={{ flex: 'none', color, ...(size == null ? { width: `${dr.w / dr.h}em` } : null), ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {dr.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ?? 'currentColor'} />
      ))}
    </svg>
  )
}
