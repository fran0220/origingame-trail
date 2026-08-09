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
import { readFileSync, existsSync, statSync } from 'node:fs';
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
for (const level of ['lake','jungle']) {
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
console.log('\nok — the packed build boots both levels with no missing assets');
