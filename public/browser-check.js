// Loaded by index.html as a plain script file, before the application bundle. It is a file, not an inline script,
// because the production server's Content-Security-Policy (server/security.ts) allows scripts from the app's own
// origin only: an inline script is blocked there, and the notice would never show.
//
// Supported browsers: Chrome/Edge 119+, Firefox 128+, Safari 16.4+ (vite.config.ts BROWSER_TARGETS).
// Below that the stylesheets (relative colours, color-mix) and the bundle do not work: show a notice
// instead of a broken page. ES5 on purpose, no dependencies; src/app/startup.ts stops when the
// data-unsupported attribute is set.
(function () {
  var ok = false
  try {
    ok =
      !!window.CSS &&
      CSS.supports('color', 'rgb(from red r g b / 0.5)') &&
      CSS.supports('color', 'color-mix(in srgb, red, blue)') &&
      typeof ''.isWellFormed === 'function' &&
      typeof [].findLast === 'function' &&
      new RegExp('(?<=a)b').test('ab')
    // oxlint-disable-next-line no-unused-vars -- old browsers cannot parse a catch without a binding
  } catch (e) {
    ok = false
  }
  if (ok) return
  document.documentElement.setAttribute('data-unsupported', '')
  var box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;padding:24px;background:#121212;color:#e6e1e5;font:16px/1.5 system-ui,sans-serif;text-align:center'
  var h = document.createElement('h1')
  h.style.cssText = 'margin:0 0 12px;font-size:24px;font-weight:500'
  h.appendChild(document.createTextNode('This browser is too old for Wholphin Web'))
  var p = document.createElement('p')
  p.style.cssText = 'margin:0;max-width:480px;opacity:0.8'
  p.appendChild(
    document.createTextNode(
      'Please update to Chrome or Edge 119, Firefox 128, Safari 16.4 (iOS/iPadOS 16.4) or newer.',
    ),
  )
  box.appendChild(h)
  box.appendChild(p)
  document.body.appendChild(box)
})()
