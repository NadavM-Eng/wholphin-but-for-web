// Fetches the subtitle the user chose in a form the client renderers take (spec 05 §4, §B5).
import type { MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client/models'
import type { Preferences } from '../../../../stores/preferences'
import { attachmentUrl, serverUrl } from '../../../../api/playback/urls'
import { parseAssAsText, parseJsonTrackEvents, parseVtt, type SubtitleCue } from './cues'

export type SubtitleData =
  /** cue list for our text renderer */
  | { kind: 'text'; streamIndex: number; cues: SubtitleCue[] }
  /** raw ASS/SSA for JASSUB plus the item's embedded fonts */
  | { kind: 'ass'; streamIndex: number; content: string; fonts: Uint8Array[] }
  /** raw PGS stream (.sup: a sequence of "PG" segments) for the canvas renderer (libpgs) */
  | { kind: 'pgs'; streamIndex: number; data: ArrayBuffer }
  /** drawn into the video by the server (DVD/DVB image formats, PGS or ASS in burn-in mode) */
  | { kind: 'burn-in'; streamIndex: number }
  /** the server offers no client-side delivery for this stream with the current play method */
  | { kind: 'unavailable'; streamIndex: number }

const FONT_MIME = /font|truetype|opentype|sfnt/i
const FONT_EXT = /\.(ttf|otf|ttc|woff2?)$/i

export function fontAttachments(source: MediaSourceInfo) {
  return (source.MediaAttachments ?? []).filter((a) => FONT_MIME.test(a.MimeType ?? '') || FONT_EXT.test(a.FileName ?? ''))
}

const isAss = (s: MediaStream) => /^(ass|ssa)$/i.test(s.Codec ?? '')
const isPgs = (s: MediaStream) => /^(pgs|pgssub|sup)$/i.test(s.Codec ?? '')

/** A PGS stream is a sequence of segments that each start with the two bytes "PG". */
export function looksLikePgs(data: ArrayBuffer): boolean {
  const b = new Uint8Array(data, 0, Math.min(2, data.byteLength))
  return b.length === 2 && b[0] === 0x50 && b[1] === 0x47
}

export interface LoadContext {
  baseUrl: string
  /** Authorization header value: fetch() can send it, so the token stays out of the URL (and access logs) */
  authorization: string | null
  itemId: string
  source: MediaSourceInfo
  assMode: Preferences['assSubtitleMode']
  signal?: AbortSignal
}

/** Drops the query token the server puts into DeliveryUrl when the request carries the Authorization header. */
export function withoutApiKey(url: string, ctx: Pick<LoadContext, 'authorization'>): string {
  if (!ctx.authorization) return url
  return url.replace(/([?&])(api_?key)=[^&#]*(&?)/i, (_m, sep: string, _k: string, tail: string) => (tail ? sep : '')).replace(/[?&]$/, '')
}

function init(ctx: LoadContext): RequestInit {
  return { signal: ctx.signal, headers: ctx.authorization ? { Authorization: ctx.authorization } : undefined }
}

async function fetchText(url: string, ctx: LoadContext): Promise<string> {
  const r = await fetch(url, init(ctx))
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

/** Loads one subtitle stream of the current PlaybackInfo source. */
export async function loadSubtitle(stream: MediaStream, ctx: LoadContext): Promise<SubtitleData> {
  const streamIndex = stream.Index ?? -1
  if (stream.DeliveryMethod === 'Encode') return { kind: 'burn-in', streamIndex }
  if (stream.DeliveryMethod !== 'External' || !stream.DeliveryUrl) return { kind: 'unavailable', streamIndex }
  const url = withoutApiKey(serverUrl(ctx.baseUrl, stream.DeliveryUrl, null), ctx)

  if (isAss(stream) && /\.(ass|ssa)(\?|$)/i.test(url)) {
    const content = await fetchText(url, ctx)
    if (ctx.assMode === 'ASS_EXO_PLAYER') return { kind: 'text', streamIndex, cues: parseAssAsText(content) }
    const fonts = await Promise.all(
      fontAttachments(ctx.source).map(async (a) => {
        const u = a.DeliveryUrl
          ? withoutApiKey(serverUrl(ctx.baseUrl, a.DeliveryUrl, null), ctx)
          : attachmentUrl(ctx.baseUrl, ctx.itemId, ctx.source.Id ?? '', a.Index ?? 0, null)
        try {
          const r = await fetch(u, init(ctx))
          return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
        } catch {
          return null
        }
      }),
    )
    const loaded: Uint8Array[] = []
    for (const f of fonts) if (f) loaded.push(f)
    return { kind: 'ass', streamIndex, content, fonts: loaded }
  }

  if (isPgs(stream)) {
    // The server extracts the track once (stream copy to .sup, no encoding) and serves the file. Anything that is
    // not a PGS stream (an error page, an empty body) is reported as unavailable instead of reaching the renderer.
    const r = await fetch(url, init(ctx))
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await r.arrayBuffer()
    return looksLikePgs(data) ? { kind: 'pgs', streamIndex, data } : { kind: 'unavailable', streamIndex }
  }

  // Text: the JSON track-event format keeps line breaks and inline tags without a VTT parser; fall back to VTT.
  const jsonUrl = url.replace(/\/Stream\.(vtt|srt|subrip|ttml|webvtt)(\?|$)/i, '/Stream.js$2')
  if (jsonUrl !== url) {
    try {
      const r = await fetch(jsonUrl, init(ctx))
      if (r.ok) {
        const cues = parseJsonTrackEvents(await r.json())
        if (cues.length > 0) return { kind: 'text', streamIndex, cues }
      }
    } catch (err) {
      if (ctx.signal?.aborted) throw err
    }
  }
  return { kind: 'text', streamIndex, cues: parseVtt(await fetchText(url, ctx)) }
}
