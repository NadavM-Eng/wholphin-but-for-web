// Provisions the throwaway Jellyfin test server (dev/testserver) through its HTTP API. Plain Node 24 ESM, no dependencies.
//
//   node tools/testserver/setup.mjs [provision]   idempotent: wizard, users, libraries, scan, seed state, collections, playlists
//   node tools/testserver/setup.mjs up|down|status
//   node tools/testserver/setup.mjs reset         wipe data/config + data/cache (keeps media), restart, re-provision
//   node tools/testserver/setup.mjs rescan        trigger a library scan and wait
//   node tools/testserver/setup.mjs verify        read-only checks as the `tester` user
//   node tools/testserver/setup.mjs guide [--force]   write a new Live TV guide when the server's copy is running out
//
// Credentials are generated once and stored in .env.local (TESTSRV_*); they are never printed.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureChapters, expectedSegments } from './segments.mjs';
import { buildGuideXml, GUIDE_CONTAINER_PATH } from './guide.mjs';
import { CONTAINER } from './lib.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPOSE = path.join(REPO, 'dev/testserver/docker-compose.yml');
const DATA = path.join(REPO, 'dev/testserver/data');
const ENV_FILE = path.join(REPO, '.env.local');
const URL_BASE = 'http://localhost:8097';
const log = (...a) => console.log('[testserver]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ .env.local
function readEnv() {
  const out = {};
  if (!existsSync(ENV_FILE)) return out;
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
function setEnv(key, value) {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text += (text && !text.endsWith('\n') ? '\n' : '') + `${key}=${value}\n`;
  writeFileSync(ENV_FILE, text);
}
const strongPassword = () => randomBytes(18).toString('base64url');
function ensureEnv() {
  const env = readEnv();
  const defaults = {
    TESTSRV_URL: URL_BASE, TESTSRV_ADMIN_USER: 'admin', TESTSRV_USER: 'tester', TESTSRV_USER2: 'Casey Rivera',
  };
  for (const [k, v] of Object.entries(defaults)) if (!env[k]) { setEnv(k, v); env[k] = v; }
  for (const k of ['TESTSRV_ADMIN_PASSWORD', 'TESTSRV_PASSWORD', 'TESTSRV_PASSWORD2']) if (!env[k]) { const v = strongPassword(); setEnv(k, v); env[k] = v; }
  return env;
}

// ------------------------------------------------------------------ HTTP
const CLIENT = 'Client="Wholphin Testserver", Device="setup-script", DeviceId="wholphin-testserver-setup", Version="1.0.0"';
async function api(method, p, { token, body, query, text, allow = [] } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])) : '';
  const headers = { Authorization: `MediaBrowser ${CLIENT}${token ? `, Token="${token}"` : ''}` };
  let payload;
  if (text !== undefined) { payload = text.data; headers['Content-Type'] = text.type; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const r = await fetch(URL_BASE + p + qs, { method, headers, body: payload });
  if (!r.ok && !allow.includes(r.status)) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  if (r.status === 204 || r.status === 202 && !r.headers.get('content-type')) return null;
  const ct = r.headers.get('content-type') ?? '';
  if (ct.includes('json')) return r.json();
  return null;
}

async function waitForServer(ms = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(URL_BASE + '/System/Info/Public');
      // While Jellyfin 10.11 starts (a fresh config after `reset`), its startup page already answers this address
      // and every other one with 503: the server is up only when another address stops saying 503.
      if (r.ok && (await fetch(URL_BASE + '/Users/Public')).status !== 503) return r.json();
    } catch { /* not up yet */ }
    await sleep(2000);
  }
  throw new Error('test Jellyfin did not come up on ' + URL_BASE);
}

const docker = (args, opts = {}) => spawnSync('docker', args, { stdio: 'inherit', ...opts });
const compose = (...args) => docker(['compose', '-f', COMPOSE, ...args]);

