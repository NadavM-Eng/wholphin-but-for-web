# Contributing

Wholphin Web is an unofficial web port of [Wholphin](https://github.com/damontecres/Wholphin), the Android TV client for Jellyfin. It is not affiliated with or endorsed by upstream. Questions about the Android app, or behavior that is the same there, belong in the upstream project.

Participants are expected to follow Jellyfin's [Code of Conduct](https://jellyfin.org/docs/general/community-standards/#code-of-conduct), as upstream does.

## Setup

Requires the Node version in `.nvmrc` (24).

```
npm ci
npm run dev
```

The dev server runs at the URL Vite prints. `npm run ts:up` starts a throwaway Jellyfin test server for local work; see `docs/TOOLING.md`.

## Conventions

- `CLAUDE.md` is the working agreement for this repository (rules, style, what not to touch). It applies to people as well as tools.
- `docs/ARCHITECTURE.md` describes how the code is organized. Follow it rather than inventing structure.
- Keep changes focused, and keep user-facing text in the string catalog.

## Before opening a pull request

Run these; CI runs the same four:

```
npm run typecheck
npm run test
npm run lint
npm run build
```

The end-to-end suite and screenshot crawler need a Jellyfin server and are run locally against the throwaway test server, not in CI.

## Licensing

By submitting a pull request you agree that, if it is accepted, your code is licensed under the [GPL-2.0](LICENSE), the same as upstream's contributing terms.

## AI-assisted contributions

Upstream follows the [Jellyfin LLM/"AI" Development Policy](https://jellyfin.org/docs/general/contributing/llm-policies/). The same expectation applies here: disclose AI assistance, understand and be able to explain your changes, and write the pull request description yourself.
