# src/features/common — shared item plumbing

Everything a feature needs to show Jellyfin items the way the TV app does. Import from the files
directly (no barrel). Upstream references are in each file's header.

## Cards

| Need | Use |
|---|---|
| card props from a `BaseItemDto` | `bannerCardProps`, `gridCardProps`, `posterCardProps`, `personCardProps`, `chapterCardProps`, `genreCardProps`, `studioCardProps` (`cardAdapters.ts`) with `const ctx = useCardContext()` |
| click target | every adapter returns `href` (= `itemDestination(item)`); wire `onClick={linkClick(href)}` from `useLinkClick()` (`links.ts`) so a plain click navigates in-app and Ctrl/middle click opens a tab |
| image URL with upstream's selection rules | `useImageResolver()` (`imageResolver.ts`): `(item, 'Primary' / 'Thumb' / …, { heightDp | widthDp | widthCss, useSeries })` |
| overlay data (heart, watched, unplayed, progress, versions) | `cardOverlay(item)` |
| title / subtitle / header lines / corner pill / quick details | `itemText.ts` (`itemTitle`, `itemSubtitle`, `headerTitle`, `headerSubtitle`, `unplayedCornerText`, `quickDetailsFor` …) |
| row view options (`TALL`, `Fill_WIDTH`, `THUMB` …) | `viewOptions.ts` (`aspectValue`, `contentScaleFit`, `imageTypeOf`, `CARD_HEIGHT`) |
| logo URL for headers | `logoUrl(baseUrl, item)` (`logo.ts`) |

`useTranslate()` gives `{ t, locale }` with the plain `Translate` signature the pure helpers take.

## Context menu (long press)

```tsx
const menu = useItemContextMenu({ /* page defaults, e.g. showGoTo: false on a detail page */ })
<BannerCard {...props} {...menu.cardActions(item, { canRemoveNextUp: true })} />
{menu.element}   // once per page
```

`cardActions` wires right-click (menu at the pointer), the keyboard Menu key / Shift+F10 and touch
long-press (centered TV-style dialog) and the card's "more" button. Entries, order and conditions follow
`ContextMenu.kt` (`buildItemMenu` in `itemMenu.tsx`, unit-tested). Options per page: `showGoTo`,
`goToHref`, `showStreamChoices`, `canRemoveContinueWatching`, `canRemoveNextUp`, `removeFromPlaylist`,
`chosenSourceId`, `canClearChosenStreams`, `onDelete` (per open only: replaces the default delete after the
confirmation; detail pages pass their delete-toast-and-Back). Delete appears only with the "manage media"
preference, the item's `CanDelete` and (recordings) the Live TV management policy, and asks for confirmation.
Delete and the Choose audio / subtitles / version entries keep the menu open underneath their dialog
(`DialogItem.keepOpen`, upstream `dismissOnClick = false`).

Actions whose screens do not exist yet are placeholders that show a toast. The owning feature installs
the real one once, app-wide:

```ts
import { setItemMenuHandlers } from '../common/itemMenuHandlers'
setItemMenuHandlers({ addToPlaylist: openPlaylistDialog, showMediaInfo: openMediaInfo })
```

Handlers: `addToPlaylist`, `addToQueue`, `playMusic`, `showMediaInfo`, `sendMediaInfoLog`,
`chooseStream(item, 'audio' | 'subtitles' | 'version', onChosen)`, `clearTrackChoices`. Play / Resume / Restart /
Shuffle / "Play with" navigate to `nav.play` / `nav.playList`.

Installed by: `src/features/detail/common` (`addToPlaylist`, `showMediaInfo`, `chooseStream`; its `ItemDialogsHost`
is part of `menu.element`), `app/startup` (`clearTrackChoices`, and `sendMediaInfoLog`: `POST /ClientLog/Document`,
`detail/common/mediaReport.ts`, loaded on first use), `music/MusicHost` (`addToQueue`, `playMusic`).

Mouse hover that drives a header / backdrop / details pane goes through `hoverIntent.ts` (`useHoverIntent`, 250 ms,
the same delay as Home); keyboard focus and touch stay immediate.

## Mutations and cache

`useItemActions()` → `setFavorite`, `setPlayed`, `removeFromNextUp`, `deleteItem`. Each patches every
cached copy of the item at once (`patchItemInCaches`, works on any response shape: arrays, `{Items}`,
infinite pages, wrapper objects) and then invalidates only the queries that declared a dependency:

```ts
useQuery({ queryKey: qk('my', 'list'), meta: itemQueryMeta('played', 'favorite'), queryFn })
```

Tags: `played` (membership/order depends on watched state, e.g. Continue watching, "latest" with
hide-played), `favorite` (favorites lists), `nextUp` (next up), `deleted` (any list that can contain a
deletable item). A query without tags still gets the in-place field patches.

## Data helpers

- `libraries.ts`: `useLibraries()` (supported user views + Live TV recording folders, `NavDrawerService.getAllUserLibraries`), `findLibrary`, `kindForCollectionType`, `hasTvAccess`.
- `itemFields.ts`: upstream `fields=` sets (`SLIM_ITEM_FIELDS`, `HOME_ITEM_FIELDS`, `DETAIL_ITEM_FIELDS` …).
- `itemKinds.ts`: playable / shufflable / play-key kinds, supported collection types, `typeNameKey(kind)`.
- `displayPreferences.ts`: DisplayPreferences read-modify-write (client "Wholphin", shared with the TV app) and the removed-from-next-up map.
- `datePlayed.ts`: logical last-played time for the combined Continue Watching row (2 h cache).
- `genreImages.ts`: random backdrop per genre (2 h cache). `suggestions.ts`: library suggestions (computed on demand, cached per user in localStorage, refreshed after 12 h).
- `concurrency.ts`: `createLimiter(n)` / `mapLimited` (upstream `Semaphore`).
