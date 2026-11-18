import { ENGINES, EXTRA_VIEWPORTS, THEMES, VIEWPORTS, type EngineName, type ThemeName, type ViewportDef } from './types.ts'

export interface Options {
  scene: string[]
  viewport: ViewportDef[]
  theme: ThemeName[]
  rtl: boolean
  /** browser engine (default chromium) */
  engine: EngineName
  /** installed Chromium-family browser to drive instead of the bundled one (msedge, chrome): real codecs for the player */
  channel: string | null
  server: 'real' | 'test'
  run: string | null
  strict: boolean
  strictWarnings: boolean
  workers: number
  port: number
  /** use an already running app at this URL instead of starting a dev server */
  url: string | null
  dpr: number
  /** per-scene settle limit */
  settleMs: number
  compare: boolean
  /** compare only: reuse an existing run folder, take no pictures */
  noCapture: boolean
  list: boolean
  help: boolean
  /** true when --theme/--viewport was given explicitly */
  explicit: { theme: boolean; viewport: boolean; channel: boolean }
}

export function defaultRunName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

const list = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/** `*` wildcard match, case-insensitive. */
export function globMatch(pattern: string, text: string): boolean {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i')
  return re.test(text)
}

/** A bare name also matches its "name-*" family; an empty list matches everything. */
export function matchesAny(patterns: string[], name: string): boolean {
  return patterns.length === 0 || patterns.some((p) => globMatch(p, name) || (!p.includes('*') && name.startsWith(p + '-')))
}

const VALUE_FLAGS = new Set(['scene', 'viewport', 'theme', 'engine', 'channel', 'server', 'run', 'workers', 'port', 'url', 'dpr', 'settle-ms'])

export function parseArgs(argv: string[]): Options {
  const o: Options = {
    scene: [],
    viewport: [...VIEWPORTS],
    theme: [...THEMES],
    rtl: false,
    engine: 'chromium',
    channel: null,
    server: 'test',
    run: null,
    strict: false,
    strictWarnings: false,
    workers: 4,
    port: Number(process.env.SHOTS_PORT) || 5184,
    url: null,
    dpr: 1,
    settleMs: 15000,
    compare: false,
    noCapture: false,
    list: false,
    help: false,
    explicit: { theme: false, viewport: false, channel: false },
  }
  const bool = new Set(['rtl', 'strict', 'strict-warnings', 'compare', 'no-capture', 'list', 'help'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`Unexpected argument "${a}"`)
    let key = a.slice(2)
    let val: string | undefined
    const eq = key.indexOf('=')
    if (eq >= 0) {
      val = key.slice(eq + 1)
      key = key.slice(0, eq)
    }
    if (!VALUE_FLAGS.has(key) && !bool.has(key)) throw new Error(`Unknown flag --${key}. Try --help.`)
    if (!bool.has(key) && val === undefined) {
      val = argv[++i]
      if (val === undefined) throw new Error(`--${key} needs a value`)
    }
    const on = val === undefined ? true : !/^(0|false|no)$/i.test(val)
    switch (key) {
      case 'scene':
        o.scene = list(val!)
        break
      case 'viewport': {
        const want = list(val!).map((w) => w.toLowerCase())
        const known = [...VIEWPORTS, ...EXTRA_VIEWPORTS]
        o.viewport = want.includes('all') ? [...VIEWPORTS] : known.filter((v) => want.some((w) => v.name === w || v.name.startsWith(w)))
        if (o.viewport.length === 0) throw new Error(`No viewport matches "${val}". Known: ${known.map((v) => v.name).join(', ')}`)
        o.explicit.viewport = true
        break
      }
      case 'theme': {
        const want = list(val!).map((w) => w.toUpperCase())
        o.theme = want.includes('ALL') ? [...THEMES] : THEMES.filter((t) => want.includes(t))
        if (o.theme.length === 0) throw new Error(`No theme matches "${val}". Known: ${THEMES.join(', ')}`)
        o.explicit.theme = true
        break
      }
      case 'rtl':
        o.rtl = on
        break
      case 'engine': {
        const e = val!.toLowerCase()
        if (!(ENGINES as readonly string[]).includes(e)) throw new Error(`--engine is one of ${ENGINES.join(', ')}`)
        o.engine = e as EngineName
        break
      }
      case 'channel':
        o.channel = /^(none|bundled)$/i.test(val!) ? null : val!
        o.explicit.channel = true
        break
      case 'server':
        if (val !== 'real' && val !== 'test') throw new Error('--server is real or test')
        o.server = val
        break
      case 'run':
        o.run = val!
        break
      case 'strict':
        o.strict = on
        break
      case 'strict-warnings':
        o.strict = true
        o.strictWarnings = on
        break
      case 'workers':
        o.workers = Math.max(1, Number(val) || 1)
        break
      case 'port':
        o.port = Number(val)
        break
      case 'url':
        o.url = val!.replace(/\/+$/, '')
        break
      case 'dpr':
        o.dpr = Number(val) || 1
        break
      case 'settle-ms':
        o.settleMs = Number(val) || 15000
        break
      case 'compare':
        o.compare = on
        break
      case 'no-capture':
        o.noCapture = on
        break
      case 'list':
        o.list = on
        break
      case 'help':
        o.help = on
        break
      default:
        throw new Error(`Unknown flag --${key}`)
    }
  }
  return o
}

export const HELP = `Wholphin Web screenshot crawler
  npm run shots -- [flags]
  --scene a,b*       scene names or * globs (a bare name also matches "name-*")
  --viewport v,..    desktop | laptop | tablet | phone (default all four) | wide (1440x900, only when named)
  --engine e         chromium (default) | firefox | webkit (phone/tablet: iPhone/iPad profile in webkit)
  --channel c        msedge | chrome: an installed browser (headless, muted) with real codecs; none = bundled Chromium
                     (compare mode uses msedge by default, the player references need H.264)
  --theme t,..       PURPLE BLUE GREEN ORANGE BOLD_BLUE OLED_BLACK RED BROWN | all (default all eight)
  --rtl              Hebrew locale (default run name gets an -rtl suffix)
  --server real|test which Jellyfin /dev/login signs in to (default test)
  --run <name>       output folder name under shots/out (default timestamp)
  --strict           exit 1 when any picture has an error-level issue
  --strict-warnings  also fail on warnings
  --workers N        parallel browser contexts (default 4)
  --port N | --url http://host:port   dev server to start or reuse (default port 5184, env SHOTS_PORT)
  --list             print the resolved scene list and exit
  --compare          (npm run shots:compare) side-by-side sheet against refshots/out
  --no-capture       with --compare: reuse the --run folder, take no new pictures
  --dpr N            device scale factor (default 1)
`
