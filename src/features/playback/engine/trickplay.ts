// Trickplay tile math (overlay/TrickplayPreview.kt, SeekPreviewImage.kt, PlaybackViewModel.getTrickplayUrl;
// spec 05 §8).
import type { TrickplayInfoDto } from '@jellyfin/sdk/lib/generated-client/models'
import { trickplayTileUrl } from '../../../api/playback/urls'

export interface TrickplayTile {
  /** global thumbnail index */
  index: number
  /** which sprite sheet (the `{index}.jpg` of the URL) */
  sheet: number
  col: number
  row: number
  /** sprite rectangle inside the sheet, in sheet pixels */
  x: number
  y: number
  width: number
  height: number
  /** full sheet size in pixels (for CSS background-size) */
  sheetWidth: number
  sheetHeight: number
}

/** Tile for a position. Indexes past the last thumbnail clamp to it. */
export function trickplayTile(info: TrickplayInfoDto, positionMs: number): TrickplayTile | null {
  const interval = info.Interval ?? 0
  const tw = info.TileWidth ?? 0
  const th = info.TileHeight ?? 0
  const w = info.Width ?? 0
  const h = info.Height ?? 0
  if (interval <= 0 || tw <= 0 || th <= 0 || w <= 0 || h <= 0) return null
  const perSheet = tw * th
  let index = Math.floor(Math.max(0, positionMs) / interval)
  if (info.ThumbnailCount != null && info.ThumbnailCount > 0) index = Math.min(index, info.ThumbnailCount - 1)
  const sheet = Math.floor(index / perSheet)
  const inSheet = index % perSheet
  const col = inSheet % tw
  const row = Math.floor(inSheet / tw)
  return { index, sheet, col, row, x: col * w, y: row * h, width: w, height: h, sheetWidth: tw * w, sheetHeight: th * h }
}

/** Number of sheets to prefetch: `(durationMs / interval) / tilesPerImage + 1`. */
export function trickplaySheetCount(info: TrickplayInfoDto, durationMs: number): number {
  const interval = info.Interval ?? 0
  const per = (info.TileWidth ?? 0) * (info.TileHeight ?? 0)
  if (interval <= 0 || per <= 0) return 0
  return Math.floor(Math.floor(durationMs / interval) / per) + 1
}

/**
 * The trickplay info upstream uses: the first width of the chosen source (PlaybackViewModel.kt:573-579). The map
 * is keyed by media source id (dashes vary between endpoints, so compare normalized).
 */
export function pickTrickplayInfo(
  trickplay: Record<string, Record<string, TrickplayInfoDto> | null> | null | undefined,
  sourceId: string | null | undefined,
): TrickplayInfoDto | null {
  if (!trickplay || !sourceId) return null
  const norm = (s: string) => s.replace(/-/g, '').toLowerCase()
  const key = Object.keys(trickplay).find((k) => norm(k) === norm(sourceId))
  const widths = key ? trickplay[key] : null
  return widths ? (Object.values(widths)[0] ?? null) : null
}

export interface TrickplayImage extends TrickplayTile {
  url: string
}

/** Image URL plus sprite rectangle for a time: what a seek-bar preview draws. */
export function trickplayImageAt(
  baseUrl: string,
  token: string | null,
  itemId: string,
  mediaSourceId: string | null,
  info: TrickplayInfoDto,
  positionMs: number,
): TrickplayImage | null {
  const tile = trickplayTile(info, positionMs)
  if (!tile) return null
  return { ...tile, url: trickplayTileUrl(baseUrl, itemId, info.Width ?? 0, tile.sheet, mediaSourceId, token) }
}