// ------------------------------------------------------------------ provisioning steps
async function wizard(env) {
  const info = await waitForServer();
  if (info.StartupWizardCompleted) return false;
  log('running startup wizard');
  await api('POST', '/Startup/Configuration', { body: { UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' } });
  await api('GET', '/Startup/User'); // initialises the default user record
  await api('POST', '/Startup/User', { body: { Name: env.TESTSRV_ADMIN_USER, Password: env.TESTSRV_ADMIN_PASSWORD } });
  await api('POST', '/Startup/RemoteAccess', { body: { EnableRemoteAccess: true, EnableAutomaticPortMapping: false } });
  await api('POST', '/Startup/Complete');
  return true;
}

async function login(name, password) {
  const r = await api('POST', '/Users/AuthenticateByName', { body: { Username: name, Pw: password } });
  return { token: r.AccessToken, userId: r.User.Id };
}

async function ensureApiKey(env, adminToken) {
  const valid = async (k) => { try { await api('GET', '/System/Info', { token: k }); return true; } catch { return false; } };
  if (env.TESTSRV_API_KEY && await valid(env.TESTSRV_API_KEY)) return;
  const list = await api('GET', '/Auth/Keys', { token: adminToken });
  let key = list.Items.find((k) => k.AppName === 'wholphin-web-tests');
  if (!key) { await api('POST', '/Auth/Keys', { token: adminToken, query: { app: 'wholphin-web-tests' } }); key = (await api('GET', '/Auth/Keys', { token: adminToken })).Items.find((k) => k.AppName === 'wholphin-web-tests'); }
  setEnv('TESTSRV_API_KEY', key.AccessToken);
  env.TESTSRV_API_KEY = key.AccessToken;
  log('api key stored in .env.local');
}

async function ensureUsers(env, adminToken) {
  const users = await api('GET', '/Users', { token: adminToken });
  const byName = new Map(users.map((u) => [u.Name.toLowerCase(), u]));
  const created = {};
  for (const [name, pw] of [[env.TESTSRV_USER, env.TESTSRV_PASSWORD], [env.TESTSRV_USER2, env.TESTSRV_PASSWORD2]]) {
    if (byName.has(name.toLowerCase())) continue;
    log('creating user', name);
    const u = await api('POST', '/Users/New', { token: adminToken, body: { Name: name, Password: pw } });
    created[name] = u;
    byName.set(name.toLowerCase(), u);
  }
  // user 2: parental limit (PG-13 and below, unrated blocked) and an avatar
  if (created[env.TESTSRV_USER2]) {
    const u = created[env.TESTSRV_USER2];
    const ratings = await api('GET', '/Localization/ParentalRatings', { token: adminToken });
    const pg13 = ratings.find((r) => r.Name === 'PG-13');
    const full = await api('GET', `/Users/${u.Id}`, { token: adminToken });
    const policy = { ...full.Policy, MaxParentalRating: pg13?.Value ?? 7, BlockUnratedItems: ['Movie', 'Series'], EnableContentDeletion: false };
    await api('POST', `/Users/${u.Id}/Policy`, { token: adminToken, body: policy });
    const avatar = path.join(DATA, 'avatars/casey.jpg');
    if (existsSync(avatar)) await api('POST', `/Users/${u.Id}/Images/Primary`, { token: adminToken, text: { type: 'image/jpeg', data: readFileSync(avatar).toString('base64') } });
    else log('avatar image missing; run gen-media.mjs extras first');
  }
  return Object.keys(created).length > 0;
}

async function ensureServerConfig(adminToken) {
  const cfg = await api('GET', '/System/Configuration', { token: adminToken });
  let dirty = false;
  if (cfg.QuickConnectAvailable !== true) { cfg.QuickConnectAvailable = true; dirty = true; }
  if (cfg.TrickplayOptions && cfg.TrickplayOptions.ScanBehavior !== 'Blocking') { cfg.TrickplayOptions.ScanBehavior = 'Blocking'; dirty = true; }
  if (cfg.LibraryMonitorDelay !== 5) { cfg.LibraryMonitorDelay = 5; dirty = true; }
  if (dirty) { await api('POST', '/System/Configuration', { token: adminToken, body: cfg }); log('server configuration updated (Quick Connect on)'); }
}

const NO_FETCH = (type) => ({ Type: type, MetadataFetchers: [], MetadataFetcherOrder: [], ImageFetchers: [], ImageFetcherOrder: [] });
const LIBRARIES = [
  { name: 'Movies', type: 'movies', path: '/media/Movies', trickplay: true, chapters: false, online: true },
  { name: 'Codec Zoo', type: 'movies', path: '/media/Codec Zoo', trickplay: true, chapters: true, types: ['Movie'] },
  { name: 'Shows', type: 'tvshows', path: '/media/Shows', trickplay: true, chapters: true, types: ['Series', 'Season', 'Episode'] },
  { name: 'Music', type: 'music', path: '/media/Music', trickplay: false, chapters: false, types: ['MusicArtist', 'MusicAlbum', 'Audio'] },
  { name: 'Photos', type: 'homevideos', path: '/media/Photos', trickplay: true, chapters: false, photos: true },
];

async function ensureLibraries(adminToken) {
  const existing = await api('GET', '/Library/VirtualFolders', { token: adminToken });
  const have = new Set(existing.map((f) => f.Name));
  let created = false;
  for (const lib of LIBRARIES) {
    if (have.has(lib.name)) continue;
    log('creating library', lib.name);
    const options = {
      Enabled: true, EnablePhotos: !!lib.photos, EnableRealtimeMonitor: false, EnableLUFSScan: false,
      EnableTrickplayImageExtraction: lib.trickplay, ExtractTrickplayImagesDuringLibraryScan: lib.trickplay, SaveTrickplayWithMedia: false,
      EnableChapterImageExtraction: lib.chapters, ExtractChapterImagesDuringLibraryScan: lib.chapters,
      PreferredMetadataLanguage: 'en', MetadataCountryCode: 'US', SaveLocalMetadata: false,
      LocalMetadataReaderOrder: ['Nfo'], PathInfos: [{ Path: lib.path }],
      ...(lib.types ? { TypeOptions: lib.types.map(NO_FETCH) } : {}),
    };
    await api('POST', '/Library/VirtualFolders', { token: adminToken, query: { name: lib.name, collectionType: lib.type, refreshLibrary: 'false' }, body: { LibraryOptions: options } });
    created = true;
  }
  return created;
}

async function ensureLiveTv(env, adminToken) {
  // Channels stream library items through Jellyfin itself (static stream), so no extra server is needed.
  const sources = ['H.264 AAC Baseline', 'Chapter Marathon', 'Big Buck Bunny', 'Coffee Run'];
  const names = [['101', 'Test News 24', 'News'], ['102', 'Cartoon Loop', 'Kids'], ['103', 'Nature Test', 'Documentary'], ['104', 'Movie Zoo', 'Movies']];
  const movies = await api('GET', '/Items', { token: adminToken, query: { recursive: 'true', includeItemTypes: 'Movie' } });
  const lines = ['#EXTM3U'];
  names.forEach(([n, name, grp], i) => {
    const m = movies.Items.find((x) => x.Name.includes(sources[i]));
    if (m) lines.push(`#EXTINF:-1 tvg-id="${n}" tvg-name="${name}" tvg-chno="${n}" group-title="${grp}",${name}`, `http://127.0.0.1:8096/Videos/${m.Id}/stream?static=true&api_key=${env.TESTSRV_API_KEY}`);
  });
  writeFileSync(path.join(DATA, 'media/LiveTV/channels.m3u'), lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  const cfg = await api('GET', '/System/Configuration/livetv', { token: adminToken });
  if (!cfg.TunerHosts?.some((t) => t.Url === '/media/LiveTV/channels.m3u')) {
    log('adding Live TV M3U tuner');
    await api('POST', '/LiveTv/TunerHosts', { token: adminToken, body: { Type: 'm3u', Url: '/media/LiveTV/channels.m3u', FriendlyName: 'Test M3U', ImportFavoritesOnly: false, AllowHWTranscoding: false, AllowStreamSharing: true, FallbackMaxStreamingBitrate: 30000000, EnableStreamLooping: true, IgnoreDts: true, TunerCount: 0 } });
  }
  if (!cfg.ListingProviders?.some((l) => l.Path === '/media/LiveTV/guide.xml')) {
    log('adding Live TV XMLTV guide');
    await api('POST', '/LiveTv/ListingProviders', { token: adminToken, query: { validateListings: 'false', validateLogin: 'false' }, body: { Type: 'xmltv', Path: '/media/LiveTV/guide.xml', EnableAllTuners: true, EnabledTuners: [], NewsCategories: ['News'], KidsCategories: ['Kids'], MovieCategories: ['Movies'], SportsCategories: [], ChannelMappings: [] } });
  }
  const ch = await api('GET', '/LiveTv/Channels', { token: adminToken });
  if (ch.TotalRecordCount === 0) {
    const tasks = await api('GET', '/ScheduledTasks', { token: adminToken });
    const g = tasks.find((t) => t.Key === 'RefreshGuide');
    if (g) { await api('POST', `/ScheduledTasks/Running/${g.Id}`, { token: adminToken }); await waitForScan(adminToken, 'guide refresh'); }
  }
  await renewGuide(adminToken);
}

// The guide is dated, so it runs out. "Reaches" = some program ends later than `hours` from now.
async function guideReaches(token, hours) {
  const r = await api('GET', '/LiveTv/Programs', { token, query: { minEndDate: new Date(Date.now() + hours * 3600000).toISOString(), limit: 1, enableTotalRecordCount: 'false' } });
  return (r?.Items ?? []).length > 0;
}

/** Writes a new guide into the container and has Jellyfin read it, unless the current one still reaches two days ahead. */
async function renewGuide(adminToken, force = false) {
  if (!force && await guideReaches(adminToken, 48)) { log('Live TV guide reaches two days ahead'); return; }
  log('writing a new Live TV guide');
  // through the container, so this works from any checkout (git worktrees have no dev/testserver/data of their own)
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'wholphin-guide-'));
  try {
    const file = path.join(tmp, 'guide.xml');
    writeFileSync(file, buildGuideXml());
    if (docker(['cp', file, `${CONTAINER}:${GUIDE_CONTAINER_PATH}`], { stdio: 'ignore' }).status !== 0) throw new Error('docker cp of the guide failed');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const tasks = await api('GET', '/ScheduledTasks', { token: adminToken });
  const g = tasks.find((t) => t.Key === 'RefreshGuide');
  if (!g) throw new Error('Refresh Guide task not found');
  await api('POST', `/ScheduledTasks/Running/${g.Id}`, { token: adminToken });
  await waitForScan(adminToken, 'guide refresh');
  if (!(await guideReaches(adminToken, 48))) throw new Error('the guide still does not reach two days ahead after the refresh');
  log('Live TV guide renewed');
}

async function waitForScan(adminToken, label = 'library scan') {
  log(`waiting for ${label}...`);
  await sleep(5000);
  const t0 = Date.now();
  let idleSeen = 0;
  while (Date.now() - t0 < 40 * 60000) {
    const tasks = await api('GET', '/ScheduledTasks', { token: adminToken, query: { isHidden: 'false' } });
    const running = tasks.filter((t) => t.State !== 'Idle');
    const folders = await api('GET', '/Library/VirtualFolders', { token: adminToken });
    const refreshing = folders.some((f) => f.RefreshStatus && f.RefreshStatus !== 'Idle');
    if (running.length === 0 && !refreshing) { if (++idleSeen >= 3) return; } else idleSeen = 0;
    await sleep(4000);
  }
  throw new Error('scan did not finish in 40 minutes');
}

async function startScan(adminToken) { await api('POST', '/Library/Refresh', { token: adminToken }); await waitForScan(adminToken); }

const items = (token, userId, query) => api('GET', `/Items`, { token, query: { userId, recursive: 'true', ...query } }).then((r) => r.Items);

async function seedUser(env) {
  const { token, userId } = await login(env.TESTSRV_USER, env.TESTSRV_PASSWORD);
  const resume = await api('GET', '/UserItems/Resume', { token, query: { userId, limit: 1 } });
  const favs = await items(token, userId, { filters: 'IsFavorite', limit: 1 });
  if (resume.Items.length && favs.length) { log('user state already seeded'); return; }
  log('seeding watch state for', env.TESTSRV_USER);

  const movies = await items(token, userId, { includeItemTypes: 'Movie', sortBy: 'SortName', fields: 'RunTimeTicks' });
  const byName = (n) => movies.find((m) => m.Name.toLowerCase().includes(n.toLowerCase()));
  const setData = (id, data) => api('POST', `/UserItems/${id}/UserData`, { token, query: { userId }, body: data });
  const played = (id) => api('POST', `/UserPlayedItems/${id}`, { token, query: { userId } });
  const fav = (id) => api('POST', `/UserFavoriteItems/${id}`, { token, query: { userId } });

  // resume points (20-70 % in)
  const resumeTargets = [['Sintel', 0.35], ['Tears of Steel', 0.6], ['Cosmos Laundromat', 0.2], ['Spring', 0.5], ['H.264 AAC Baseline', 0.4], ['HEVC 10-bit', 0.25], ['Multi Track', 0.3]];
  for (const [n, f] of resumeTargets) {
    const m = byName(n); if (!m?.RunTimeTicks) continue;
    await setData(m.Id, { PlaybackPositionTicks: Math.round(m.RunTimeTicks * f), Played: false, LastPlayedDate: new Date(Date.now() - (f * 1e8)).toISOString() });
  }
  for (const n of ['Big Buck Bunny', 'Coffee Run', 'Wing It', 'Charge', 'AV1 Opus']) { const m = byName(n); if (m) await played(m.Id); }

  // series state: next-up entries
  const series = await items(token, userId, { includeItemTypes: 'Series' });
  const episodes = async (s) => items(token, userId, { includeItemTypes: 'Episode', parentId: s.Id, sortBy: 'ParentIndexNumber,IndexNumber', fields: 'RunTimeTicks' });
  const plan = { 'Orbital Drift': { season: 1, upTo: 3 }, 'Detective Moth': { season: 2, upTo: 2, allBefore: true }, 'The Bakery on Elm Street': { season: 1, upTo: 2 }, 'Pixel Garden': { season: 1, upTo: 1 } };
  for (const s of series) {
    const p = plan[s.Name]; if (!p) continue;
    const eps = await episodes(s);
    let next = null;
    for (const e of eps) {
      if (e.ParentIndexNumber === 0) continue;
      const before = e.ParentIndexNumber < p.season && p.allBefore;
      const inSeason = e.ParentIndexNumber === p.season && e.IndexNumber <= p.upTo;
      if (before || inSeason) await played(e.Id);
      else if (!next && (e.ParentIndexNumber === p.season)) next = e;
    }
    if (s.Name === 'Pixel Garden' && next?.RunTimeTicks) await setData(next.Id, { PlaybackPositionTicks: Math.round(next.RunTimeTicks * 0.45), Played: false });
    if (s.Name === 'Orbital Drift') { await fav(s.Id); const e2 = eps.find((e) => e.ParentIndexNumber === 1 && e.IndexNumber === 2); if (e2) await fav(e2.Id); }
  }

  // favourites across types
  for (const n of ['Big Buck Bunny', 'Sintel', 'Elephants Dream', 'HEVC HDR10']) { const m = byName(n); if (m) await fav(m.Id); }
  const albums = await items(token, userId, { includeItemTypes: 'MusicAlbum', sortBy: 'SortName' });
  if (albums[0]) await fav(albums[0].Id);
  const people = await api('GET', '/Persons', { token, query: { userId, limit: 5 } });
  if (people.Items[0]) await fav(people.Items[0].Id);
  const artists = await api('GET', '/Artists', { token, query: { userId, limit: 1 } });
  if (artists.Items[0]) await fav(artists.Items[0].Id);
}

async function ensureCollectionsAndPlaylists(env) {
  const { token, userId } = await login(env.TESTSRV_USER, env.TESTSRV_PASSWORD);
  const admin = await login(env.TESTSRV_ADMIN_USER, env.TESTSRV_ADMIN_PASSWORD);
  const movies = await items(admin.token, admin.userId, { includeItemTypes: 'Movie' });
  const ids = (names) => names.map((n) => movies.find((m) => m.Name.toLowerCase().includes(n.toLowerCase()))?.Id).filter(Boolean);
  const boxes = await items(admin.token, admin.userId, { includeItemTypes: 'BoxSet' });
  const makeBox = async (name, parts) => {
    if (boxes.some((b) => b.Name === name)) return;
    const list = ids(parts); if (!list.length) return;
    log('creating collection', name);
    await api('POST', '/Collections', { token: admin.token, query: { name, ids: list.join(',') } });
  };
  await makeBox('Blender Open Movies', ['Big Buck Bunny', 'Sintel', 'Tears of Steel', 'Elephants Dream', 'Cosmos Laundromat']);
  await makeBox('Blender Shorts', ['Caminandes', 'Coffee Run', 'Wing It', 'Charge', 'Spring']);

  const lists = await items(token, userId, { includeItemTypes: 'Playlist' });
  const eps = await items(token, userId, { includeItemTypes: 'Episode', limit: 40, sortBy: 'SortName' });
  const tracks = await items(token, userId, { includeItemTypes: 'Audio', sortBy: 'Random', limit: 14 });
  if (!lists.some((l) => l.Name === 'Weekend Watchlist')) {
    const vids = [...ids(['Sintel', 'Spring', 'Wing It', 'Charge']), ...eps.slice(0, 4).map((e) => e.Id)];
    log('creating video playlist');
    await api('POST', '/Playlists', { token, body: { Name: 'Weekend Watchlist', Ids: vids, UserId: userId, MediaType: 'Video' } });
  }
  if (!lists.some((l) => l.Name === 'Late Night Mix') && tracks.length) {
    log('creating music playlist');
    await api('POST', '/Playlists', { token, body: { Name: 'Late Night Mix', Ids: tracks.map((t) => t.Id), UserId: userId, MediaType: 'Audio' } });
  }
}

// ------------------------------------------------------------------ verification
async function verify(env) {
  const { token, userId } = await login(env.TESTSRV_USER, env.TESTSRV_PASSWORD);
  const out = [];
  const check = (ok, label, extra = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) process.exitCode = 1; };
  const views = await api('GET', `/UserViews`, { token, query: { userId } });
  for (const v of views.Items.filter((x) => x.CollectionType !== 'livetv')) {
    const r = await api('GET', '/Items', { token, query: { userId, parentId: v.Id, recursive: 'true', limit: 1 } });
    check(r.TotalRecordCount > 0, `library "${v.Name}" (${v.CollectionType ?? 'mixed'}) lists items`, `${r.TotalRecordCount} items`);
  }
  const movies = await items(token, userId, { includeItemTypes: 'Movie', fields: 'Overview,ProviderIds' });
  const blender = movies.filter((m) => ['Big Buck Bunny', 'Sintel', 'Tears of Steel', 'Elephants Dream'].some((n) => m.Name.includes(n)));
  check(blender.length > 0 && blender.every((m) => m.ImageTags?.Primary && m.Overview), 'Blender movies have posters and overviews', `${blender.length} checked`);
  const resume = await api('GET', '/UserItems/Resume', { token, query: { userId } });
  check(resume.Items.length > 0, 'resume endpoint returns items', `${resume.Items.length}`);
  const nextUp = await api('GET', '/Shows/NextUp', { token, query: { userId } });
  check(nextUp.Items.length > 0, 'next-up endpoint returns items', `${nextUp.Items.length}`);
  const find = (n) => movies.find((m) => m.Name.includes(n));
  for (const n of ['H.264 AAC Baseline', 'HEVC 10-bit']) {
    const m = find(n);
    if (!m) { check(false, `PlaybackInfo for ${n}`, 'item missing'); continue; }
    const pb = await api('POST', `/Items/${m.Id}/PlaybackInfo`, { token, query: { userId }, body: { DeviceProfile: { Name: 'verify', MaxStreamingBitrate: 20000000, DirectPlayProfiles: [{ Container: 'mp4,webm', Type: 'Video', VideoCodec: 'h264,vp9,av1', AudioCodec: 'aac,mp3,opus' }], TranscodingProfiles: [{ Container: 'ts', Type: 'Video', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac', Context: 'Streaming' }] } } });
    check(pb.MediaSources?.length > 0, `PlaybackInfo for ${n}`, `${pb.MediaSources?.[0]?.Container} directplay=${pb.MediaSources?.[0]?.SupportsDirectPlay} transcode=${!!pb.MediaSources?.[0]?.TranscodingUrl}`);
  }
  const qc = await fetch(URL_BASE + '/QuickConnect/Enabled').then((r) => r.text());
  check(qc.trim() === 'true', 'QuickConnect/Enabled is true');
  const chans = await api('GET', '/LiveTv/Channels', { token, query: { userId } });
  check(chans.TotalRecordCount > 0, 'live TV channels exist', `${chans.TotalRecordCount}`);
  const guideOk = await guideReaches(token, 24);
  check(guideOk, 'Live TV guide reaches the next 24 hours', guideOk ? '' : 'renew it with: npm run ts:guide');
  const recFolders = await api('GET', '/LiveTv/Recordings/Folders', { token, query: { userId } });
  check((recFolders.Items ?? []).length > 0, 'a Live TV recordings folder exists', `${(recFolders.Items ?? []).length}`);
  const boxes = await items(token, userId, { includeItemTypes: 'BoxSet' });
  check(boxes.length >= 2, 'collections exist', `${boxes.length}`);
  const pls = await items(token, userId, { includeItemTypes: 'Playlist' });
  check(pls.length >= 2, 'playlists exist', `${pls.length}`);
  // image subtitles: listed in PlaybackInfo, and selecting one forces a burn-in transcode
  for (const [n, codec] of [['PGS Image Subtitles', 'PGSSUB'], ['VobSub Image Subtitles', 'DVDSUB']]) {
    const m = find(n);
    if (!m) { check(false, `${n} item`, 'missing'); continue; }
    const profile = { Name: 'verify', MaxStreamingBitrate: 20000000, DirectPlayProfiles: [{ Container: 'mp4,webm', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac' }], SubtitleProfiles: [{ Format: 'vtt', Method: 'External' }, { Format: 'srt', Method: 'External' }], TranscodingProfiles: [{ Container: 'ts', Type: 'Video', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac', Context: 'Streaming' }] };
    const pb = await api('POST', `/Items/${m.Id}/PlaybackInfo`, { token, query: { userId }, body: { SubtitleStreamIndex: 2, AudioStreamIndex: 1, MediaSourceId: m.Id, DeviceProfile: profile } });
    const subs = (pb.MediaSources?.[0]?.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle');
    check(subs.length === 2 && subs.every((s) => s.Codec.toUpperCase() === codec && !s.IsTextSubtitleStream), `${n}: two ${codec} bitmap streams in PlaybackInfo`, subs.map((s) => s.Codec).join(','));
    check(/SubtitleMethod=Encode/i.test(pb.MediaSources?.[0]?.TranscodingUrl ?? ''), `${n}: selecting a track means burn-in (SubtitleMethod=Encode)`);
  }
  // media segments for Orbital Drift season 1 (Chapter Segments Provider plugin)
  const segEps = await segmentEpisodes(token, userId);
  check(segEps.length === 6, 'Orbital Drift season 1 has 6 episodes', `${segEps.length}`);
  for (const e of segEps) {
    const want = expectedSegments(e.IndexNumber);
    const got = ((await api('GET', `/MediaSegments/${e.Id}`, { token })).Items ?? []).sort((a, b) => a.StartTicks - b.StartTicks);
    const ok = got.length === want.length && want.every((w, i) => got[i].Type === w.type && got[i].StartTicks === w.start * SEGMENT_TICKS && got[i].EndTicks === w.end * SEGMENT_TICKS);
    check(ok, `S1E${e.IndexNumber} segments`, got.map((s) => `${s.Type} ${s.StartTicks / SEGMENT_TICKS}-${s.EndTicks / SEGMENT_TICKS}s`).join(', '));
  }
  const admin = await login(env.TESTSRV_ADMIN_USER, env.TESTSRV_ADMIN_PASSWORD);
  const timers = await api('GET', '/LiveTv/Timers', { token: admin.token });
  check((timers.Items ?? []).length === 0, 'no Live TV timers', `${(timers.Items ?? []).length}`);
  console.log(out.join('\n'));
}


// ------------------------------------------------------------------ extra content the screenshot crawler needs
// (each step is idempotent and checks the server first)

/** An in-progress episode, so Continue watching / the episode resume scenes have one (Pixel Garden S1E2 at 45 %). */
async function ensureEpisodeResume(env) {
  const { token, userId } = await login(env.TESTSRV_USER, env.TESTSRV_PASSWORD);
  const resume = await api('GET', '/UserItems/Resume', { token, query: { userId, limit: 50, mediaTypes: 'Video' } });
  if (!resume.Items.some((i) => i.Type === 'Movie')) {
    // the movie resume scenes need one too (other test runs may have finished the seeded ones)
    const m = (await items(token, userId, { includeItemTypes: 'Movie', searchTerm: 'Sintel', fields: 'RunTimeTicks' }))[0];
    if (m?.RunTimeTicks) {
      log('adding a movie resume point:', m.Name);
      await api('POST', `/UserItems/${m.Id}/UserData`, { token, query: { userId }, body: { PlaybackPositionTicks: Math.round(m.RunTimeTicks * 0.35), Played: false, LastPlayedDate: new Date(Date.now() - 3600e3).toISOString() } });
    }
  }
  if (resume.Items.some((i) => i.Type === 'Episode')) { log('episode resume point present'); return; }
  const eps = await items(token, userId, { includeItemTypes: 'Episode', sortBy: 'SeriesSortName,ParentIndexNumber,IndexNumber', fields: 'RunTimeTicks' });
  const ep = eps.find((e) => e.SeriesName === 'Pixel Garden' && e.ParentIndexNumber === 1 && e.IndexNumber === 2) ?? eps.find((e) => e.RunTimeTicks && e.ParentIndexNumber > 0);
  if (!ep?.RunTimeTicks) { log('no episode to give a resume point'); return; }
  log('adding an episode resume point:', ep.SeriesName, `S${ep.ParentIndexNumber}E${ep.IndexNumber}`);
  await api('POST', `/UserItems/${ep.Id}/UserData`, { token, query: { userId }, body: { PlaybackPositionTicks: Math.round(ep.RunTimeTicks * 0.45), Played: false, LastPlayedDate: new Date().toISOString() } });
}

/** A generic mixed-content ("folders") library: a few photos and two clips in plain sub-folders (copied from Photos). */
const MIXED = { name: 'Mixed Folders', path: '/media/Mixed' };
async function ensureMixedLibrary(adminToken) {
  const dir = path.join(DATA, 'media/Mixed');
  const copies = [
    ['Photos/2024-07 Alpine Trip/alpine-01.jpg', 'Trip Snapshots/alpine-01.jpg'],
    ['Photos/2024-07 Alpine Trip/alpine-02.jpg', 'Trip Snapshots/alpine-02.jpg'],
    ['Photos/2024-07 Alpine Trip/alpine-03.jpg', 'Trip Snapshots/alpine-03.jpg'],
    ['Photos/Home Videos/Beach Day Clip.mp4', 'Clips/Beach Day Clip.mp4'],
    ['Photos/Home Videos/Birthday Cake Clip.mp4', 'Clips/More Clips/Birthday Cake Clip.mp4'],
  ];
  for (const [from, to] of copies) {
    const src = path.join(DATA, 'media', from);
    const dst = path.join(dir, to);
    if (existsSync(dst) || !existsSync(src)) continue;
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
  const existing = await api('GET', '/Library/VirtualFolders', { token: adminToken });
  if (existing.some((f) => f.Name === MIXED.name)) { log('mixed folders library present'); return false; }
  log('creating library', MIXED.name);
  const options = {
    Enabled: true, EnablePhotos: true, EnableRealtimeMonitor: false, EnableLUFSScan: false,
    EnableTrickplayImageExtraction: false, ExtractTrickplayImagesDuringLibraryScan: false, SaveTrickplayWithMedia: false,
    EnableChapterImageExtraction: false, ExtractChapterImagesDuringLibraryScan: false,
    PreferredMetadataLanguage: 'en', MetadataCountryCode: 'US', SaveLocalMetadata: false, PathInfos: [{ Path: MIXED.path }],
  };
  // no collectionType = "Mixed content" (the user view reports CollectionType "folders")
  await api('POST', '/Library/VirtualFolders', { token: adminToken, query: { name: MIXED.name, refreshLibrary: 'false' }, body: { LibraryOptions: options } });
  return true;
}

/**
 * Recordings: a "Recordings" library with a few small pre-made files, so the recordings tab, the recording folder
 * in the drawer and the recordings grid have something to show.
 *
 * NEVER schedule a real recording or timer here. The "live" streams are local files served as fast as the recorder
 * can read them, so a single timer can write tens of GB and fill the disk. Instead: copies of a 3.5 MB clip are put into Jellyfin's default recording folder, and
 * Jellyfin itself makes the "Recordings" library for that folder when it starts and finds it there.
 */
const RECORDING_DIR = '/config/data/livetv/recordings';
const RECORDING_SOURCE = '/media/Codec Zoo/H.264 AAC Baseline (2001)/H.264 AAC Baseline (2001).mp4';
const RECORDINGS = [['Morning Report', '2026_11_16_06_00_00'], ['Forest Floor', '2026_11_16_19_30_00'], ['Matinee Feature', '2026_11_17_14_00_00']];

/** Returns true when it added the recordings (the container was restarted; the library still has to be scanned). */
async function ensureRecordings(admin) {
  const pending = await api('GET', '/LiveTv/Timers', { token: admin.token });
  for (const t of pending.Items ?? []) {
    log('cancelling live tv timer left by an earlier run:', t.Name);
    await api('DELETE', `/LiveTv/Timers/${t.Id}`, { token: admin.token });
  }
  const q = (v) => `"${v}"`;
  const file = ([name, stamp]) => `${RECORDING_DIR}/${name}/${name} ${stamp}.mp4`;
  const sh = (cmd) => docker(['exec', CONTAINER, 'sh', '-c', cmd], { stdio: 'ignore' }).status === 0;
  const filesThere = sh(RECORDINGS.map((r) => `test -f ${q(file(r))}`).join(' && '));
  if (!filesThere) {
    log('adding', RECORDINGS.length, 'pre-made recordings (copies of a small clip; no timer, nothing is recorded)');
    const ok = sh(RECORDINGS.map((r) => `mkdir -p ${q(`${RECORDING_DIR}/${r[0]}`)} && cp -n ${q(RECORDING_SOURCE)} ${q(file(r))}`).join(' && '));
    if (!ok) throw new Error('could not place the pre-made recordings in the container');
  }
  const folders = await api('GET', '/LiveTv/Recordings/Folders', { token: admin.token, query: { userId: admin.userId } });
  const folderThere = (folders.Items ?? []).length > 0;
  if (!folderThere) {
    log('restarting the container so Jellyfin makes the Recordings library');
    docker(['restart', CONTAINER], { stdio: 'ignore' });
    await waitForServer();
  }
  if (filesThere && folderThere) log('live tv recordings present');
  return !filesThere || !folderThere;
}

// ------------------------------------------------------------------ media segments (Skip intro / outro / next up)
// Jellyfin core cannot create segments; they come from segment-provider plugins. "Chapter Segments Provider" (official, jellyfin
// repo) derives them from chapter names, which is cheap (no audio fingerprinting). Pinned to 4.0.0.0, the 10.11 build.
// Installed through Jellyfin's own package API (checksum-verified by the server) into this throwaway container only.
const SEGMENT_PLUGIN = { name: 'Chapter Segments Provider', guid: '698b6f33-14ca-49b5-9d79-fc3c0ab941f5', version: '4.0.0.0' };
const guidKey = (g) => String(g).replace(/-/g, '').toLowerCase();
const SEGMENT_TICKS = 1e7;

/** Installs the plugin if it is missing (restarts the container once so it loads). Returns true if it had to install. */
async function ensureSegmentPlugin(adminToken) {
  const active = async () => (await api('GET', '/Plugins', { token: adminToken })).some((p) => guidKey(p.Id) === guidKey(SEGMENT_PLUGIN.guid) && p.Version === SEGMENT_PLUGIN.version && p.Status === 'Active');
  if (await active()) return false;
  const have = (await api('GET', '/Plugins', { token: adminToken })).some((p) => guidKey(p.Id) === guidKey(SEGMENT_PLUGIN.guid) && p.Version === SEGMENT_PLUGIN.version);
  if (!have) {
    log(`installing plugin ${SEGMENT_PLUGIN.name} ${SEGMENT_PLUGIN.version}`);
    await api('POST', `/Packages/Installed/${encodeURIComponent(SEGMENT_PLUGIN.name)}`, { token: adminToken, query: { assemblyGuid: SEGMENT_PLUGIN.guid, version: SEGMENT_PLUGIN.version } });
    for (let i = 0; i < 60; i++) { // the server downloads it in the background
      if ((await api('GET', '/Plugins', { token: adminToken })).some((p) => guidKey(p.Id) === guidKey(SEGMENT_PLUGIN.guid))) break;
      await sleep(2000);
    }
  }
  log('restarting the container so the plugin loads');
  docker(['restart', 'wholphin-web-test-jellyfin']);
  await sleep(3000);
  await waitForServer();
  if (!(await active())) throw new Error('segment plugin did not become Active');
  return true;
}

const segmentEpisodes = async (token, userId) => (await items(token, userId, { includeItemTypes: 'Episode', fields: 'Chapters', sortBy: 'SortName' }))
  .filter((e) => e.SeriesName === 'Orbital Drift' && e.ParentIndexNumber === 1).sort((a, b) => a.IndexNumber - b.IndexNumber);
const chaptersOk = (e) => { const want = expectedSegments(e.IndexNumber); return (e.Chapters ?? []).filter((c) => /^(Recap|Intro|Credits|Preview)$/.test(c.Name)).length === want.length; };

/** Chapters in the Orbital Drift S1 files -> library knows them -> Media Segment Scan has produced the segments. */
async function ensureMediaSegments(admin) {
  const filesChanged = await ensureChapters(log);
  let eps = await segmentEpisodes(admin.token, admin.userId);
  const zoo = await items(admin.token, admin.userId, { includeItemTypes: 'Movie', searchTerm: 'Image Subtitles' });
  // Codec Zoo items added after the first seed: a server provisioned before them needs one scan to see them
  const dual = await items(admin.token, admin.userId, { includeItemTypes: 'Movie', searchTerm: 'Dual Audio Second Default' });
  if (filesChanged || zoo.length < 2 || dual.length < 1 || eps.length < 6 || !eps.every(chaptersOk)) {
    log('rescanning the library for new media / chapters');
    await startScan(admin.token);
    eps = await segmentEpisodes(admin.token, admin.userId);
    for (const e of eps.filter((x) => !chaptersOk(x))) { // a changed file that the scan did not re-probe
      await api('POST', `/Items/${e.Id}/Refresh`, { token: admin.token, query: { metadataRefreshMode: 'FullRefresh', imageRefreshMode: 'None', replaceAllMetadata: 'false', replaceAllImages: 'false' } });
    }
    await sleep(5000);
    eps = await segmentEpisodes(admin.token, admin.userId);
  }
  const missing = [];
  for (const e of eps) {
    const segs = await api('GET', `/MediaSegments/${e.Id}`, { token: admin.token });
    if ((segs.Items ?? []).length !== expectedSegments(e.IndexNumber).length) missing.push(e);
  }
  if (!missing.length) { log('media segments present'); return; }
  const tasks = await api('GET', '/ScheduledTasks', { token: admin.token });
  const task = tasks.find((t) => t.Name === 'Media Segment Scan');
  if (!task) throw new Error('Media Segment Scan task not found');
  log('running Media Segment Scan');
  await api('POST', `/ScheduledTasks/Running/${task.Id}`, { token: admin.token });
  await waitForScan(admin.token, 'media segment scan');
}

// ------------------------------------------------------------------ main
async function provision() {
  const env = ensureEnv();
  const up = compose('up', '-d');
  if (up.status !== 0) throw new Error('docker compose up failed');
  const wizardRan = await wizard(env);
  const admin = await login(env.TESTSRV_ADMIN_USER, env.TESTSRV_ADMIN_PASSWORD);
  await ensureApiKey(env, admin.token);
  const usersCreated = await ensureUsers(env, admin.token);
  await ensureServerConfig(admin.token);
  await ensureSegmentPlugin(admin.token);
  const libsCreated = await ensureLibraries(admin.token);
  if (libsCreated) await startScan(admin.token);
  if (existsSync(path.join(DATA, 'media/LiveTV/guide.xml'))) await ensureLiveTv(env, admin.token);
  await seedUser(env);
  await ensureCollectionsAndPlaylists(env);
  await ensureEpisodeResume(env);
  // a new sign-in with the same DeviceId revokes the previous token (ensureCollectionsAndPlaylists signed in again)
  const admin2 = await login(env.TESTSRV_ADMIN_USER, env.TESTSRV_ADMIN_PASSWORD);
  if (await ensureMixedLibrary(admin2.token)) await startScan(admin2.token);
  if (existsSync(path.join(DATA, 'media/LiveTV/guide.xml')) && await ensureRecordings(admin2)) await startScan(admin2.token);
  await ensureMediaSegments(admin2);
  log(wizardRan || usersCreated || libsCreated ? 'provisioning finished' : 'nothing to do (already provisioned)');
}

const mode = process.argv[2] ?? 'provision';
switch (mode) {
  case 'provision': await provision(); break;
  case 'up': compose('up', '-d'); await waitForServer(); log('up at', URL_BASE); break;
  case 'down': compose('down'); break;
  case 'status': docker(['ps', '--filter', 'name=wholphin-web-test-jellyfin', '--format', '{{.Names}} {{.Status}} {{.Ports}}']); break;
  case 'rescan': { const env = ensureEnv(); const a = await login(env.TESTSRV_ADMIN_USER, env.TESTSRV_ADMIN_PASSWORD); await startScan(a.token); break; }
  case 'verify': await verify(ensureEnv()); break;
  case 'guide': { const env = ensureEnv(); const a = await login(env.TESTSRV_ADMIN_USER, env.TESTSRV_ADMIN_PASSWORD); await renewGuide(a.token, process.argv.includes('--force')); break; }
  case 'reset': {
    compose('down');
    rmSync(path.join(DATA, 'config'), { recursive: true, force: true });
    for (const f of existsSync(path.join(DATA, 'cache')) ? readdirSync(path.join(DATA, 'cache')) : []) if (f !== 'gen') rmSync(path.join(DATA, 'cache', f), { recursive: true, force: true });
    for (const d of ['config', 'cache']) mkdirSync(path.join(DATA, d), { recursive: true });
    log('config wiped; media kept');
    await provision();
    break;
  }
  default: console.error('usage: setup.mjs [provision|up|down|status|rescan|verify|guide|reset]'); process.exit(2);
}
