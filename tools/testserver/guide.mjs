// The throwaway server's Live TV guide (XMLTV). The guide is plain dates, so it runs out: it is written for
// GUIDE_DAYS from six hours before "now", and `node tools/testserver/setup.mjs guide` writes a new one when the
// copy on the server no longer reaches far enough (the e2e global setup calls that by itself).
import { esc } from './lib.mjs';

export const GUIDE_CHANNELS = [['101', 'Test News 24', 'News'], ['102', 'Cartoon Loop', 'Kids'], ['103', 'Nature Test', 'Documentary'], ['104', 'Movie Zoo', 'Movies']];
const PROGRAMS = { News: ['Morning Report', 'Market Watch', 'Headline Hour', 'World Tonight'], Kids: ['Pixel Playtime', 'Garden Adventures', 'Story Corner', 'Sing Along'], Documentary: ['Tides of Time', 'Forest Floor', 'Deep Blue', 'Night Sky'], Movies: ['Matinee Feature', 'Cult Classic', 'Prime Feature', 'Late Show'] };

/** Jellyfin loads at most its configured guide days (7 by default); one more keeps the last loaded day full. */
export const GUIDE_DAYS = 8;
/** Path of the guide inside the container (dev/testserver/data/media on the host). */
export const GUIDE_CONTAINER_PATH = '/media/LiveTV/guide.xml';

export function buildGuideXml(now = new Date()) {
  const NL = String.fromCharCode(10);
  const fmt = (d) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
  const start = new Date(now); start.setUTCMinutes(0, 0, 0); start.setUTCHours(start.getUTCHours() - 6);
  const x = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="wholphin-testserver">'];
  for (const [n, name] of GUIDE_CHANNELS) x.push(`  <channel id="${n}"><display-name>${esc(name)}</display-name></channel>`);
  for (const [n, , grp] of GUIDE_CHANNELS) {
    for (let i = 0; i < GUIDE_DAYS * 48; i++) {
      const s = new Date(start.getTime() + i * 30 * 60000), e = new Date(s.getTime() + 30 * 60000);
      const t = PROGRAMS[grp][i % 4];
      x.push(`  <programme start="${fmt(s)}" stop="${fmt(e)}" channel="${n}">`, `    <title lang="en">${esc(t)}</title>`, `    <sub-title lang="en">Episode ${i + 1}</sub-title>`, `    <desc lang="en">${esc(t)} on the ${grp.toLowerCase()} test channel. Synthetic guide data.</desc>`, `    <category lang="en">${grp}</category>`, '  </programme>');
    }
  }
  x.push('</tv>');
  return x.join(NL) + NL;
}
