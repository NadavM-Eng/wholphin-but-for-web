// Scene list. Each scene: { id, title, run(ctx) }. Shot files are refshots/out/<nn>-<id>[-suffix].png,
// where nn = 1-based position in this list (append new scenes at the END or numbers shift).
import { sleep } from './common.mjs';
import * as ui from './adbui.mjs';
import { setupFlow } from './setup.mjs';

export const SCENES = [];
const scene = (id, title, run) => SCENES.push({ id, title, run });

// ---------------------------------------------------------------------------------------------
// Setup flow (starts from wiped app data and ends signed in as the test user via Quick Connect)
// ---------------------------------------------------------------------------------------------
scene('setup', 'First run: add server, user list, server list, Quick Connect login', async (c) => {
  await setupFlow(c);
  c.signedIn = true;
});

// ---------------------------------------------------------------------------------------------
// Home + drawer
// ---------------------------------------------------------------------------------------------
scene('home', 'Home: top, a card focused, scrolled through several rows', async (c) => {
  await c.ensureSignedIn();
  await sleep(2500);
  await c.shot('top', 'Home at rest after launch: first card of the first row focused, header shows its details');
  await c.press('right*2');
  await c.shot('card-focused', 'Third card of the first row focused (header/backdrop follow focus)');
  for (let i = 2; i <= 6; i++) {
    await c.press('down');
    await c.shot('row-' + i, 'Home scrolled: row ' + i + ' focused');
  }
});

scene('nav-drawer', 'Navigation drawer expanded (LEFT from content)', async (c) => {
  await c.ensureSignedIn();
  await c.press('left', 'wait:600');
  await c.shot('expanded', 'Drawer expanded on Home: Home item focused, content shifted right');
  await c.press('down*3', 'wait:1200');
  await c.shot('library-focused', 'Drawer expanded with a library item focused');
  await c.press('down*9', 'wait:1500');
  await c.shot('settings-focused', 'Drawer expanded, Settings (bottom item) focused');
  await c.press('up*13', 'wait:1500');
  await c.shot('profile-focused', 'Drawer expanded, profile item (switch user) focused');
});

