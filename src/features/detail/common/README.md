# src/features/detail/common — shared detail-page building blocks

Used by the movie / episode / box-set / playlist / person pages in `src/features/detail`, and meant for the
series pages and later waves (music, live TV). Import files directly. Upstream references are in each
file's header. Builds on `src/features/common` (cards, item menu, item actions); read its README first.

## Page pieces

| Need | Use |
|---|---|
| the item (full DTO, refetched on every mount, patched by the shared item actions) | `useDetailItem(id)` (`detailQueries.ts`); `/item/:id` already fetched it, pass the DTO down |
| header: logo/title, quick details + "Ends at", genres, stream chips, tagline, overview, "Directed by" | `<DetailHeader item variant="movie" \| "episode" \| "collection" chosen onOverview />` (75% / 60% widths on wide screens, full width on phones) |
| stream chips alone | `<StreamChips chosen versions />` |
| Play / Resume, Restart, Version, watched, favorite, trailers, Delete, More (upstream order and conditions) | `<DetailPlayButtons item onPlay(ms) onMore trailers canDelete onConfirmDelete navigate />`; `trailers = null` hides the trailer button (episodes), `[]` shows "No trailers" disabled |
| rows | `<PeopleRow>` (person menu: Go To, Favorite), `<ChaptersRow>` (click plays from the chapter), `<ExtrasRow>` (`groupExtras` from `extras.ts`), `<PosterItemsRow>` (SeasonCard rows; paged with `count` + `getItem`) |
| side data | `useLocalTrailers`, `useSpecialFeatures`, `useSimilarItems`, `usePeopleFavorites`, `usePagedItems(key, request, pageSize)` (upstream `ApiRequestPager`: pages fetched as indices render) |
| sort / filter / view options | browse's `SortButton`, `FilterButton` and `ViewOptionsDialog` (`src/features/browse/components`); the playlist page is a whole `LibraryGrid` |
| backdrop | `submitBackdrop(item)` from `src/app/backdrop` on open (person / playlist pages clear it) |
| theme music | `useThemeSong(itemId)` (`themeMusic.ts`): plays while mounted at the `playThemeMusic` volume; stops on unmount (so also when playback starts). Blocked autoplay retries once on the next click / key press |
| delete | `useCanDelete(item)` (manage-media pref + `CanDelete` + live TV policy for recordings) and `useDeleteAndGoBack()` (toast "Deleted", Back) |
| "Ends at" clock | `useMinuteClock()` |
| page column | `DetailPage.module.css` (`.page`, `.headerBlock`) |

## Chosen streams and the choosers

`useChosenStreams(item)` returns upstream's `ChosenStreams` (source, video, audio, subtitle and why each was
chosen) from the remembered choices in `src/stores/playbackChoices.ts` (owned by playback; do not edit it) and
the language / subtitle-mode preferences. It re-computes when a choice is saved.

- `<StreamChooserDialog item choice="version" | "audio" | "subtitles" />` saves through the store
  (`savePlayVersion`, `saveTrackSelection`; series items also save the season / series language choice).
- `hasSavedChoices(chosen)` gates "Clear track choices"; `clearChoices(item)` clears.
- Play navigates with `nav.play(id, { t })`; the player reads the remembered choice itself.

## App-wide item dialogs

`ItemDialogsHost` (rendered by every `useItemContextMenu().element`, only one instance is active) installs the
real handlers for the shared item menu: Media Information (`MediaInfoDialog`), Add to playlist
(`AddToPlaylistDialog`, with "Create new playlist"), Choose version / audio / subtitles and Clear track
choices. Open them from page code with `openItemDialog({ kind: 'mediaInfo', info: mediaInfoOf(item) })` etc.
(`itemDialogs.ts`). A dialog closes when the route changes.

## Playlists API

`playlists.ts`: `editablePlaylists`, `addToPlaylist` (sends the userId), `createPlaylist`, `canEditPlaylist`,
`playlistEntries` + `entryIdFor` (rows of `GET /Items?parentId=` carry no entry id), `removeFromPlaylist` and
`moveInPlaylist` (both by entry id).
