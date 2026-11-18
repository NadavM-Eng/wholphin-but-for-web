// Server + user setup flow in the app, ending signed in as the test user through Quick Connect.
import { PKG, adbShell, sleep } from './common.mjs';
import * as ui from './adbui.mjs';
import { SERVER_URL_IN_EMULATOR } from './ctx.mjs';

export async function wipeAndLaunch(c) {
  adbShell(`am force-stop ${PKG}`);
  adbShell(`pm clear ${PKG}`);
  adbShell(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
  adbShell(`am start -n ${PKG}/.MainActivity`);
  ui.trail.push('(wipe app data + launch)');
  await c.waitFor(/^(Select Server|Add Server)$/, { timeout: 30000 });
}

/**
 * Full first-run flow. With shots=true each stage is captured (scene context must be set).
 * Password is never typed: Quick Connect code is read from the screen and authorized from the host.
 */
export async function setupFlow(c, { shots = true } = {}) {
  const shot = async (...a) => { if (shots) await c.shot(...a); };
  await wipeAndLaunch(c);
  await shot('server-empty', 'Select Server screen with no servers; the Add Server card is focused');
  await c.press('enter');
  await c.waitFor(/Discovered Servers/);
  await shot('add-dialog-discovery', 'Add Server dialog, discovery step ("Searching...")');
  await c.press('enter');
  await c.waitFor(/Enter Server IP or URL/);
  await shot('add-dialog-manual', 'Add Server dialog, manual URL entry with the on-screen keyboard');
  await c.press('text:' + SERVER_URL_IN_EMULATOR);
  await shot('add-dialog-typed', 'URL typed into the manual entry field');
  await c.press('enter');
  await c.waitFor(/^Select User$/, { timeout: 25000 });
  await sleep(1000);
  await shot('user-list-empty', 'Select User for the new server: only the Add User card, server-version warning at the bottom');
  await c.focus('Switch servers');
  await c.press('enter');
  await c.waitFor(/^Select Server$/);
  await sleep(800);
  await shot('server-list', 'Select Server with one server card plus Add Server (after Switch servers)');
  // pick the server again
  await c.press('left');
  await c.press('enter');
  await c.waitFor(/^Select User$/, { timeout: 15000 });
  await c.focus('Add User');
  await c.press('enter');
  const nodes = await c.waitFor((n) => /^\d{6}$/.test(n.text), { timeout: 20000 });
  await shot('quick-connect', 'Login dialog in Quick Connect mode showing the 6-digit code');
  const code = nodes.find((n) => /^\d{6}$/.test(n.text)).text;
  await c.authorizeQuickConnect(code);
  await c.waitHome();
}
