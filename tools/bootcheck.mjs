/* Does the game ever leave the player on the loading screen?
 *
 * The platform keeps its own loading surface up until the game calls
 * og.ready(). That call is the LAST line of boot(), so before this tool
 * existed any failure in a long, heavy boot left it uncalled and the player
 * watched a progress bar forever with no error and no way to tell a slow
 * device from a broken one. Nothing in the test suite could see that, because
 * every other instrument waits for window.__game and a failed boot never
 * defines it — the harness would just time out and report its own timeout.
 *
 * So this one stubs window.OG the way the portal does, loads dist/ in a real
 * browser, and reports how many times ready() was called. Two runs matter:
 *
 *   healthy   -> ogReadyCalls 1, bootErrorShown false, gameExposed true
 *   injected  -> ogReadyCalls 1, bootErrorShown true,  gameExposed false
 *
 * To check the failure path, put a throw inside boot() and run it again. The
 * wait must be LONGER than a full boot: at 14 s this tool reported the fix as
 * broken because the injected throw had not been reached yet, which is its own
 * lesson about instruments that sample before the thing they measure happens.
 *
 *   node tools/bootcheck.mjs dist 20000
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = process.argv[2] || 'dist';
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const srv = createServer(async (req,res)=>{
  try{
    let u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if(u==='/') u='/index.html';
    const f = join(ROOT, normalize(u).replace(/^(\.\.[/\\])+/,''));
    const b = await readFile(f);
    res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(b);
  }catch{ res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>srv.listen(0,r));
const port = srv.address().port;
const browser = await chromium.launch({ args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:900,height:520} });
/* Stub the platform SDK so we can SEE whether the game releases the loading
 * surface. This is what the portal does for real. */
await page.addInitScript(()=>{ window.__ogReady=0;
  window.OG={ ready:async()=>{ window.__ogReady++; },
    loading:{ begin(){}, progress(){} } }; });
await page.goto(`http://127.0.0.1:${port}/#manual&level=lake&cond=morning`, {waitUntil:'domcontentloaded'});
await page.waitForTimeout(Number(process.argv[3]||9000));
const out = await page.evaluate(()=>({
  ogReadyCalls: window.__ogReady,
  bootErrorShown: !!document.querySelector('#bootError'),
  errText: document.querySelector('#bootError')?.textContent?.slice(0,70) || null,
  gameExposed: typeof window.__game !== 'undefined',
}));
console.log(JSON.stringify(out));
await browser.close(); srv.close();
