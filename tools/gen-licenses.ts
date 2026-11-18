// Generates the open-source license data for the License page (upstream Destination.License, which shows
// AboutLibraries' list) and the upstream reference the web port tracks.
//   src/features/settings/licenses.gen.json  production npm dependencies (package-lock.json) + bundled assets
//   src/features/settings/upstream.gen.json  the Wholphin commit in reference/wholphin (if present)
// Part of `npm run gen` (`npm run gen:licenses`). Output is committed.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface LicenseEntry {
  name: string
  version: string
  license: string
  /** project page or repository */
  url: string | null
  author: string | null
  /** full license text from the package (LICENSE*), if shipped */
  text: string | null
}

interface LockPackage {
  /** a `file:` dependency inside this repository (vendor/*): project code, not a third-party package */
  link?: boolean
  version?: string
  license?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

type PackageJson = {
  name?: string
  version?: string
  license?: string | { type?: string }
  licenses?: Array<{ type?: string }>
  homepage?: string
  repository?: string | { url?: string }
  author?: string | { name?: string }
}

/**
 * The developer's name only, as AboutLibraries shows it: npm's "Name <email> (url)" person string loses its
 * e-mail and URL parts. Returns null when nothing but contact details is left.
 */
export function authorName(author: PackageJson['author']): string | null {
  const raw = typeof author === 'string' ? author : author?.name
  if (!raw) return null
  const name = raw.replace(/<[^>]*>/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  return name || null
}

export function repoUrl(repo: PackageJson['repository']): string | null {
  const raw = typeof repo === 'string' ? repo : repo?.url
  if (!raw) return null
  let u = raw.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://')
  u = u.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/').replace(/^git@github\.com:/, 'https://github.com/')
  if (/^github:/.test(u)) u = `https://github.com/${u.slice(7)}`
  if (/^[\w.-]+\/[\w.-]+$/.test(u)) u = `https://github.com/${u}`
  return /^https?:\/\//.test(u) ? u : null
}

export function licenseOf(pkg: PackageJson, lock: LockPackage): string {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license?.type) return pkg.license.type
  if (pkg.licenses?.length) return pkg.licenses.map((l) => l.type).filter(Boolean).join(' OR ')
  return lock.license ?? 'UNKNOWN'
}

function licenseText(dir: string): string | null {
  if (!existsSync(dir)) return null
  const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.(md|txt|markdown))?$/i.test(f))
  return file ? readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : null
}

/** Lockfile paths reachable from the root `dependencies` (node resolution: nested first, then hoisted). */
export function productionPaths(packages: Record<string, LockPackage>): Set<string> {
  const out = new Set<string>()
  const resolveFrom = (from: string, dep: string): string | null => {
    let base = from
    for (;;) {
      const candidate = `${base ? `${base}/` : ''}node_modules/${dep}`
      if (packages[candidate]) return candidate
      if (!base) return null
      const idx = base.lastIndexOf('node_modules/')
      base = idx <= 0 ? '' : base.slice(0, idx - 1)
    }
  }
  const visit = (path: string) => {
    const info = packages[path]
    if (!info) return
    const peers = Object.fromEntries(Object.entries(info.peerDependencies ?? {}).filter(([n]) => !info.peerDependenciesMeta?.[n]?.optional))
    const deps = { ...info.dependencies, ...info.optionalDependencies, ...peers }
    for (const dep of Object.keys(deps)) {
      const p = resolveFrom(path, dep)
      if (p && !out.has(p)) {
        out.add(p)
        visit(p)
      }
    }
  }
  const root = packages['']
  for (const dep of Object.keys({ ...root?.dependencies, ...root?.optionalDependencies })) {
    const p = resolveFrom('', dep)
    if (p && !out.has(p)) {
      out.add(p)
      visit(p)
    }
  }
  return out
}

/** Production packages from package-lock.json (lockfile v2/v3 `packages` map), sorted by name. */
export function collect(root: string): LicenseEntry[] {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockPackage>
  }
  const prod = productionPaths(lock.packages)
  const seen = new Map<string, LicenseEntry>()
  for (const [path, info] of Object.entries(lock.packages)) {
    if (!prod.has(path) || info.link) continue
    const dir = join(root, path)
    const pjPath = join(dir, 'package.json')
    if (!existsSync(pjPath)) continue // optional platform binaries not installed here
    const pkg = JSON.parse(readFileSync(pjPath, 'utf8')) as PackageJson
    const name = pkg.name ?? path.replace(/^.*node_modules\//, '')
    const version = pkg.version ?? info.version ?? ''
    const key = `${name}@${version}`
    if (seen.has(key)) continue
    seen.set(key, {
      name,
      version,
      license: licenseOf(pkg, info),
      url: pkg.homepage ?? repoUrl(pkg.repository),
      author: authorName(pkg.author),
      text: licenseText(dir),
    })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

/** Assets bundled from outside npm. */
export const BUNDLED: LicenseEntry[] = [
  {
    name: 'Font Awesome Free (Solid font)',
    version: '6',
    license: 'OFL-1.1',
    url: 'https://fontawesome.com/license/free',
    author: 'Fonticons, Inc.',
    text: null,
  },
  {
    name: 'Material Design Icons (SVG paths)',
    version: '',
    license: 'Apache-2.0',
    url: 'https://github.com/google/material-design-icons',
    author: 'Google',
    text: null,
  },
]

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const out = resolve(root, 'src/features/settings')
  const entries = [...collect(root), ...BUNDLED]
  writeFileSync(resolve(out, 'licenses.gen.json'), JSON.stringify(entries, null, 1) + '\n')
  console.log(`gen-licenses: ${entries.length} entries -> src/features/settings/licenses.gen.json`)

  const ref = resolve(root, 'reference/wholphin')
  const upstreamPath = resolve(out, 'upstream.gen.json')
  if (existsSync(ref)) {
    const commit = git(ref, ['rev-parse', 'HEAD'])
    const upstream = {
      repository: 'https://github.com/damontecres/Wholphin',
      branch: git(ref, ['rev-parse', '--abbrev-ref', 'HEAD']),
      commit,
      commitDate: git(ref, ['log', '-1', '--format=%cI']),
    }
    writeFileSync(upstreamPath, JSON.stringify(upstream, null, 1) + '\n')
    console.log(`gen-licenses: upstream ${upstream.branch}@${commit?.slice(0, 7)}`)
  } else if (!existsSync(upstreamPath)) {
    writeFileSync(upstreamPath, JSON.stringify({ repository: 'https://github.com/damontecres/Wholphin', branch: null, commit: null, commitDate: null }, null, 1) + '\n')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
