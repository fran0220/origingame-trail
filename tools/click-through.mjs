/* Does clicking the button actually start the level?
 *
 * The last two bugs in this project were both "correct and unreachable": a
 * level with no picker button, and a route nothing had walked. Both survived
 * because every check loads a level by URL hash, which is the one thing a
 * player never does. This closes the last gap in that chain — it opens the
 * packed build with NO hash, the way a player arrives, CLICKS each button, and
 * waits for a world to appear and draw.
 *
 *   node tools/click-through.mjs dist
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.argv[2] || 'dist';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.ico':'image/x-icon', '.webmanifest':'application/manifest+json' };

const srv = createServer(async (req, res) => {
  try {
    let u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (u === '/') u = '/index.html';
    const f = join(ROOT, normalize(u).replace(/^(\.\.[/\\])+/, ''));
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const levels = (await readdir(new URL('../src/levels/', import.meta.url), { withFileTypes: true }))
  .filter((d) => d.isDirectory()).map((d) => d.name);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const fail = [];

for (const level of levels) {
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (/Shader Error|ERROR: 0:/.test(m.text())) errs.push('shader'); });
  /* The portal's SDK, stubbed the way it is injected in production. */
  await page.addInitScript(() => {
    window.__ogReady = 0;
    window.OG = { ready: async () => { window.__ogReady++; }, loading: { begin(){}, progress(){} } };
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

  const btn = page.locator(`#levelPicker button[data-level="${level}"]`);
  if (!(await btn.count())) { fail.push(`${level}: no button`); await page.close(); continue; }
  await btn.click();

  /* Wait for a world that has actually drawn something, not merely for the
   * module to have defined __game. */
  let drew = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    drew = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return null;
      const i = g.info?.();
      return i ? { calls: i.calls, tris: i.triangles } : null;
    });
    if (drew && drew.calls > 1 && drew.tris > 0) break;
    await page.waitForTimeout(500);
  }
  const ready = await page.evaluate(() => window.__ogReady);
  if (!drew || !(drew.calls > 1 && drew.tris > 0)) {
    fail.push(`${level}: clicked, but no world drew (${JSON.stringify(drew)})`);
  } else if (!ready) {
    fail.push(`${level}: drew but never called og.ready()`);
  } else {
    console.log(`  ${level.padEnd(10)} clicked -> ${drew.calls} calls, ${(drew.tris / 1e6).toFixed(1)} M triangles, ready x${ready}`);
  }
  if (errs.length) fail.push(`${level}: ${errs.length} error(s): ${errs[0]}`);
  await page.close();
}

await browser.close();
srv.close();

if (fail.length) {
  console.error('\nFAIL — ' + fail.join('\n       '));
  process.exit(1);
}
console.log(`\nok — all ${levels.length} levels start from a click`);
