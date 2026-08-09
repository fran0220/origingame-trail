/* Stand at the spawn and look, plus a look at what happens past the end. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, capture } from './harness.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'shots', process.argv[2] || 'spawn');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

await run({ width: 1280, height: 720, hash: 'manual&tier=high&level=lake', timeout: 300_000 }, async ({ page }) => {
  const shots = [
    ['01-spawn-chase', 'chase', 0],
    ['02-spawn-hood', 'hood', 0],
    ['03-after-3s', 'chase', 3],
    ['04-end-of-road', 'chase', -1],
  ];
  for (const [name, mode, secs] of shots) {
    const info = await page.evaluate(({ mode, secs }) => {
      const g = window.__game, d = g.walker, trail = g.trail;
      g.begin();
      d.camMode = mode;
      if (secs < 0) { d.placeAt(0.995); }
      else {
        d.placeAt(0.02);
        for (const k in d.keys) d.keys[k] = false;
        if (secs > 0) d.keys.KeyW = true;
        for (let i = 0; i < 60 * Math.max(secs, 0.5); i++) g.step(1 / 60);
        for (const k in d.keys) d.keys[k] = false;
      }
      for (let i = 0; i < 30; i++) g.step(1 / 60);
      g.render();
      const q = trail.nearest(d.pos.x, d.pos.z, {});
      return { t: +q.t.toFixed(3), dist: +q.dist.toFixed(1), kmh: Math.round(d.speed*3.6) };
    }, { mode, secs });
    await capture(page, path.join(out, `${name}.png`));
    console.log(`  ${name}  t=${info.t} off=${info.dist}m ${info.kmh}km/h`);
  }
});
