import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './devServer.ts'
import { REF_MAP } from './refmap.ts'
import { esc } from './report.ts'
import type { RunReport, ShotEntry } from './types.ts'

const REF_DIR = path.join(ROOT, 'refshots', 'out')

interface RefManifest {
  shots?: { file: string; description?: string; focus?: string | null; texts?: string[] }[]
}

function readManifest(): RefManifest {
  try {
    return JSON.parse(readFileSync(path.join(REF_DIR, 'manifest.json'), 'utf8').replace(/^﻿/, '')) as RefManifest
  } catch {
    return {}
  }
}

export const mappedScenes = () => [...new Set(REF_MAP.map((p) => p.scene))]

/**
 * Side-by-side sheet: reference (left) vs the web's TV-canvas scene (right). Both are 1920x1080 pictures of a
 * 960x540 dp canvas (1 dp = 2 px), so positions can be compared directly. No pixel diffing.
 */
export function writeCompareSheet(runDir: string, report: RunReport | null, theme: string, viewport = 'desktop-1920x1080'): string {
  const manifest = readManifest()
  const desc = new Map((manifest.shots ?? []).map((s) => [s.file, s]))
  const byScene = new Map<string, ShotEntry>()
  for (const e of report?.entries ?? []) if (e.viewport === viewport && e.theme === theme && e.file) byScene.set(e.scene, e)
  const paired = REF_MAP.filter((p) => byScene.has(p.scene)).length
  const dir = path.join(runDir, 'compare')
  mkdirSync(dir, { recursive: true })
  const rel = (abs: string) => path.relative(dir, abs).split(path.sep).join('/')

  const rows = REF_MAP.map((p) => {
    const refAbs = path.join(REF_DIR, p.ref)
    const web = byScene.get(p.scene)
    const d = desc.get(p.ref)
    const refCell = existsSync(refAbs)
      ? `<a href="${esc(rel(refAbs))}"><img loading="lazy" src="${esc(rel(refAbs))}" alt="reference ${esc(p.ref)}"></a>`
      : `<div class="missing">reference file missing: ${esc(p.ref)}</div>`
    const webCell = web?.file
      ? `<a href="${esc(rel(path.join(runDir, web.file)))}"><img loading="lazy" src="${esc(rel(path.join(runDir, web.file)))}" alt="web ${esc(p.scene)}"></a>`
      : `<div class="missing">no web picture for scene "${esc(p.scene)}" in this run</div>`
    return `<section><h2>${esc(p.scene)} <span class="mut">&larr; ${esc(p.ref)}</span></h2>
<p class="mut">${esc(d?.description ?? '')}${d?.focus ? ` &middot; focus: ${esc(d.focus)}` : ''}${p.note ? ` &middot; <b>note:</b> ${esc(p.note)}` : ''}${web?.issues.length ? ` &middot; <span class="warn">${web.issues.length} issue(s) in web shot</span>` : ''}</p>
<div class="pair"><figure>${refCell}<figcaption>Android TV reference</figcaption></figure><figure>${webCell}<figcaption>Web ${esc(viewport)} / ${esc(theme)}</figcaption></figure></div></section>`
  }).join('\n')

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compare ${esc(report?.run ?? '')}</title><style>
:root{color-scheme:dark}body{margin:0;padding:16px;background:#14121a;color:#e8e4ee;font:14px/1.4 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 2px}.mut{color:#9c97a6;font-weight:400}.warn{color:#f2c94c}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;height:auto;display:block;border:1px solid #2c2936;border-radius:4px;background:#000}
figcaption{font-size:12px;color:#9c97a6;margin-top:3px}.missing{border:1px dashed #5a5568;padding:40px 12px;text-align:center;color:#9c97a6;aspect-ratio:16/9}
@media(max-width:900px){.pair{grid-template-columns:1fr}}a{color:inherit}
</style></head><body><h1>Android TV reference vs web</h1>
<p class="mut">Left: refshots/out (emulator, 1920x1080 at density 2). Right: this run's TV-canvas scenes (tools/shots/tvScenes.ts: a 1920x1080 window at interface scale 2, so 1 dp = 2 px on both sides), theme ${esc(theme)} unless the scene sets its own. ${paired} of ${REF_MAP.length} reference pictures have a web picture in this run. Data, the clock and the web-only controls differ on purpose: see each note.
<a href="../index.html">contact sheet</a> &middot; <a href="../report.html">health report</a></p>
${rows}</body></html>`
  const out = path.join(dir, 'index.html')
  writeFileSync(out, html)
  return out
}
