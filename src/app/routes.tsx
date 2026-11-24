/*
 * Route table. Every upstream Destination (W/ui/nav/Destination.kt, spec 02 §2.1) mapped to a URL.
 * Build paths with `nav.*` from ./nav; pages are lazy default exports in src/features/<feature>/.
 *
 * | Path                              | Page (src/features/…)                 | Upstream Destination                    | Layout     |
 * |-----------------------------------|---------------------------------------|-----------------------------------------|------------|
 * | /setup/servers [?next]            | setup/ServerListPage                  | SetupDestination.ServerList             | setup      |
 * | /setup/users [?next]              | setup/UserListPage                    | SetupDestination.UserList(server)       | setup      |
 * | /setup/login [?username&mode&next]| setup/LoginPage                       | login dialog (SwitchUserContent)        | setup      |
 * | /                                 | home/HomePage                         | Home                                    | shell      |
 * | /home/row/:rowId [?position]      | home/MoreHomeRowPage                  | MoreHomeRow                             | shell      |
 * | /search [?q]                      | search/SearchPage                     | Search(query)                           | shell      |
 * | /favorites                        | browse/FavoritesPage                  | Favorites                               | shell      |
 * | /item/:itemId [?song]             | detail/MediaItemPage                  | MediaItem (page dispatches on type)     | shell      |
 * | /series/:itemId [?season&episode] | detail/SeriesOverviewPage             | SeriesOverview (season/episode = ids)   | shell      |
 * | /library/:itemId [?tab]           | browse/CollectionFolderPage           | MediaItem(CollectionFolder/UserView/Folder) | shell  |
 * | /library/:itemId/filtered [?type&filter&collectionType&recursive] | browse/FilteredCollectionPage | FilteredCollection | shell |
 * | /grid  (location state ItemGridState) | browse/ItemGridPage               | ItemGrid                                | shell      |
 * | /recordings/:itemId               | livetv/RecordingsPage                 | Recordings                              | shell      |
 * | /livetv                           | livetv/LiveTvPage                     | (Live TV collection, drawer entry)      | shell      |
 * | /discover                         | discover/DiscoverPage                 | Discover                                | shell      |
 * | /discover/more/:type              | discover/DiscoverMorePage             | DiscoverMoreResult                      | shell      |
 * | /discover/:mediaType/:tmdbId      | discover/DiscoveredItemPage           | DiscoveredItem                          | shell      |
 * | /home/settings                    | home/HomeSettingsPage                 | HomeSettings                            | fullscreen |
 * | /settings                         | settings/SettingsPage                 | Settings(BASIC)                         | fullscreen |
 * | /settings/subtitles [?hdr]        | settings/SubtitleSettingsPage         | SubtitleSettings(hdr)                   | fullscreen |
 * | /settings/topic/:topic            | settings/SettingsTopicPage            | (web: one subject of Settings; upstream's Advanced, Experimental and UserAppPreferences rows live here) | fullscreen |
 * | /settings/:screen                 | settings/SettingsPage                 | Settings(screen) (screensaver, skip_segments, hdr_formats; advanced, experimental and user redirect to their subjects) | fullscreen |
 * | /play/:itemId [?t&transcode&shuffle] | playback/PlaybackPage              | Playback (t = start ms)                 | fullscreen |
 * | /play/list/:itemId [?index&shuffle&recursive&sort&order&filter] | playback/PlaybackListPage | PlaybackList     | fullscreen |
 * | /now-playing                      | music/NowPlayingPage                  | NowPlaying                              | fullscreen |
 * | /slideshow/:parentId [?index&id&start&recursive&sort&order&filter] | photos/SlideshowPage | Slideshow             | fullscreen |
 * | /license                          | settings/LicensePage                  | License                                 | fullscreen |
 * | /debug                            | settings/DebugPage                    | Debug (no session needed: reachable from login failures) | fullscreen |
 * | /dev/login [?next&server=test]    | app/dev/DevLoginPage (DEV only)       | -                                       | -          |
 * | /dev/gallery                      | ui/gallery/GalleryPage (DEV only)     | -                                       | -          |
 * | *                                 | app/NotFoundPage                      | -                                       | -          |
 *
 * UpdateApp (Android self-update) has no web route.
 */
