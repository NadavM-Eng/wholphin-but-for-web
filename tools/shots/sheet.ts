import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { esc } from './report.ts'
import type { RunReport } from './types.ts'

/** Self-contained contact sheet: open index.html straight from disk (no server needed). */
export function writeContactSheet(runDir: string, report: RunReport): void {
  const entries = report.entries.filter((e) => e.file).map((e) => ({
    s: e.scene,
    g: e.group,
    v: e.viewport,
    t: e.theme,
    f: e.file,
    st: e.status,
    i: e.issues.map((x) => `${x.severity}: ${x.kind}: ${x.message}`),
  }))
  const viewports = [...new Set(entries.map((e) => e.v))]
  const themes = [...new Set(entries.map((e) => e.t))]
  const data = JSON.stringify({ entries, viewports, themes }).replace(/</g, '\\u003c')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shots ${esc(report.run)}</title>
<style>
:root{color-scheme:dark;--bg:#14121a;--fg:#e8e4ee;--mut:#9c97a6;--line:#2c2936;--ok:#6fcf97;--warn:#f2c94c;--err:#eb5757}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:#1b1824;border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center}
header h1{font-size:15px;margin:0}header label{color:var(--mut);font-size:13px}
select,input[type=search]{background:#241f30;color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font:inherit}
select[multiple]{height:auto}a{color:#b9a7ff}
section{padding:6px 16px 14px}h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:18px 0 6px}
.scene{margin:8px 0 18px}.scene h3{font-size:14px;margin:0 0 6px;font-weight:600}
.row{display:flex;flex-wrap:wrap;gap:10px}
figure{margin:0;width:var(--w,260px)}figure img{display:block;width:100%;height:auto;border:2px solid var(--line);border-radius:6px;background:#000;cursor:zoom-in}
figure.warn img{border-color:var(--warn)}figure.error img{border-color:var(--err)}
figcaption{font-size:11px;color:var(--mut);margin-top:2px}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;z-index:10;overflow:auto;padding:16px}
#lb.on{display:block}#lb img{max-width:none;display:block;margin:0 auto}#lb.fit img{max-width:100%}#lb .meta{max-width:1000px;margin:0 auto 10px;font-size:13px}
#lb .meta div{font-family:ui-monospace,monospace;font-size:12px;color:var(--warn)}
</style></head><body>
<header><h1>Shots ${esc(report.run)} <span style="color:var(--mut);font-weight:400">${esc(report.server)}${report.rtl ? ' &middot; RTL' : ''}</span></h1>
<label>Viewport <select id="fv" multiple size="4"></select></label>
<label>Theme <select id="ft" multiple size="4"></select></label>
<label>Scene <input id="fs" type="search" placeholder="filter by name"></label>
<label><input id="fi" type="checkbox"> issues only</label>
<label>Size <input id="fz" type="range" min="120" max="640" value="260"></label>
<span id="count" style="color:var(--mut)"></span>
<a href="report.html">health report</a></header>
<div id="root"></div><div id="lb"></div>
<script>
const D = ${data};
const $ = (id) => document.getElementById(id);
const fill = (el, vals, sel) => { for (const v of vals) { const o = document.createElement('option'); o.value = o.textContent = v; o.selected = sel.includes(v); el.appendChild(o) } };
fill($('fv'), D.viewports, D.viewports.slice(0, 1)); fill($('ft'), D.themes, D.themes.slice(0, 1));
const chosen = (el) => Array.from(el.selectedOptions).map((o) => o.value);
function render() {
  const vs = chosen($('fv')), ts = chosen($('ft')), q = $('fs').value.trim().toLowerCase(), only = $('fi').checked;
  document.documentElement.style.setProperty('--w', $('fz').value + 'px');
  const by = new Map(); let n = 0;
  for (const e of D.entries) {
    if ((vs.length && !vs.includes(e.v)) || (ts.length && !ts.includes(e.t))) continue;
    if (q && !e.s.toLowerCase().includes(q)) continue;
    if (only && e.st === 'ok') continue;
    const k = e.g + '||' + e.s; if (!by.has(k)) by.set(k, []); by.get(k).push(e); n++;
  }
  const root = $('root'); root.textContent = ''; let lastGroup = null, sec = null;
  for (const [k, list] of by) {
    const [g, s] = k.split('||');
    if (g !== lastGroup) { lastGroup = g; sec = document.createElement('section'); const h2 = document.createElement('h2'); h2.textContent = g; sec.appendChild(h2); root.appendChild(sec) }
    const wrap = document.createElement('div'); wrap.className = 'scene';
    const h = document.createElement('h3'); h.textContent = s; wrap.appendChild(h);
    const row = document.createElement('div'); row.className = 'row';
    for (const e of list) {
      const fig = document.createElement('figure'); fig.className = e.st;
      const img = document.createElement('img'); img.loading = 'lazy'; img.src = e.f; img.alt = s; img.onclick = () => open(e);
      const cap = document.createElement('figcaption'); cap.textContent = e.v + ' / ' + e.t + (e.i.length ? ' / ' + e.i.length + ' issue(s)' : '');
      fig.append(img, cap); row.appendChild(fig);
    }
    wrap.appendChild(row); sec.appendChild(wrap);
  }
  $('count').textContent = n + ' pictures';
}
function open(e) {
  const lb = $('lb'); lb.textContent = ''; lb.className = 'on fit';
  const m = document.createElement('div'); m.className = 'meta';
  m.textContent = e.s + '  -  ' + e.v + ' / ' + e.t + '  (click picture: toggle zoom, Esc: close)';
  for (const i of e.i) { const d = document.createElement('div'); d.textContent = i; m.appendChild(d) }
  const img = document.createElement('img'); img.src = e.f; img.onclick = (ev) => { ev.stopPropagation(); lb.classList.toggle('fit') };
  lb.append(m, img); lb.onclick = () => (lb.className = '');
}
addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('lb').className = '' });
for (const id of ['fv', 'ft', 'fs', 'fi', 'fz']) $(id).addEventListener('input', render);
render();
</script></body></html>`
  writeFileSync(path.join(runDir, 'index.html'), html)
}
