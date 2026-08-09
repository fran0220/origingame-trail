/* A telemetry trace for the way the car feels.
 *
 * Handling is not a thing you can assert. There is no value of understeer that
 * is "correct" and no lap time that is "passing" — the same numbers are right
 * for a rally car and wrong for a go-kart. What you can do is what the gallery
 * does for the look: drive a fixed line, write down what the car did, and put
 * two runs side by side so a change has to say what it moved.
 *
 * Usage:  node tools/telemetry.mjs <tag> [--compare <tag>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tag = args[0] && !args[0].startsWith('--') ? args[0] : 'run';
const ci = args.indexOf('--compare');
const BASE = ci < 0 ? null : args[ci + 1];
const dir = path.join(ROOT, 'media', 'telemetry');
fs.mkdirSync(dir, { recursive: true });

let t = null;
await run({ hash: 'manual&tier=high&level=lake', timeout: 600_000 }, async ({ page }) => {
  t = await page.evaluate(() => {
    const g = window.__game, d = g.walker, trail = g.trail, THREE = window.THREE;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    g.begin();
    d.placeAt(0.005);
    for (const k in d.keys) d.keys[k] = false;

    const s = { frames: 0, offRoad: 0, atLimit: 0, wrongWay: 0,
                topSpeed: 0, sumSpeed: 0, maxLatG: 0, sumLatG: 0,
                maxSlip: 0, steerRev: 0, sumAbsSteer: 0, spins: 0 };
    let prevSteerSign = 0, time = 0;

    /* The same driver the gallery uses, so a change in the numbers is a change
     * in the car and not in how it was driven. */
    for (let n = 0; n < 60 * 300; n++) {
      const q = trail.nearest(d.pos.x, d.pos.z, {});
      if (q.t >= 0.995) break;
      const lookM = 14 + d.speed * 1.1;
      trail.pointAt(Math.min(1, q.t + lookM / trail.length), P);
      trail.tangentAt(Math.min(1, q.t + lookM / trail.length), T);
      const ay = Math.atan2(T.x, T.z);
      const ax = P.x + Math.cos(ay) * 1.75, az = P.z - Math.sin(ay) * 1.75;
      let err = Math.atan2(ax - d.pos.x, az - d.pos.z) - d.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      d.keys.KeyA = err > 0.015; d.keys.KeyD = err < -0.015;
      const tooFast = d.speed > 30 && Math.abs(err) > 0.10;
      d.keys.KeyW = d.speed < 6 || !tooFast;
      d.keys.KeyS = d.speed > 24 && Math.abs(err) > 0.22;
      g.step(1 / 60);
      time += 1 / 60;

      s.frames++;
      s.sumSpeed += d.speed;
      if (d.speed > s.topSpeed) s.topSpeed = d.speed;
      const latG = Math.abs(d._ay || 0) / 9.81;
      s.sumLatG += latG;
      if (latG > s.maxLatG) s.maxLatG = latG;
      if (d.offRoad > 0.75) s.offRoad++;
      if (d.skid > 0.9) s.atLimit++;
      if (Math.abs(d.slipAngle) > s.maxSlip) s.maxSlip = Math.abs(d.slipAngle);
      if (Math.abs(err) > 1.2) s.wrongWay++;
      if (Math.abs(d.yawRate) > 1.6 && d.speed > 8) s.spins++;
      s.sumAbsSteer += Math.abs(d.steer);
      const sign = Math.sign(d.steer);
      if (sign && prevSteerSign && sign !== prevSteerSign) s.steerRev++;
      if (sign) prevSteerSign = sign;
    }
    const f = Math.max(1, s.frames);
    return {
      stageM: +trail.length.toFixed(0),
      timeS: +time.toFixed(1),
      finished: trail.nearest(d.pos.x, d.pos.z, {}).t >= 0.99,
      meanKmh: +(s.sumSpeed / f * 3.6).toFixed(1),
      topKmh: +(s.topSpeed * 3.6).toFixed(1),
      meanLatG: +(s.sumLatG / f).toFixed(3),
      maxLatG: +s.maxLatG.toFixed(2),
      maxSlipDeg: +(s.maxSlip * 57.3).toFixed(1),
      pctOffRoad: +(100 * s.offRoad / f).toFixed(1),
      pctAtLimit: +(100 * s.atLimit / f).toFixed(1),
      /* How busy the hands were: reversals per kilometre. A car that needs
       * constant correction has a high number here and feels nervous. */
      steerRevPerKm: +(s.steerRev / (trail.length / 1000)).toFixed(1),
      meanSteerDeg: +(s.sumAbsSteer / f * 57.3).toFixed(2),
      spinFrames: s.spins,
      lostIt: s.wrongWay,
    };
  });
});

fs.writeFileSync(path.join(dir, `${tag}.json`), JSON.stringify(t, null, 1));
const w = 16;
const show = (o, label) => {
  console.log(`\n${label}`);
  for (const [k, v] of Object.entries(o)) console.log(`  ${k.padEnd(w)} ${v}`);
};
show(t, tag);
if (BASE) {
  const f = path.join(dir, `${BASE}.json`);
  if (!fs.existsSync(f)) { console.error(`no baseline ${f}`); process.exit(2); }
  const b = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`\ndelta vs ${BASE}`);
  for (const k of Object.keys(t)) {
    if (typeof t[k] !== 'number') continue;
    const dv = t[k] - b[k];
    if (Math.abs(dv) > 1e-9) {
      console.log(`  ${k.padEnd(w)} ${b[k]}  ->  ${t[k]}   (${dv > 0 ? '+' : ''}${dv.toFixed(2)})`);
    }
  }
}
