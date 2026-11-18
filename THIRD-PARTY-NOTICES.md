# Third-party notices

Wholphin Web itself is licensed under the GNU General Public License, version 2 only (see [LICENSE](LICENSE)), with the additional permission in [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md). This file lists the third-party components that are distributed with it: the production dependencies of the web app and of the production server (`server/`), and two sets of assets that do not come from npm (an icon font and icon path data).

The list is written from `src/features/settings/licenses.gen.json`, which `npm run gen:licenses` (`tools/gen-licenses.ts`) builds from the production dependencies in `package-lock.json` plus the bundled assets. It covers the whole production dependency tree as npm installs it. The generator does not check which packages end up in the built files, so a few entries (for example the Node-side helpers of the API client's HTTP library) are installed but may not be part of what a browser downloads. The list reflects the lockfile at the time of writing; after a dependency update, regenerate the JSON and update this file by hand. The License page inside the app (Settings, then "Advanced Settings", then "License information") shows the same list, with the full licence text of each package that ships one.

Development tools (the build tool, the test runners, the linter and their dependencies) are not distributed with the app and are not listed.

## Summary

| Licence | Components |
|---|---|
| Apache License 2.0 | 3 |
| GNU Lesser General Public License 2.1 or later (with bundled parts under other licences) | 1 |
| Mozilla Public License 2.0 | 1 |
| SIL Open Font License 1.1 | 2 |
| MIT License | 47 |
| Total | 54 |

## Apache License 2.0

These are the three components that the additional permission in [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md) is about. hls.js plays HLS video streams, abslink is a dependency of jassub, and the Material Design icons are used as SVG path data.

| Component | Version | Licence | Project |
|---|---|---|---|
| abslink | 1.3.1 | Apache-2.0 | <https://github.com/ThaUnknown/abslink> |
| hls.js | 1.7.4 | Apache-2.0 | <https://github.com/video-dev/hls.js> |
| Material Design Icons (SVG paths) | not versioned | Apache-2.0 | <https://github.com/google/material-design-icons> |

## GNU Lesser General Public License 2.1 or later (with bundled parts under other licences)

jassub renders ASS/SSA subtitles with a WebAssembly build of libass. Its licence expression, as its package declares it, is shown in full.

| Component | Version | Licence | Project |
|---|---|---|---|
| jassub | 2.5.38 | LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND MIT-Modern-Variant AND ISC AND NTP AND Zlib AND BSL-1.0 | <https://github.com/ThaUnknown/jassub> |

## Mozilla Public License 2.0

The generated Jellyfin API client.

| Component | Version | Licence | Project |
|---|---|---|---|
| @jellyfin/sdk | 1.0.2 | MPL-2.0 | <https://github.com/jellyfin/jellyfin-sdk-typescript> |

## SIL Open Font License 1.1

Fonts. Upstream Wholphin bundles the Font Awesome Free solid font as well.

| Component | Version | Licence | Project |
|---|---|---|---|
| @fontsource-variable/roboto | 5.3.0 | OFL-1.1 | <https://fontsource.org/fonts/roboto> |
| Font Awesome Free (Solid font) | 6 | OFL-1.1 | <https://fontawesome.com/license/free> |

## MIT License

Everything else, including the libraries of the production server and the dependencies of the API client.

| Component | Version | Licence | Project |
|---|---|---|---|
| @hono/node-server | 2.1.9 | MIT | <https://github.com/honojs/node-server> |
| @remix-run/route-pattern | 0.22.1 | MIT | <https://github.com/remix-run/remix/tree/main/packages/route-pattern#readme> |
| @tanstack/query-core | 5.107.2 | MIT | <https://tanstack.com/query> |
| @tanstack/react-query | 5.107.2 | MIT | <https://tanstack.com/query> |
| @tanstack/react-virtual | 3.14.26 | MIT | <https://tanstack.com/virtual> |
| @tanstack/virtual-core | 3.19.11 | MIT | <https://tanstack.com/virtual> |
| agent-base | 6.0.2 | MIT | <https://github.com/TooTallNate/node-agent-base> |
| asynckit | 0.4.0 | MIT | <https://github.com/alexindigo/asynckit#readme> |
| axios | 1.21.1 | MIT | <https://axios-http.com> |
| call-bind-apply-helpers | 1.0.2 | MIT | <https://github.com/ljharb/call-bind-apply-helpers#readme> |
| clsx | 2.1.1 | MIT | <https://github.com/lukeed/clsx> |
| combined-stream | 1.0.8 | MIT | <https://github.com/felixge/node-combined-stream> |
| cookie-es | 3.1.1 | MIT | <https://github.com/unjs/cookie-es> |
| debug | 4.4.3 | MIT | <https://github.com/debug-js/debug> |
| delayed-stream | 1.0.0 | MIT | <https://github.com/felixge/node-delayed-stream> |
| dunder-proto | 1.0.1 | MIT | <https://github.com/es-shims/dunder-proto#readme> |
| es-define-property | 1.0.1 | MIT | <https://github.com/ljharb/es-define-property#readme> |
| es-errors | 1.3.0 | MIT | <https://github.com/ljharb/es-errors#readme> |
| es-object-atoms | 1.1.2 | MIT | <https://github.com/ljharb/es-object-atoms#readme> |
| es-set-tostringtag | 2.1.0 | MIT | <https://github.com/es-shims/es-set-tostringtag#readme> |
| follow-redirects | 1.16.3 | MIT | <https://github.com/follow-redirects/follow-redirects> |
| form-data | 4.0.6 | MIT | <https://github.com/form-data/form-data> |
| function-bind | 1.1.2 | MIT | <https://github.com/Raynos/function-bind> |
| get-intrinsic | 1.3.0 | MIT | <https://github.com/ljharb/get-intrinsic#readme> |
| get-proto | 1.0.1 | MIT | <https://github.com/ljharb/get-proto#readme> |
| gopd | 1.2.0 | MIT | <https://github.com/ljharb/gopd#readme> |
| has-symbols | 1.1.0 | MIT | <https://github.com/ljharb/has-symbols#readme> |
| has-tostringtag | 1.0.2 | MIT | <https://github.com/inspect-js/has-tostringtag#readme> |
| hasown | 2.0.4 | MIT | <https://github.com/inspect-js/hasOwn#readme> |
| hono | 4.13.19 | MIT | <https://hono.dev> |
| html-parse-stringify | 4.0.1 | MIT | <https://github.com/i18next/html-parse-stringify> |
| https-proxy-agent | 5.0.1 | MIT | <https://github.com/TooTallNate/node-https-proxy-agent> |
| i18next | 27.1.4 | MIT | <https://www.i18next.com> |
| lfa-ponyfill | 1.1.1 | MIT | <https://github.com/ThaUnknown/lfa-ponyfill> |
| libpgs | 0.9.0 | MIT | <https://github.com/Arcus92/libpgs-js> |
| math-intrinsics | 1.1.0 | MIT | <https://github.com/es-shims/math-intrinsics#readme> |
| mime-db | 1.52.0 | MIT | <https://github.com/jshttp/mime-db> |
| mime-types | 2.1.35 | MIT | <https://github.com/jshttp/mime-types> |
| ms | 2.1.3 | MIT | <https://github.com/vercel/ms> |
| proxy-from-env | 2.1.0 | MIT | <https://github.com/Rob--W/proxy-from-env#readme> |
| react | 19.3.1 | MIT | <https://react.dev/> |
| react-dom | 19.3.1 | MIT | <https://react.dev/> |
| react-i18next | 18.0.2 | MIT | <https://github.com/i18next/react-i18next> |
| react-router | 8.5.1 | MIT | <https://github.com/remix-run/react-router> |
| scheduler | 0.28.0 | MIT | <https://react.dev/> |
| throughput | 1.0.2 | MIT | <https://github.com/ThaUnknown/throughput#readme> |
| zustand | 5.1.0 | MIT | <https://github.com/pmndrs/zustand> |

## A dependency that was replaced

jassub depends on the npm package `rvfc-polyfill`, which is published under GPL-3.0. GPL-3.0 code cannot be distributed as part of a GPL-2.0-only work, and no permission that this project could add would change that. The project therefore does not ship that package. It ships its own small stand-in with the same name in `vendor/rvfc-polyfill`, written from the WICG `requestVideoFrameCallback` specification and licensed GPL-2.0-only like the rest of the project. The `overrides` entry in `package.json` makes npm install the stand-in wherever `rvfc-polyfill` is asked for, so the original package is not installed. Because the stand-in is project code, it is not in the list above.

## Not a dependency, but the origin

Wholphin Web is a port of [Wholphin](https://github.com/damontecres/Wholphin), which is licensed under the GNU General Public License, version 2. The interface texts and their translations, the colour themes and the behaviour of the app are derived from Wholphin's source.
