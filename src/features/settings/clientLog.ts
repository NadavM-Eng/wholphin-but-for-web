// In-memory ring buffer of console output: the web stand-in for logcat (Debug page "Logcat" section and
// "Send app logs"). `debugLogging` (Verbose logging) also records console.debug, like upstream's DebugLogTree.
import { getPref, usePrefsStore } from '../../stores/preferences'

export type LogLevel = 'D' | 'I' | 'W' | 'E'

export interface LogLine {
  time: number
  level: LogLevel
  text: string
}

/** Upstream keeps the last 500 logcat lines on the Debug page (DebugPage.kt). */
export const MAX_LOG_LINES = 500

const lines: LogLine[] = []
const listeners = new Set<() => void>()
let installed = false

// Never keep credentials in the buffer: it is shown on screen, copied and uploaded.
const SECRET_PATTERNS: RegExp[] = [
  /(Token=")[^"]*(")/gi,
  /(api_key=)[^&\s"]+/gi,
  /(X-Emby-Token[":\s]+)[^",\s]+/gi,
  /("?AccessToken"?\s*[:=]\s*"?)[^",\s}]+/gi,
  /("?(?:Pw|password)"?\s*[:=]\s*"?)[^",\s}]+/gi,
]

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((s, re) => s.replace(re, '$1[REDACTED]$2'), text)
}

function stringify(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

let version = 0

export function pushLog(level: LogLevel, args: readonly unknown[]) {
  lines.push({ time: Date.now(), level, text: redact(args.map(stringify).join(' ')) })
  if (lines.length > MAX_LOG_LINES) lines.splice(0, lines.length - MAX_LOG_LINES)
  version++
  listeners.forEach((l) => l())
}

export function getLogLines(): readonly LogLine[] {
  return lines
}

/** Changes whenever a line is added (useSyncExternalStore snapshot). */
export function getLogVersion(): number {
  return version
}

export function subscribeLog(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

let verbose = false

/**
 * Wraps console.* once. Call at startup so early messages are kept (the settings pages call it too, which is
 * a no-op after the first time).
 */
export function installClientLog() {
  if (installed || typeof console === 'undefined') return
  installed = true
  verbose = getPref('debugLogging')
  usePrefsStore.subscribe((s) => {
    verbose = s.values.debugLogging
  })
  const wrap = (method: 'debug' | 'log' | 'info' | 'warn' | 'error', level: LogLevel) => {
    const orig = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      if (level !== 'D' || verbose) pushLog(level, args)
      orig(...args)
    }
  }
  wrap('debug', 'D')
  wrap('log', 'I')
  wrap('info', 'I')
  wrap('warn', 'W')
  wrap('error', 'E')
  window.addEventListener('error', (e) => pushLog('E', [e.error ?? e.message]))
  window.addEventListener('unhandledrejection', (e) => pushLog('E', ['Unhandled rejection:', e.reason]))
}

export function formatLogLine(l: LogLine): string {
  const d = new Date(l.time)
  const ts = `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`
  return `${ts} ${l.level} ${l.text}`
}
