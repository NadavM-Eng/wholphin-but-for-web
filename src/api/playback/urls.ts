// Playback URL builders (spec 05 §1.3, §4.2, §8). Media elements (<video>, <img>) cannot send an Authorization
// header, so these URLs carry the token as the `ApiKey` query parameter (spec 05 §B4 "Direct-play URL").

const trimBase = (base: string) => base.replace(/\/+$/, '')

/** Adds `ApiKey` unless the URL already carries a token (`ApiKey` or legacy `api_key`). */
export function withApiKey(url: string, token: string | null | undefined): string {
  if (!token || /[?&](api_?key)=/i.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}ApiKey=${encodeURIComponent(token)}`
}

/** `api.createUrl(relative)`: resolves a server-relative URL (transcodingUrl, deliveryUrl) against the base. */
export function serverUrl(base: string, pathOrUrl: string, token: string | null | undefined): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return withApiKey(pathOrUrl, token)
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return withApiKey(trimBase(base) + path, token)
}

export interface DirectStreamParams {
  itemId: string
  mediaSourceId: string | null | undefined
  liveStreamId?: string | null
  eTag?: string | null
  playSessionId?: string | null
}

/**
 * `GET /Videos/{itemId}/stream?static=true&mediaSourceId=&liveStreamId=&tag=&playSessionId=`
 * (videoApi.getVideoStreamUrl, PlaybackViewModel.kt:717-724).
 */
export function directStreamUrl(base: string, p: DirectStreamParams, token: string | null | undefined): string {
  const q = new URLSearchParams({ static: 'true' })
  if (p.mediaSourceId) q.set('mediaSourceId', p.mediaSourceId)
  if (p.liveStreamId) q.set('liveStreamId', p.liveStreamId)
  if (p.eTag) q.set('tag', p.eTag)
  if (p.playSessionId) q.set('playSessionId', p.playSessionId)
  return withApiKey(`${trimBase(base)}/Videos/${encodeURIComponent(p.itemId)}/stream?${q}`, token)
}

/** `GET /Videos/{itemId}/Trickplay/{width}/{index}.jpg?mediaSourceId=` (trickPlayApi.getTrickplayTileImageUrl). */
export function trickplayTileUrl(
  base: string,
  itemId: string,
  width: number,
  index: number,
  mediaSourceId: string | null | undefined,
  token: string | null | undefined,
): string {
  const q = mediaSourceId ? `?mediaSourceId=${encodeURIComponent(mediaSourceId)}` : ''
  return withApiKey(`${trimBase(base)}/Videos/${encodeURIComponent(itemId)}/Trickplay/${width}/${index}.jpg${q}`, token)
}

/** Subtitle stream in a given format when the server gave no DeliveryUrl. */
export function subtitleStreamUrl(
  base: string,
  itemId: string,
  mediaSourceId: string,
  index: number,
  format: string,
  token: string | null | undefined,
): string {
  return withApiKey(
    `${trimBase(base)}/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}/Subtitles/${index}/0/Stream.${format}`,
    token,
  )
}

/** `GET /Videos/{itemId}/{mediaSourceId}/Attachments/{index}` (MKV font attachments for ASS). */
export function attachmentUrl(base: string, itemId: string, mediaSourceId: string, index: number, token: string | null | undefined): string {
  return withApiKey(`${trimBase(base)}/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}/Attachments/${index}`, token)
}
