// Text subtitle data: parse the server's JSON (`Stream.js`) or WebVTT (`Stream.vtt`) delivery into cue lists, and a
// plain-text reading of ASS for the "ExoPlayer built-in" ASS mode (styling dropped, as media3's SSA parser does).

export interface SubtitleCue {
  startMs: number
  endMs: number
  /** lines of text; inline <i>/<b>/<u> markup is kept, everything else stripped */
  text: string
}

const TICKS_PER_MS = 10_000

/** Keeps <i>, <b>, <u> (and their closing tags); drops other tags and VTT timestamps; decodes basic entities. */
export function sanitizeCueText(raw: string): string {
  const keep = /^<(\/?)(i|b|u)(\.[^>]*)?>$/i
  return raw
    .replace(/\r/g, '')
    .replace(/<[^>]*>/g, (tag) => {
      const m = keep.exec(tag)
      return m ? `<${m[1]}${m[2].toLowerCase()}>` : ''
    })
    .replace(/&(nbsp|amp);/g, (_e, name: string) => (name === 'nbsp' ? ' ' : '&'))
    .trim()
}

/** Jellyfin `Stream.js`: `{ TrackEvents: [{ StartPositionTicks, EndPositionTicks, Text }] }`. */
export function parseJsonTrackEvents(json: unknown): SubtitleCue[] {
  const events = (json as { TrackEvents?: unknown } | null)?.TrackEvents
  if (!Array.isArray(events)) return []
  const out: SubtitleCue[] = []
  for (const e of events as Array<Record<string, unknown>>) {
    const start = Number(e.StartPositionTicks)
    const end = Number(e.EndPositionTicks)
    const text = typeof e.Text === 'string' ? sanitizeCueText(e.Text.replace(/\\N/gi, '\n')) : ''
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue
    out.push({ startMs: start / TICKS_PER_MS, endMs: end / TICKS_PER_MS, text })
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

function parseTimestamp(s: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(s.trim())
  if (!m) return null
  const [, h, mi, se, ms] = m
  return ((Number(h ?? 0) * 60 + Number(mi)) * 60 + Number(se)) * 1000 + Number(ms.padEnd(3, '0'))
}

/** Minimal WebVTT (and SRT) parser: cue timings and text; settings, regions and styles are ignored. */
export function parseVtt(src: string): SubtitleCue[] {
  const blocks = src.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const out: SubtitleCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    const [a, rest] = lines[ti].split('-->')
    const b = rest.trim().split(/\s+/)[0]
    const start = parseTimestamp(a)
    const end = parseTimestamp(b)
    const text = sanitizeCueText(lines.slice(ti + 1).join('\n'))
    if (start == null || end == null || !text) continue
    out.push({ startMs: start, endMs: end, text })
  }
  return out.sort((x, y) => x.startMs - y.startMs)
}

/** ASS/SSA `Dialogue:` lines as plain cues (override tags removed, \N and \n as line breaks). */
export function parseAssAsText(src: string): SubtitleCue[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  let format: string[] = []
  let inEvents = false
  const out: SubtitleCue[] = []
  const time = (t: string) => {
    const m = /^(\d+):(\d{2}):(\d{2})[.](\d{1,3})$/.exec(t.trim())
    return m ? ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4].padEnd(3, '0')) : null
  }
  for (const line of lines) {
    const l = line.trim()
    if (/^\[.*\]$/.test(l)) {
      inEvents = /^\[events\]$/i.test(l)
      continue
    }
    if (!inEvents) continue
    if (/^format:/i.test(l)) {
      format = l.slice(7).split(',').map((s) => s.trim().toLowerCase())
      continue
    }
    if (!/^dialogue:/i.test(l) || format.length === 0) continue
    const parts = l.slice(9).split(',')
    const fields = parts.slice(0, format.length - 1).map((s) => s.trim())
    const text = parts.slice(format.length - 1).join(',')
    const start = time(fields[format.indexOf('start')] ?? '')
    const end = time(fields[format.indexOf('end')] ?? '')
    const plain = text
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, '\n')
      .replace(/\\h/g, ' ')
      .trim()
    if (start == null || end == null || !plain) continue
    out.push({ startMs: start, endMs: end, text: sanitizeCueText(plain.replace(/</g, '&lt;').replace(/>/g, '&gt;')) })
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

/**
 * Cues visible at `positionMs` with a subtitle delay applied (positive delay = subtitles later, like mpv
 * `sub-delay`). `cues` must be sorted by start.
 */
export function activeCues(cues: readonly SubtitleCue[], positionMs: number, delayMs = 0): SubtitleCue[] {
  const t = positionMs - delayMs
  const out: SubtitleCue[] = []
  // binary search for the first cue starting after t; overlapping earlier cues are scanned backwards
  let lo = 0
  let hi = cues.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid].startMs <= t) lo = mid + 1
    else hi = mid
  }
  // no cue that starts earlier than t - longest duration can still be showing
  const earliest = t - longestCue(cues)
  for (let i = lo - 1; i >= 0 && cues[i].startMs >= earliest; i--) {
    const c = cues[i]
    if (c.endMs > t) out.unshift(c)
  }
  return out
}

const longest = new WeakMap<readonly SubtitleCue[], number>()
function longestCue(cues: readonly SubtitleCue[]): number {
  let m = longest.get(cues)
  if (m == null) {
    m = 0
    for (const c of cues) m = Math.max(m, c.endMs - c.startMs)
    longest.set(cues, m)
  }
  return m
}