import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './AppShell'
import { FullScreenLayout, RequireSession, RootLayout, SetupLayout } from './layouts'
import { NotFoundPage } from './NotFoundPage'
import { RouteError } from './RouteError'

function page(load: () => Promise<{ default: ComponentType }>): Pick<RouteObject, 'lazy'> {
  return { lazy: { Component: async () => (await load()).default } }
}

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      { path: 'dev/login', ...page(() => import('./dev/DevLoginPage')) },
      { path: 'dev/gallery', ...page(() => import('../ui/gallery/GalleryPage')) },
    ]
  : []

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    // the first page is a lazy route: render nothing until its module arrives (same as before, minus the router warning)
    hydrateFallbackElement: <></>,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          {
            path: 'setup',
            element: <SetupLayout />,
            children: [
              { index: true, element: <Navigate to="/setup/servers" replace /> },
              { path: 'servers', ...page(() => import('../features/setup/ServerListPage')) },
              { path: 'users', ...page(() => import('../features/setup/UserListPage')) },
              { path: 'login', ...page(() => import('../features/setup/LoginPage')) },
            ],
          },
          {
            element: <RequireSession />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { index: true, ...page(() => import('../features/home/HomePage')) },
                  { path: 'home/row/:rowId', ...page(() => import('../features/home/MoreHomeRowPage')) },
                  { path: 'search', ...page(() => import('../features/search/SearchPage')) },
                  { path: 'favorites', ...page(() => import('../features/browse/FavoritesPage')) },
                  { path: 'item/:itemId', ...page(() => import('../features/detail/MediaItemPage')) },
                  { path: 'series/:itemId', ...page(() => import('../features/detail/SeriesOverviewPage')) },
                  { path: 'library/:itemId', ...page(() => import('../features/browse/CollectionFolderPage')) },
                  { path: 'library/:itemId/filtered', ...page(() => import('../features/browse/FilteredCollectionPage')) },
                  { path: 'grid', ...page(() => import('../features/browse/ItemGridPage')) },
                  { path: 'recordings/:itemId', ...page(() => import('../features/livetv/RecordingsPage')) },
                  { path: 'livetv', ...page(() => import('../features/livetv/LiveTvPage')) },
                  { path: 'discover', ...page(() => import('../features/discover/DiscoverPage')) },
                  { path: 'discover/more/:type', ...page(() => import('../features/discover/DiscoverMorePage')) },
                  { path: 'discover/:mediaType/:tmdbId', ...page(() => import('../features/discover/DiscoveredItemPage')) },
                ],
              },
              {
                element: <FullScreenLayout />,
                children: [
                  { path: 'home/settings', ...page(() => import('../features/home/HomeSettingsPage')) },
                  { path: 'settings', ...page(() => import('../features/settings/SettingsPage')) },
                  { path: 'settings/subtitles', ...page(() => import('../features/settings/SubtitleSettingsPage')) },
                  { path: 'settings/topic/:topic', ...page(() => import('../features/settings/SettingsTopicPage')) },
                  { path: 'settings/:screen', ...page(() => import('../features/settings/SettingsPage')) },
                  { path: 'play/:itemId', ...page(() => import('../features/playback/PlaybackPage')) },
                  { path: 'play/list/:itemId', ...page(() => import('../features/playback/PlaybackListPage')) },
                  { path: 'now-playing', ...page(() => import('../features/music/NowPlayingPage')) },
                  { path: 'slideshow/:parentId', ...page(() => import('../features/photos/SlideshowPage')) },
                  { path: 'license', ...page(() => import('../features/settings/LicensePage')) },
                ],
              },
            ],
          },
          {
            element: <FullScreenLayout />,
            children: [{ path: 'debug', ...page(() => import('../features/settings/DebugPage')) }],
          },
          ...devRoutes,
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
