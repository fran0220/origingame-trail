/* Boot the packed build, not the repository.
 *
 * `pack.mjs` copies an allowlist into dist/ and prints a file count, which is
 * not evidence of anything: a deploy that ships a level 404-ing every texture
 * and every plant it asks for produces exactly the same summary, and passes
 * every test run against the source tree, because in the source tree the files
 * are there. That is what had happened — media/lake-assets was not on the
 * list, and the lake's scanned ground and glTF plants would all have been
 * missing in a player's download.
 *
 * So this serves dist/ over HTTP, boots both levels in a real browser from a
 * fresh page each, and fails on any request that 404s or any page error.
 *
 * Usage:  npm run pack && node tools/deploy-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
const ROOT = 'dist';
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.jpg':'image/jpeg', '.png':'image/png', '.gltf':'model/gltf+json', '.bin':'application/octet-stream' };
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = join(ROOT, u === '/' ? 'index.html' : u);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args:['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport:{width:1280,height:720} });
const bad = [];
page.on('requestfailed', r => bad.push('FAILED ' + r.url().replace(`http://localhost:${port}`,'')));
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(`http://localhost:${port}`,'')); });
page.on('pageerror', e => bad.push('pageerror: ' + e.message));
/* Read from the game rather than repeated here, because a hardcoded pair is a
 * check that silently stops covering the thing it exists to cover: Tongariro
 * shipped as a third level and this file went on booting two and reporting
 * success, which is worse than not testing at all — it is a green tick for an
 * untested build. */
/* From the directory rather than by importing main.js — main.js pulls in three
 * and Node cannot resolve a browser bare specifier. The directory is the same
 * source of truth for practical purposes: a level is a folder with an
 * index.js, and one that is not registered will fail this check by not
 * booting, which is exactly the failure worth catching. */
const LEVELS = readdirSync(new URL('../src/levels/', import.meta.url))
  .filter((d) => existsSync(new URL(`../src/levels/${d}/index.js`, import.meta.url)));
if (LEVELS.length < 2) { console.error('deploy-check: could not read LEVELS'); process.exit(1); }
console.log(`  checking ${LEVELS.length} levels: ${LEVELS.join(', ')}`);

/* THE PICKER IS HANDWRITTEN HTML AND DOES NOT KNOW ABOUT LEVELS.
 *
 * Tongariro shipped registered, packed, booting and reachable only by editing
 * the URL, because index.html has one button per level typed in by hand and
 * nobody had typed the third. For a player the level did not exist, and every
 * check in this repo passed — they all load a level by hash, which is the one
 * route a player never takes.
 *
 * So the packed markup is checked against the level list. */
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const missing = LEVELS.filter((l) => !html.includes(`data-level="${l}"`));
if (missing.length) {
  console.error(`\nFAIL — no picker button for: ${missing.join(', ')}`);
  console.error('  the level is registered and unreachable; add it to index.html');
  process.exit(1);
}
console.log(`  picker offers all ${LEVELS.length}`);
for (const level of LEVELS) {
  /* A fresh page per level. Changing only the hash does not re-run the module,
   * so the second level reported the first one's stats and proved nothing. */
  await page.goto('about:blank');
  await page.goto(`http://localhost:${port}/#manual&level=${level}`);
  await page.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });
  const info = await page.evaluate(() => {
    const g = window.__game;
    return { level: g.levelModule.meta.id, driving: !!g.driving, car: !!g.car,
             road: g.trail ? Math.round(g.trail.length) : null };
  });
  console.log(`  ${level}: ${JSON.stringify(info)}`);
}
await browser.close(); server.close();
if (bad.length) { console.log('\nBROKEN in dist:'); for (const b of [...new Set(bad)].slice(0,15)) console.log('  ' + b); process.exit(1); }
console.log(`\nok — the packed build boots all ${LEVELS.length} levels with no missing assets`);
