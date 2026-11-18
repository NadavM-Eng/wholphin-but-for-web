import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { RunReport, ShotEntry } from './types.ts'

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function summarize(entries: ShotEntry[]): RunReport['totals'] {
  const t = { shots: 0, ok: 0, warn: 0, error: 0, skipped: 0 }
  for (const e of entries) {
    if (e.status === 'skipped') t.skipped++
    else {
      t.shots++
      t[e.status]++
    }
  }
  return t
}

/** Manifest order (scene list order), then viewport and theme; scenes unknown to the manifest sort last by name. */
export function sortEntries(entries: ShotEntry[], order: string[] = []): ShotEntry[] {
  const idx = (n: string) => {
    const i = order.indexOf(n)
    return i < 0 ? order.length : i
  }
  return [...entries].sort(
    (a, b) => idx(a.scene) - idx(b.scene) || a.scene.localeCompare(b.scene) || a.viewport.localeCompare(b.viewport) || a.theme.localeCompare(b.theme),
  )
}

/** True when the run should fail under --strict. */
export function hasFailures(report: RunReport, warnings: boolean): boolean {
  return report.entries.some((e) => e.status === 'error' || (warnings && e.status === 'warn'))
}

export function writeReports(runDir: string, report: RunReport): void {
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(runDir, 'report.html'), reportHtml(report))
}

interface IssueGroup {
  kind: string
  severity: string
  message: string
  count: number
  scenes: Set<string>
}

function reportHtml(r: RunReport): string {
  const live = r.entries.filter((e) => e.status !== 'skipped')
  const skipped = r.entries.filter((e) => e.status === 'skipped')

  // identical issues across viewports/themes collapse into one row with a count
  const groups = new Map<string, IssueGroup>()
  for (const e of live) {
    for (const i of e.issues) {
      const key = `${i.kind}|${i.message}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { kind: i.kind, severity: i.severity, message: i.message, count: 0, scenes: new Set() }))
      g.count++
      g.scenes.add(e.scene)
    }
  }
  const sortedGroups = [...groups.values()].sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'error' ? -1 : 1))

  // per scene roll-up
  const perScene = new Map<string, { shots: number; err: number; warn: number; ms: number; kinds: Set<string> }>()
  for (const e of live) {
    const s = perScene.get(e.scene) ?? { shots: 0, err: 0, warn: 0, ms: 0, kinds: new Set() }
    s.shots++
    s.ms += e.ms
    if (e.status === 'error') s.err++
    if (e.status === 'warn') s.warn++
    for (const i of e.issues) s.kinds.add(i.kind)
    perScene.set(e.scene, s)
  }
  const slow = [...live].sort((a, b) => b.ms - a.ms).slice(0, 10)

  const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shots report ${esc(r.run)}</title>
<style>
:root{color-scheme:dark;--bg:#14121a;--fg:#e8e4ee;--mut:#9c97a6;--line:#2c2936;--ok:#6fcf97;--warn:#f2c94c;--err:#eb5757}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
main{max-width:1200px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.mut{color:var(--mut)}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{color:var(--mut);font-weight:500}.ok{color:var(--ok)}.warn{color:var(--warn)}.error{color:var(--err)}
.pills span{display:inline-block;margin-right:16px;font-size:18px}code{font:12px ui-monospace,monospace;word-break:break-all}
a{color:#b9a7ff}.tag{border:1px solid var(--line);border-radius:4px;padding:0 5px;font-size:12px}
</style></head><body><main>
<h1>Shots report <span class="mut">${esc(r.run)}</span></h1>
<p class="mut">${esc(r.server)} server &middot; ${esc(r.origin)} &middot; ${r.rtl ? 'RTL (he) &middot; ' : ''}${esc(r.startedAt)} &rarr; ${esc(r.finishedAt)} &middot;
<a href="index.html">contact sheet</a> &middot; <a href="report.json">report.json</a></p>
<p class="pills"><span>${r.totals.shots} pictures</span><span class="ok">${r.totals.ok} ok</span><span class="warn">${r.totals.warn} warn</span><span class="error">${r.totals.error} error</span><span class="mut">${r.totals.skipped} scenes skipped</span></p>

<h2>Issues (identical ones collapsed)</h2>
${sortedGroups.length === 0 ? '<p class="ok">No issues.</p>' : `<table><tr><th>Level</th><th>Kind</th><th>Message</th><th>Pictures</th><th>Scenes</th></tr>${sortedGroups
    .map((g) => row([`<span class="${g.severity}">${g.severity}</span>`, esc(g.kind), `<code>${esc(g.message)}</code>`, String(g.count), esc([...g.scenes].slice(0, 6).join(', ') + (g.scenes.size > 6 ? ` +${g.scenes.size - 6}` : ''))]))
    .join('')}</table>`}

<h2>Per scene</h2>
<table><tr><th>Scene</th><th>Pictures</th><th>Errors</th><th>Warnings</th><th>Avg ms</th><th>Issue kinds</th></tr>
${[...perScene.entries()]
  .sort((a, b) => b[1].err - a[1].err || b[1].warn - a[1].warn || a[0].localeCompare(b[0]))
  .map(([name, s]) =>
    row([esc(name), String(s.shots), s.err ? `<span class="error">${s.err}</span>` : '0', s.warn ? `<span class="warn">${s.warn}</span>` : '0', String(Math.round(s.ms / s.shots)), [...s.kinds].map((k) => `<span class="tag">${esc(k)}</span>`).join(' ')]),
  )
  .join('')}</table>

${skipped.length ? `<h2>Skipped scenes</h2><table>${skipped.map((e) => row([esc(e.scene), `<span class="mut">${esc(e.skipReason ?? '')}</span>`])).join('')}</table>` : ''}

<h2>Slowest pictures</h2>
<table>${slow.map((e) => row([esc(e.scene), esc(e.viewport), esc(e.theme), `${e.ms} ms`, `${e.requests} api calls`])).join('')}</table>

<h2>Every picture with issues</h2>
<table><tr><th>Scene</th><th>Viewport</th><th>Theme</th><th>Issues</th></tr>
${sortEntries(live.filter((e) => e.issues.length))
  .map((e) =>
    row([
      e.file ? `<a href="${esc(e.file)}">${esc(e.scene)}</a>` : esc(e.scene),
      esc(e.viewport),
      esc(e.theme),
      e.issues.map((i) => `<div><span class="${i.severity}">${esc(i.kind)}</span> <code>${esc(i.message)}</code></div>`).join(''),
    ]),
  )
  .join('')}</table>
</main></body></html>`
}
