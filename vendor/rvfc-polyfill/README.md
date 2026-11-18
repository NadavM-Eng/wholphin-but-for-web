# rvfc-polyfill (Wholphin Web stand-in)

`jassub` imports `rvfc-polyfill` for its side effect. The published package is GPL-3.0, which cannot be
distributed in this GPL-2.0-only project, so `package.json` `overrides` points the name at this folder.

Written from the WICG `requestVideoFrameCallback` specification (not from the original package). It installs
`HTMLVideoElement.prototype.requestVideoFrameCallback` / `cancelVideoFrameCallback` only when the browser lacks
them; the fallback reports `mediaTime`, `width`, `height` (what jassub reads) from a `requestAnimationFrame` loop.
License: GPL-2.0-only, like the rest of the project.