// ---------------------------------------------------------------------------------------------
// Libraries: landing page + every tab
// ---------------------------------------------------------------------------------------------
async function libraryTabs(c, lib, tabs) {
  await c.openDrawer(lib, { waitText: tabs[0] });
  await c.shot(slug(tabs[0]), lib + ' landing page (' + tabs[0] + ' tab)');
  for (const t of tabs.slice(1)) {
    await c.tab(t);
    await c.shot(slug(t), lib + ' / ' + t + ' tab');
  }
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

scene('library-movies', 'Movies library: Recommended / Library / Collections / Genres', (c) => libraryTabs(c, 'Movies', ['Recommended', 'Library', 'Collections', 'Genres']));
scene('library-codec-zoo', 'Codec Zoo (second movie library) landing page', (c) => libraryTabs(c, 'Codec Zoo', ['Recommended', 'Library']));
scene('library-shows', 'Shows library tabs', (c) => libraryTabs(c, 'Shows', ['Recommended', 'Library', 'Genres', 'Studios']));
scene('library-music', 'Music library tabs', (c) => libraryTabs(c, 'Music', ['Recommended', 'Albums', 'Artists', 'Genres', 'Songs']));

// ---------------------------------------------------------------------------------------------
// Library grid dialogs
// ---------------------------------------------------------------------------------------------
scene('library-grid-dialogs', 'Movies > Library grid: sort / filter / view-options dialogs, alphabet picker', async (c) => {
  await c.openDrawer('Movies', { waitText: 'Library' });
  await c.tab('Library');
  await c.shot('grid', 'Movies library grid, first card focused, toolbar (sort, filter, view options, random, play, shuffle) and alphabet scroller');
  await c.toolbar(0); await c.press('enter', 'wait:1200');
  await c.shot('sort-dialog', 'Sort dialog (sort-by choices + direction)');
  await c.back();
  await c.toolbar(1); await c.press('enter', 'wait:1200');
  await c.shot('filter-dialog', 'Filter dialog');
  await c.back();
  await c.toolbar(2); await c.press('enter', 'wait:1200');
  await c.shot('view-options', 'View options dialog (card size, image type, spacing...)');
  await c.back();
  await c.press('down', 'wait:700', 'right*6', 'wait:900', 'down*12', 'wait:900');
  await c.shot('alphabet-focused', 'Alphabet picker with letter M focused');
  await c.press('enter', 'wait:1500');
  await c.shot('alphabet-jumped', 'After choosing a letter the grid jumps to it');
});

// ---------------------------------------------------------------------------------------------
// Movie detail
// ---------------------------------------------------------------------------------------------
async function openMovie(c, lib, name) {
  await c.openDrawer(lib, { waitText: 'Library' });
  await c.tab('Library');
  await c.focus(name);
  await c.press('enter');
  ui.trail.push('(open ' + name + ')');
  await sleep(2500);
}
/**
 * Detail pages: the button row (Play/Resume, [Restart], watched, favorite, streams, more). The focused button expands
 * to show its label, so geometry shifts: count buttons from the unfocused layout and walk with RIGHT presses.
 * Focus must be on the first button (it is on page entry). Returns the number of buttons.
 */
function detailButtonCount(c) {
  const row = ui.dump().filter((n) => n.focusable && n.h > 60 && n.h < 130 && n.y1 > 450 && n.y2 < 800 && n.x1 >= 140 && n.cls.endsWith('View'));
  return row.length;
}
scene('movie-detail', 'Movie detail page (Big Buck Bunny): top, buttons, dialogs, scrolled through each row', async (c) => {
  await openMovie(c, 'Movies', 'Big Buck Bunny');
  const n = detailButtonCount(c);
  await c.shot('top', 'Movie detail (Big Buck Bunny): Play focused');
  await c.press('right', 'wait:700');
  await c.shot('watched-focused', 'Detail button row: second button (watched toggle) focused, shows its label');
  await c.press('right', 'wait:700');
  await c.shot('favorite-focused', 'Detail button row: favorite focused');
  await c.press('right', 'wait:700', 'enter', 'wait:1500');
  await c.shot('trailer-dialog', 'Detail: trailers dialog (film icon button; lists local/remote trailers)');
  await c.back();
  await c.press('right', 'wait:700', 'enter', 'wait:1500');
  await c.shot('more-menu', 'Detail: more (three dots) context menu');
  await c.back();
  await c.press('left*4', 'wait:500');
  await c.scrollThrough('page', 'Movie detail, Big Buck Bunny', { max: 8, first: false });
});
scene('movie-versions', 'Movie with two versions (Elephants Dream): version chooser', async (c) => {
  await openMovie(c, 'Movies', 'Elephants Dream');
  await c.shot('top', 'Detail page of a movie with 2 versions');
  await c.press('right', 'wait:700');
  await c.shot('version-focused', 'Version button focused (only shown when an item has several versions)');
  await c.press('enter', 'wait:1500');
  await c.shot('version-dialog', 'Version chooser dialog (two versions: 720p / 480p)');
  await c.back();
  await c.press('right*3', 'wait:700', 'enter', 'wait:1500');
  await c.shot('trailer-dialog', 'Trailers dialog (film icon button)');
});
scene('movie-tracks', 'Multi Track Showcase: More menu with Choose Audio / Choose Subtitles dialogs', async (c) => {
  await openMovie(c, 'Codec Zoo', 'Multi Track Showcase');
  const n = detailButtonCount(c);
  await c.shot('top', 'Detail of Multi Track Showcase (3 audio tracks, many subtitles); trailer button disabled');
  await c.press('right*' + (n - 1), 'wait:700', 'enter', 'wait:1500');
  await c.shot('more-menu', 'More menu on an item with several audio/subtitle tracks (Choose Audio / Choose Subtitles entries)');
  if (await c.focus(/Choose Audio/i, { maxSteps: 10 }).then(() => true, () => false)) {
    await c.press('enter', 'wait:1500');
    await c.shot('choose-audio', 'Choose Audio dialog');
    await c.back();
  }
  if (await c.focus(/Choose Subtitles/i, { maxSteps: 10 }).then(() => true, () => false)) {
    await c.press('enter', 'wait:1500');
    await c.shot('choose-subtitles', 'Choose Subtitles dialog (embedded, ASS, forced, external)');
    await c.back();
  }
  if (await c.focus(/Media Information/i, { maxSteps: 10 }).then(() => true, () => false)) {
    await c.press('enter', 'wait:1500');
    await c.shot('media-info', 'Media Information dialog (container, video, audio and subtitle streams)');
  }
});
scene('context-menu', 'Long-press context menu on a card (Movies library grid)', async (c) => {
  await c.openDrawer('Movies', { waitText: 'Library' });
  await c.tab('Library');
  await c.press('right', 'wait:600', 'long:enter', 'wait:1500');
  await c.shot('grid-card', 'Long-press (hold Enter) on a movie card in the library grid');
  await c.back();
  await c.fresh();
  await c.press('long:enter', 'wait:1500');
  await c.shot('home-card', 'Long-press on the first Home card (go-to / mark watched / etc.)');
});

// ---------------------------------------------------------------------------------------------
// Series / episode / person / collection / playlist / favorites / search
// ---------------------------------------------------------------------------------------------
scene('series-detail', 'Series detail (Orbital Drift): top and scrolled through each row', async (c) => {
  await openMovie(c, 'Shows', 'Orbital Drift');
  await c.scrollThrough('page', 'Series detail, Orbital Drift', { max: 8 });
});
scene('series-overview', 'Series overview: season tabs + episode strip', async (c) => {
  await openMovie(c, 'Shows', 'Orbital Drift');
  await c.press('down', 'wait:800', 'right', 'wait:600');
  await c.shot('seasons-row', 'Series detail with the Season 1 card focused');
  await c.press('enter', 'wait:3000');
  await c.shot('top', 'Series overview opened from a season card: season tabs on top, episode strip, episode details');
  await c.press('right', 'wait:900');
  await c.shot('episode-2', 'Series overview, second episode focused');
  await c.scrollThrough('page', 'Series overview', { max: 5, first: false });
  await c.press('up*6', 'wait:600');
  await c.press('right', 'wait:900');
  await c.shot('season-tab', 'Series overview with the season tab row focused / another season');
});
scene('episode-detail', 'Episode context menu in the overview strip (EpisodeDetails page itself is unreachable)', async (c) => {
  await openMovie(c, 'Shows', 'Orbital Drift');
  await c.press('down', 'wait:800', 'right', 'wait:600', 'enter', 'wait:3000');
  await c.press('long:enter', 'wait:1500');
  await c.shot('menu', 'Long-press context menu on an episode card in the series overview strip (Play, playlist, watched, favorite, Go to series, Media Information...)');
  await c.back();
  // Upstream only shows EpisodeDetails for episodes without seasonId/seriesId; every normal episode click opens the series overview.
  c.skip('EpisodeDetails page is not reachable through normal navigation (see series-overview shots)');
});
scene('person', 'Person page (cast member from a movie detail)', async (c) => {
  await openMovie(c, 'Movies', 'Big Buck Bunny');
  await c.press('down', 'wait:900');
  await c.press('right*2', 'wait:900');
  await c.press('enter', 'wait:3000');
  await c.shot('top', 'Person page: bio + filmography');
  await c.scrollThrough('page', 'Person page', { max: 5, first: false });
});
scene('collection', 'Collections library and a collection (box set) page', async (c) => {
  await c.openDrawer('Collections');
  await c.shot('library', 'Collections library landing');
  await c.press('enter', 'wait:3000');
  await c.shot('page', 'Collection page: header + items');
  await c.scrollThrough('page', 'Collection page', { max: 5, first: false });
});
scene('playlist', 'Playlists library and a playlist page', async (c) => {
  await c.openDrawer('Playlists');
  await c.shot('library', 'Playlists library landing');
  await c.press('enter', 'wait:3000');
  await c.shot('page', 'Playlist page');
  await c.scrollThrough('page', 'Playlist page', { max: 5, first: false });
});
scene('favorites', 'Favorites page: one tab per item type', async (c) => {
  await c.openDrawer('Favorites');
  await c.shot('movies', 'Favorites, Movies tab (a tabbed grid page, not rows)');
  for (const t of ['TV Shows', 'Episodes', 'People', 'Albums', 'Artists']) {
    await c.tab(t);
    await c.shot(slug(t), 'Favorites, ' + t + ' tab');
  }
});
scene('search', 'Search: empty and with results', async (c) => {
  await c.openDrawer('Search');
  await c.shot('empty', 'Search page, empty query');
  await c.press('right', 'wait:900');
  await c.shot('field-focused', 'Search page, focus moved into the content area');
  await c.press('enter', 'wait:1800');
  await c.shot('keyboard', 'Search field activated: on-screen keyboard');
  await c.press('text:bunny', 'wait:1200');
  await c.shot('typed', 'Query typed');
  await c.press('enter', 'wait:4000');
  await c.shot('results', 'Search results for "bunny"');
  await c.scrollThrough('page', 'Search results', { max: 4, first: false });
});
scene('settings-main', 'Settings: main screen', async (c) => {
  await c.openDrawer('Settings');
  await c.scrollThrough('page', 'Settings main', { key: 'down*5', max: 14 });
});

// ---------------------------------------------------------------------------------------------
// Settings sub-screens
// ---------------------------------------------------------------------------------------------
/** From the settings screen: focus an entry by label, open it, shoot, go back. Missing entries are recorded, not fatal. */
async function visit(c, label, suffix, description, { scrollKey = 'down', after } = {}) {
  try {
    await c.focus(label, { maxSteps: 70 });
  } catch (e) {
    console.log('  -- entry not found: ' + label);
    c.manifest.failures[c.scene.id + ':' + suffix] = 'entry not found: ' + label;
    return false;
  }
  await c.press('enter', 'wait:1500');
  await c.shot(suffix, description);
  if (after) await after();
  await c.back();
  // text dialogs need a second Back (keyboard first); make sure we are on the list again
  if (!c.has(label)) await c.back();
  return true;
}
scene('settings-sub', 'Settings: first-level sub-screens and dialogs', async (c) => {
  await c.openDrawer('Settings');
  await visit(c, 'Subtitle style', 'subtitle-style', 'Subtitle style editor');
  await visit(c, 'Application Theme', 'theme-dialog', 'Application theme choice dialog');
  await visit(c, 'Screensaver settings', 'screensaver', 'Screensaver settings screen');
  await visit(c, 'Customize home page', 'home-customize', 'Customize home page screen');
  await visit(c, 'Customize Navigation Drawer Items', 'nav-pins', 'Navigation drawer pins dialog');
  await visit(c, 'User interface language', 'language', 'User interface language dialog');
  await visit(c, /User Profile Settings|More user profile settings/, 'user-profile', 'User profile settings');
  await visit(c, 'Installed version', 'version', 'Installed version dialog');
  await visit(c, 'Advanced Settings', 'advanced', 'Advanced settings screen');
});

// ---------------------------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------------------------
/** Start playback from a detail page (Play is focused on entry) and wait for the player UI/video to run. */
async function startPlayback(c, waitMs = 6000) {
  await c.press('enter');
  ui.trail.push('(start playback)');
  await sleep(waitMs);
}
scene('playback-movie', 'Playback of Big Buck Bunny: overlay, seek bar, dialogs', async (c) => {
  await openMovie(c, 'Movies', 'Big Buck Bunny');
  await startPlayback(c, 9000);
  c.fast = true;
  try {
    await c.shot('playing', 'Playback running, controls hidden', { timeout: 100 });
    await c.press('enter', 'wait:900');
    await c.shot('controls', 'Playback controls visible (play/pause focused), progress bar, title');
    await c.press('up', 'wait:700');
    await c.shot('seekbar', 'Seek bar focused (trickplay preview when available)');
    await c.press('right*4', 'wait:900');
    await c.shot('seekbar-scrub', 'Seek bar scrubbing forward: preview thumbnail and target time');
    await c.press('down', 'wait:700');
    await c.press('left*3', 'wait:600', 'enter', 'wait:1000');
    await c.shot('settings-dialog', 'Gear dialog: playback speed / video scale / max bitrate / debug info');
    await c.press('enter', 'wait:1000');
    await c.shot('speed-dialog', 'Playback speed list');
    await c.back();
    await c.press('down', 'wait:600');
    await c.shot('settings-dialog-2', 'Gear dialog with the second entry focused');
    await c.press('enter', 'wait:1000');
    await c.shot('scale-dialog', 'Video scale list');
    await c.back(2);
    await c.press('right*6', 'wait:600', 'enter', 'wait:1000');
    await c.shot('captions-dialog', 'Captions dialog (no subtitle tracks in this file)');
    await c.back();
    await c.press('right', 'wait:600', 'enter', 'wait:1000');
    await c.shot('audio-dialog', 'Audio dialog');
    await c.back();
    await c.press('left*4', 'wait:600', 'enter', 'wait:1000');
    await c.shot('paused', 'Paused with the controls visible');
  } finally { c.fast = false; }
});

scene('playback-chapters', 'Playback of Chapter Marathon: chapters row', async (c) => {
  await openMovie(c, 'Codec Zoo', 'Chapter Marathon');
  await startPlayback(c, 8000);
  c.fast = true;
  try {
    await c.press('enter', 'wait:900');
    await c.shot('controls', 'Controls with the Chapters header below the buttons');
    await c.press('down', 'wait:1000');
    await c.shot('chapters', 'Chapters row open (chapter thumbnails, current chapter focused)');
    await c.press('right*2', 'wait:800');
    await c.shot('chapters-2', 'Chapters row, third chapter focused');
  } finally { c.fast = false; }
});

scene('playback-episode', 'Playback of an episode: queue row, next-up countdown', async (c) => {
  await openMovie(c, 'Shows', 'Orbital Drift');
  await c.press('down', 'wait:800', 'right', 'wait:600', 'enter', 'wait:3000');
  await c.press('down', 'wait:800', 'enter');
  ui.trail.push('(start playback of S1 E1)');
  await sleep(6000);
  c.fast = true;
  try {
    await c.press('enter', 'wait:900');
    await c.shot('controls', 'Episode playback controls: title / S01E01 line, seek bar');
    await c.press('down', 'wait:1000');
    await c.shot('queue', 'Queue row (upcoming episodes) below the controls');
    await c.press('up', 'wait:700');
    await c.press('ff', 'wait:1500');
    await c.shot('skipped-forward', 'After a fast-forward key press (skip forward 30s) near the end of the 30s episode');
    await sleep(2500);
    await c.shot('next-up', 'Next Up panel with countdown at the end of the episode', { timeout: 100 });
    await sleep(4000);
    await c.shot('next-up-2', 'Next Up panel a few seconds later (countdown lower)', { timeout: 100 });
  } finally { c.fast = false; }
});

// ---------------------------------------------------------------------------------------------
// Music + photos
// ---------------------------------------------------------------------------------------------
scene('music-album', 'Music: album page and now-playing', async (c) => {
  await c.openDrawer('Music', { waitText: 'Albums' });
  await c.tab('Albums');
  await c.shot('albums', 'Music albums grid');
  await c.focus('After Hours');
  await c.press('enter', 'wait:3000');
  await c.shot('album', 'Album page: track list');
  await c.press('enter', 'wait:4000');
  await c.shot('after-play', 'After pressing Enter on the first focused control of the album page');
  await c.press('down', 'wait:800');
  await c.shot('after-play-2', 'Album page, next control focused');
});
scene('music-artist', 'Music: artist page', async (c) => {
  await c.openDrawer('Music', { waitText: 'Artists' });
  await c.tab('Artists');
  await c.shot('artists', 'Music artists grid');
  await c.press('enter', 'wait:3000');
  await c.shot('artist', 'Artist page');
  await c.scrollThrough('page', 'Artist page', { max: 4, first: false });
});
scene('now-playing', 'Music now-playing page (drawer "Now playing" item)', async (c) => {
  await c.openDrawer('Music', { waitText: 'Albums' });
  await c.tab('Albums');
  await c.focus('After Hours');
  await c.press('enter', 'wait:3000');
  await c.press('enter', 'wait:5000'); // Play on the album page: music plays in the background
  await c.press('left', 'wait:1000', 'up*20', 'wait:1500', 'down', 'wait:1200');
  await c.shot('drawer-now-playing', 'Drawer with the Now playing item focused (only exists while music plays)');
  await c.press('enter', 'wait:3000');
  await c.shot('page', 'Now playing page: cover, title, progress and controls');
  await c.press('down', 'wait:900');
  await c.shot('page-2', 'Now playing page, next control focused');
  await c.scrollThrough('queue', 'Now playing page', { max: 4, first: false });
});
scene('library-photos', 'Photos library, album and slideshow', async (c) => {
  await c.openDrawer('Photos');
  await c.shot('landing', 'Photos (home videos) library landing');
  await c.press('enter', 'wait:3000');
  await c.shot('album', 'Photo album grid');
  await c.press('enter', 'wait:3000');
  await c.shot('viewer', 'Photo viewer / slideshow page');
  await c.press('right', 'wait:2000');
  await c.shot('viewer-2', 'Photo viewer, next photo');
  await c.press('enter', 'wait:1500');
  await c.shot('viewer-3', 'Photo viewer after Enter (controls)');
});

// ---------------------------------------------------------------------------------------------
// More settings screens
// ---------------------------------------------------------------------------------------------
scene('settings-subtitle-style', 'Settings > Subtitle style editor, scrolled', async (c) => {
  await c.openDrawer('Settings');
  await c.focus('Subtitle style', { maxSteps: 30 });
  await c.press('enter', 'wait:1500');
  await c.scrollThrough('page', 'Subtitle style editor', { key: 'down*5', max: 6 });
});
scene('settings-advanced', 'Settings > Advanced and its sub-screens', async (c) => {
  await c.openDrawer('Settings');
  await c.focus('Advanced Settings', { maxSteps: 40 });
  await c.press('enter', 'wait:1500');
  await c.scrollThrough('page', 'Advanced settings', { key: 'down*5', max: 8 });
  for (const [label, suffix] of [['Skip behavior', 'skip'], ['Playback Backend', 'backend'], ['Quick Connect', 'quick-connect'], ['License information', 'license'], [/experimental/i, 'experimental-confirm']]) {
    await visit(c, label, suffix, 'Advanced > ' + label);
  }
});
scene('settings-home-customize', 'Settings > Customize home page and its pages', async (c) => {
  await c.openDrawer('Settings');
  await c.focus('Customize home page', { maxSteps: 30 });
  await c.press('enter', 'wait:2000');
  await c.shot('top', 'Customize home page');
  await visit(c, 'Add row', 'add-row', 'Add row page');
  await visit(c, 'Display presets', 'presets', 'Display presets');
  await visit(c, 'Source', 'source', 'Source');
  await c.press('down*3', 'wait:800');
  await c.press('enter', 'wait:1500');
  await c.shot('row-settings', 'A home row selected: row settings');
});

// ---------------------------------------------------------------------------------------------
// Color themes (Settings > Application Theme). Settings is a drawer-free page: Back returns to Home.
// Ends by restoring Purple.
// ---------------------------------------------------------------------------------------------
async function setTheme(c, name) {
  await c.openDrawer('Settings', { fresh: false });
  await c.focus('Application Theme', { maxSteps: 40 });
  await c.press('enter', 'wait:1200');
  await c.focus(name, { maxSteps: 12 });
  await c.press('enter', 'wait:1500');
}
scene('themes', 'Home in each of the 8 color themes; detail page in Black and Bold Blue', async (c) => {
  await c.ensureSignedIn();
  for (const t of ['Blue', 'Green', 'Orange', 'Bold Blue', 'Black', 'Red', 'Brown', 'Purple']) {
    await setTheme(c, t);
    await c.shot('settings-' + slug(t), 'Settings page in the ' + t + ' theme');
    await c.back();
    await sleep(2500);
    await c.shot('home-' + slug(t), 'Home screen, ' + t + ' theme');
    if (t === 'Bold Blue' || t === 'Black') {
      await openMovie(c, 'Movies', 'Big Buck Bunny');
      await c.shot('detail-' + slug(t), 'Movie detail, ' + t + ' theme');
      await c.fresh();
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Live TV (test server: 4 synthetic channels 101-104 with generated guide data; never press Record anywhere)
// ---------------------------------------------------------------------------------------------
scene('live-tv', 'Live TV: drawer entry, guide (scrolled in time and channels), program dialogs, view options, DVR Schedule + Recordings (empty), live playback', async (c) => {
  await c.ensureSignedIn();
  await c.press('left', 'wait:900', 'down*4', 'wait:1200');
  await c.shot('drawer-entry', 'Nav drawer expanded with the Live TV entry focused');
  await c.press('enter', 'wait:4000');
  await c.waitFor('Guide', { timeout: 20000 });
  await sleep(1500);
  await c.shot('guide', 'Live TV > Guide tab: program airing now focused (header shows title, time, description), channel column, time ruler');
  await c.press('right*3', 'wait:900');
  await c.shot('guide-program-focused', 'Guide: a later program focused on the first channel (header follows focus)');
  await c.press('right*4', 'wait:900');
  await c.shot('guide-scrolled-right', 'Guide scrolled right in time (the time ruler and programs moved)');
  await c.press('right*10', 'wait:1200');
  await c.shot('guide-scrolled-right-2', 'Guide scrolled much further right in time');
  await c.press('down', 'wait:900');
  await c.shot('guide-channel-2', 'Guide: second channel, far right in time');
  await c.press('down*3', 'wait:1200');
  await c.shot('guide-channel-4', 'Guide scrolled down to the last channel');
  await c.press('left*14', 'wait:1200');
  await c.shot('guide-back-left', 'Guide scrolled back left in time on the last channel');
  // program dialog for a future program (first channel, later in time); only opened and photographed
  await c.press('up*3', 'wait:900');
  await c.press('enter', 'wait:1500');
  await c.shot('program-dialog-future', 'Program dialog for a program that has not started yet (nothing activated)');
  await c.back();
  await c.press('left*3', 'wait:1200');
  await c.shot('guide-now', 'Guide: scrolled back to the program airing now');
  await c.press('enter', 'wait:1500');
  await c.shot('program-dialog-now', 'Program dialog for a program airing now (Watch live + record actions; nothing activated)');
  await c.back();
  await c.press('up', 'wait:800');
  await c.shot('view-options-button', 'View options button focused above the guide grid');
  await c.press('enter', 'wait:1500');
  await c.shot('view-options', 'Guide view options dialog (favorite channels first, sort by recently watched, color-code, show details)');
  await c.back();
  await c.press('up*2', 'wait:900');
  await c.shot('tabs', 'Live TV tab row focused: Guide, DVR Schedule, Recordings');
  await c.tab('DVR Schedule');
  await c.shot('dvr-schedule', 'DVR Schedule tab (no timers: empty state)');
  await c.tab('Recordings');
  await c.shot('recordings', 'Recordings tab (the test server already has recorded items from earlier work, so it is NOT empty: one Headline Hour folder card)');
  await c.tab('Guide');
  await c.press('down*3', 'wait:900', 'enter', 'wait:1500');
  await c.shot('program-dialog-now-2', 'Program dialog on another channel (airing now)');
  if (!/Watch live/i.test(ui.focusInfo()?.label || '')) await c.focus('Watch live'); // never activate a record action
  await c.press('enter');
  ui.trail.push('(Watch live)');
  await sleep(7000);
  c.fast = true;
  try {
    await c.shot('playing', 'Live channel playing, overlay hidden', { timeout: 100 });
    await c.press('enter', 'wait:900');
    await c.shot('player-overlay', 'Live TV player with the overlay visible', { timeout: 100 });
    await c.press('down', 'wait:900');
    await c.shot('player-overlay-2', 'Live TV player overlay, focus moved down', { timeout: 100 });
  } finally { c.fast = false; }
  await c.back(2);
  await sleep(1500);
  await c.shot('after-back', 'Back from live playback');
});

// ---------------------------------------------------------------------------------------------
// Media segments (Orbital Drift S1: Intro 4-14 s and Outro 21-30 s on every episode, from the Chapter Segments Provider
// plugin). Skip behavior defaults (Intro/Outro = "Ask to skip") already show the buttons. The test clips carry a burned-in
// time stamp, so the shots show where in the clip they were taken. Episodes are ~30 s: polling the UI tree costs ~4 s.
// ---------------------------------------------------------------------------------------------
/** Poll the UI tree until some text matches; returns true on success, false after timeoutMs. */
async function pollText(c, re, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (c.has(re)) return true;
  }
  return false;
}
scene('segments', 'Playback of Orbital Drift S1E1 with media segments: Skip Intro button, after skipping, Skip Outro / Next Up near the end', async (c) => {
  await openMovie(c, 'Shows', 'Orbital Drift');
  await c.press('down', 'wait:800', 'right', 'wait:600', 'enter', 'wait:3500'); // Season 1 episode list
  await c.press('down', 'wait:800');
  await c.shot('episodes', 'Season 1 episode list (Play focused) before starting E1');
  c.fast = true;
  try {
    await c.press('enter');
    ui.trail.push('(start playback of S1E1)');
    if (!(await pollText(c, /Skip Intro/i, 40000))) c.skip('Skip Intro button never appeared');
    await c.shot('skip-intro-button', 'Playback of S1E1 inside the intro segment (4-14 s): "Skip Intro" button bottom right', { timeout: 100 });
    await c.press('enter', 'wait:1200');
    await c.shot('after-skip-intro', 'Just after activating Skip Intro: playback jumped to the end of the intro (~14 s)', { timeout: 100 });
    const outro = await pollText(c, /Skip (Outro|Credits)/i, 30000);
    await c.shot(outro ? 'skip-outro-button' : 'no-outro-button', outro ? '"Skip Outro" button during the outro segment (21-30 s)' : 'Outro segment time: no skip button found', { timeout: 100 });
    if (outro) {
      await sleep(1500);
      await c.shot('outro-later', 'A moment later in the outro (button still shown?)', { timeout: 100 });
    }
    // let the episode run out: Next Up card with countdown
    const nextUp = await pollText(c, /Next|Up next|Play now|Cancel/i, 25000);
    await c.shot('next-up', nextUp ? 'Next Up card at the end of the episode' : 'End of the episode (no Next Up text found)', { timeout: 100 });
    await sleep(2500);
    await c.shot('next-up-2', 'A few seconds later (countdown lower or next episode started)', { timeout: 100 });
  } finally { c.fast = false; }
});

// ---------------------------------------------------------------------------------------------
// Image (bitmap) subtitles: Codec Zoo "PGS Image Subtitles" (24 s, English + Spanish PGS tracks; cues at 2-6, 8-12, 14-18,
// 20-24 s). The server burns image subtitles in (transcode), so the first frames take a while.
// ---------------------------------------------------------------------------------------------
scene('image-subtitles', 'PGS Image Subtitles item: Choose Subtitles dialog, playback with a subtitle on screen, in-player captions dialog', async (c) => {
  await openMovie(c, 'Codec Zoo', 'PGS Image Subtitles');
  const n = detailButtonCount(c);
  await c.shot('top', 'Detail of the PGS Image Subtitles item');
  await c.press('right*' + (n - 1), 'wait:700', 'enter', 'wait:1500');
  await c.shot('more-menu', 'More menu of the PGS item');
  await c.focus(/Choose Subtitles/i, { maxSteps: 10 });
  await c.press('enter', 'wait:1500');
  await c.shot('choose-subtitles', 'Choose Subtitles dialog listing the PGS (bitmap) tracks, English and Spanish');
  await c.focus(/English/i, { maxSteps: 10 });
  await c.press('enter', 'wait:1500');
  await c.shot('subtitle-selected', 'After choosing the English PGS track (dialog closed)');
  await c.press('left*' + (n - 1), 'wait:600');
  await c.press('enter');
  ui.trail.push('(start playback with the English PGS track)');
  await sleep(6000);
  c.fast = true;
  try {
    for (let i = 1; i <= 7; i++) {
      await c.shot('play-' + i, 'Playback frame ' + i + ' (about 2.5 s apart; frames where a cue is due show the burned-in bitmap subtitle)', { timeout: 100 });
      await sleep(1500);
    }
    await c.press('enter', 'wait:900');
    await c.shot('controls', 'Player controls visible on the PGS item', { timeout: 100 });
    await c.press('right*3', 'wait:700', 'enter', 'wait:1200');
    await c.shot('captions-dialog', 'In-player captions dialog listing the PGS tracks (selected one marked)', { timeout: 100 });
  } finally { c.fast = false; }
});

export default SCENES;
