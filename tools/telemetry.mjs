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
  t = await page.evaluate(async () => {
    const g = window.__game, d = g.walker, trail = g.trail, THREE = window.THREE;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    g.begin();
    d.placeAt(0.005);
    for (const k in d.keys) d.keys[k] = false;

    /* The road's own geometry, measured before anyone drives it. A corner
     * radius is a property of the alignment; reading it off a driven trace
     * confuses the road with the driver. */
    const roadGeom = (() => {
      const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
      const L = trail.length, SP = 25, radii = [];
      for (let m = 0; m + 2 * SP < L; m += SP) {
        trail.pointAt(m / L, A); trail.pointAt((m + SP) / L, B); trail.pointAt((m + 2 * SP) / L, C);
        const ax = B.x - A.x, az = B.z - A.z, bx = C.x - B.x, bz = C.z - B.z;
        const cross = Math.abs(ax * bz - az * bx);
        const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(C.x - A.x, C.z - A.z);
        if (la * lb * lc < 1e-6) continue;
        const k = 2 * cross / (la * lb * lc);
        radii.push(k > 1e-6 ? 1 / k : 1e6);
      }
      radii.sort((p, q) => p - q);
      const at = (f) => Math.round(radii[Math.floor(f * (radii.length - 1))]);
      return { minRadiusM: at(0), p10RadiusM: at(0.1), medianRadiusM: at(0.5),
               cornersUnder200: radii.filter((r) => r < 200).length };
    })();

    const s = { frames: 0, offRoad: 0, atLimit: 0, wrongWay: 0,
                topSpeed: 0, sumSpeed: 0, maxLatG: 0, sumLatG: 0,
                maxSlip: 0, sumAbsSteer: 0, spins: 0,
                laneSq: 0, laneMax: 0, yawFlips: 0, yawJerk: 0, bins: [], binK: [] };
    let prevYawSign = 0, prevYawRate = 0, time = 0;

    /* The shared driver — see tools/autodriver.mjs. Fixed line, so a change in
     * these numbers is a change in the car. */
    const { drive } = await import('/tools/autodriver.mjs');

    for (let n = 0; n < 60 * 300; n++) {
      const q = trail.nearest(d.pos.x, d.pos.z, {});
      if (q.t >= 0.995) break;
      const cmd = drive(g);
      const err = cmd.err;
      g.step(1 / 60);
      time += 1 / 60;

      s.frames++;
      s.sumSpeed += d.speed;
      if (d.speed > s.topSpeed) s.topSpeed = d.speed;
      /* True tyre lateral acceleration. `_ay` is the body-frame derivative and
       * carries the -vx*r transport term, so it reads far above mu in any
       * steady corner and says nothing about how hard the car is working. */
      const latG = Math.abs(d.latAccel || 0) / 9.81;
      s.sumLatG += latG;
      if (latG > s.maxLatG) s.maxLatG = latG;
      if (d.offRoad > 0.75) s.offRoad++;
      if (d.skid > 0.9) s.atLimit++;
      if (Math.abs(d.slipAngle) > s.maxSlip) s.maxSlip = Math.abs(d.slipAngle);
      if (Math.abs(err) > 1.2) s.wrongWay++;
      if (Math.abs(d.yawRate) > 1.6 && d.speed > 8) s.spins++;
      s.sumAbsSteer += Math.abs(d.steer);

      /* How well the car is held in its lane, which is the question
       * "does it go where it is pointed" asked as a number. Distance from the
       * centre of the near lane: the seal is 4.1 m of half-width, so anything
       * past about 2.4 m has the car crossing the centreline or riding the
       * edge line. */
      const lane = Math.abs(cmd.off - 1.75);
      s.laneSq += lane * lane;
      if (lane > s.laneMax) s.laneMax = lane;
      /* Where it goes wrong, in twentieths of the stage. A single number for
       * "how well is it held" cannot tell a car that wanders everywhere from
       * one that is fine except at three corners, and those want opposite
       * fixes. */
      const bin = Math.min(19, Math.floor(cmd.t * 20));
      s.bins[bin] = Math.max(s.bins[bin] || 0, lane);

      /* Ringing, measured on the car rather than on the hands. A steering
       * reversal count is dominated by the controller's own dithering — the
       * first version of this reported 333 per km, which was the driver
       * pulsing a key against a fast self-centring wheel, not the car. Yaw
       * rate changing sign at speed is the car itself oscillating. */
      if (d.speed > 10) {
        const ys = Math.sign(d.yawRate);
        if (ys && prevYawSign && ys !== prevYawSign && Math.abs(d.yawRate) > 0.05) s.yawFlips++;
        if (ys) prevYawSign = ys;
        s.yawJerk += Math.abs(d.yawRate - prevYawRate);
      }
      prevYawRate = d.yawRate;
    }
    const f = Math.max(1, s.frames);
    return {
      stageM: +trail.length.toFixed(0),
      ...roadGeom,
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
      /* RMS metres from the centre of the near lane, and the worst excursion. */
      laneRmsM: +Math.sqrt(s.laneSq / f).toFixed(2),
      laneMaxM: +s.laneMax.toFixed(1),
      /* Yaw-rate sign changes per kilometre: how much the car rings. */
      yawFlipPerKm: +(s.yawFlips / (trail.length / 1000)).toFixed(1),
      yawJerkPerS: +(s.yawJerk / Math.max(0.001, time)).toFixed(2),
      meanSteerDeg: +(s.sumAbsSteer / f * 57.3).toFixed(2),
      spinFrames: s.spins,
      lostIt: s.wrongWay,
      /* Worst lane error per twentieth of the stage, with the tightest
       * curvature the driver saw there — a radius, which is easier to argue
       * about than a curvature. */
      worstBy20th: s.bins.map((v, i) => ({
        t: +(i / 20).toFixed(2), laneM: +v.toFixed(1),
      })),
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
