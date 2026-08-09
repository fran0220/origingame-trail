/* One frame for the portal, from the level the game now leads with. */
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, capture } from './harness.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'media', 'cover-lake.jpg');
await run({ width: 1600, height: 900, hash: 'manual&tier=ultra&level=lake', timeout: 600_000 }, async ({ page }) => {
  await page.evaluate(async () => {
    const g = window.__game, d = g.walker;
    g.begin(); g.setSun(30, 24);
    const { drive } = await import('/tools/autodriver.mjs');
    /* Drive to the place where the lake, the road and Aoraki are all in one
     * frame — which is the whole pitch of the level. */
    for (let n = 0; n < 60 * 240; n++) {
      const q = g.trail.nearest(d.pos.x, d.pos.z, {});
      if (q.t >= 0.60) break;
      drive(g); g.step(1 / 60);
    }
    for (let n = 0; n < 40; n++) { drive(g); g.step(1 / 60); }
    g.render();
  });
  await capture(page, out.replace('.jpg', '.png'));
});
console.log('  wrote', out.replace('.jpg', '.png'));
