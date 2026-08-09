/* How the car answers, measured the way vehicle dynamics actually measures it.
 *
 * tools/telemetry.mjs drives a lap and reports whether the car stayed on the
 * road. That is a useful number and it is not "feel": a car can hold a lane
 * perfectly and still be numb, laggy, twitchy or uncatchable, because feel is
 * about the *response* — how long after you ask, how much, whether it
 * overshoots, and whether it keeps doing it once you stop asking.
 *
 * Those are exactly the questions the standard open-loop manoeuvres were
 * invented for, so this runs them. No autopilot anywhere: every input here is a
 * key held for a known time, which is what a player does.
 *
 *   STEP STEER (ISO 7401). From a straight line at a set speed, full lock in
 *   one direction. Reports the delay before the car answers, how long it takes
 *   to get there, how far past it goes, and how long the ringing lasts. This is
 *   the single most informative number set for "does it feel connected".
 *
 *   STEADY STATE (ISO 4138). Hold a fixed lock and let the speed rise. The
 *   slope of steering angle against lateral acceleration is the understeer
 *   gradient: positive is understeer, near zero is neutral and nervous,
 *   negative is unstable. Road cars run 1-4 deg/g.
 *
 *   THROTTLE AND BRAKE. 0-100 km/h, and 100-0 in metres.
 *
 *   LIFT-OFF. Settled in a corner, close the throttle: how much the tail
 *   rotates. Some is what makes a car feel alive; a lot is a car that spins
 *   every time you breathe off it.
 *
 *   REVERSE. Whether it exists at all.
 *
 * Usage:  node tools/handling.mjs <tag> [--compare <tag>]
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
const dir = path.join(ROOT, 'media', 'handling');
fs.mkdirSync(dir, { recursive: true });

let out = null;
await run({ hash: 'manual&tier=high&level=lake', timeout: 600_000 }, async ({ page }) => {
  out = await page.evaluate(() => {
    const g = window.__game, d = g.walker;
    const H = 1 / 120;                      // fine steps: this is a measurement

    const clear = () => { for (const k in d.keys) d.keys[k] = false; };

    /* A skid pad, because these manoeuvres are meaningless without one.
     *
     * The first run of this reported 4 deg/s of steady yaw at full lock and a
     * 478% overshoot, which looked like a damning verdict on the car and was
     * really a description of the test: full lock at 80 km/h puts the car off
     * an 8 m road inside a second, so everything after the first half-second
     * was measured on tussock at a third of the grip, over hummocks, and
     * eventually against the world berm.
     *
     * Every standard open-loop manoeuvre is run on a flat uniform surface for
     * exactly this reason. Here that means pinning the surface query to dry
     * seal and the ground to a plane — the car is otherwise completely
     * untouched, and this is the rig rather than the车. */
    const flatY = g.terrain.height(d.pos.x, d.pos.z);
    const realSurface = d._surfaceAt.bind(d);
    const realHeight = g.terrain.height.bind(g.terrain);
    const padOn = () => {
      d._surfaceAt = () => ({ mu: 1.30, off: 0, name: 'seal' });
      g.terrain.height = () => flatY;
    };
    const padOff = () => { d._surfaceAt = realSurface; g.terrain.height = realHeight; };
    padOn();
    /* A straight, level piece of this road, found rather than assumed. */
    const straightT = (() => {
      const trail = g.trail, THREE = window.THREE;
      const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
      let best = 0, bestK = 1e9;
      for (let t = 0.05; t < 0.9; t += 0.01) {
        const L = trail.length, S = 30 / L;
        trail.pointAt(t, A); trail.pointAt(t + S, B); trail.pointAt(t + 2 * S, C);
        const ax = B.x - A.x, az = B.z - A.z, bx = C.x - B.x, bz = C.z - B.z;
        const cross = Math.abs(ax * bz - az * bx);
        const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(C.x - A.x, C.z - A.z);
        const k = la * lb * lc < 1e-6 ? 0 : 2 * cross / (la * lb * lc);
        if (k < bestK) { bestK = k; best = t; }
      }
      return best;
    })();

    /* Bring the car to a speed in a straight line, without steering. */
    const runUpTo = (kmh) => {
      d.placeAt(straightT); clear(); d.lookYaw = 0; d._lookHeld = -99;
      d.keys.KeyW = true;
      for (let i = 0; i < 120 * 40 && d.speed * 3.6 < kmh; i++) g.step(H);
      clear();
      return d.speed * 3.6;
    };

    /* ── step steer ─────────────────────────────────────────────────────── */
    const stepSteer = (kmh) => {
      const reached = runUpTo(kmh);
      d.keys.KeyW = true;                    // maintain speed
      const yaw = [];
      d.keys.KeyD = true;
      for (let i = 0; i < 120 * 3; i++) { g.step(H); yaw.push(Math.abs(d.yawRate)); }
      clear();
      /* Steady value = mean of the last third, once it has settled. */
      const tail = yaw.slice(Math.floor(yaw.length * 0.66));
      const steady = tail.reduce((a, b) => a + b, 0) / tail.length;
      const peak = Math.max(...yaw);
      const idxAt = (frac) => {
        const target = steady * frac;
        for (let i = 0; i < yaw.length; i++) if (yaw[i] >= target) return i;
        return -1;
      };
      const i10 = idxAt(0.10), i90 = idxAt(0.90);
      /* Settling: last time it is more than 5% away from steady. */
      let settle = 0;
      for (let i = 0; i < yaw.length; i++) if (Math.abs(yaw[i] - steady) > steady * 0.05) settle = i;
      return {
        atKmh: +reached.toFixed(0),
        delayMs: i10 < 0 ? null : Math.round(i10 * H * 1000),
        riseMs: (i10 < 0 || i90 < 0) ? null : Math.round((i90 - i10) * H * 1000),
        overshootPct: steady > 1e-4 ? +(((peak - steady) / steady) * 100).toFixed(0) : null,
        settleMs: Math.round(settle * H * 1000),
        steadyYawDegS: +(steady * 57.3).toFixed(1),
      };
    };

    /* ── steady state: understeer gradient, at constant radius ──────────
     *
     * The first version of this held full lock and let the speed rise, which
     * measures the speed-sensitive steering authority in _readInput and not
     * the car: available lock falls as speed rises, so the "steer required"
     * went down while lateral acceleration went up and the gradient came out
     * at -38 deg/g on a car that is actually mildly understeering.
     *
     * ISO 4138 is a constant-radius test for that reason. Drive a fixed circle
     * at increasing speed and record the steering angle needed to hold it: if
     * the car understeers, it needs more as the speed rises, and the slope of
     * steer against lateral acceleration is the gradient. The steer angle is
     * commanded directly here, bypassing the player's lock limit, because the
     * quantity being measured is the car's, not the driver's.
     */
    const understeer = () => {
      const R = 60;
      const pts = [];
      for (const kmh of [40, 55, 70, 85]) {
        runUpTo(kmh);
        const v = d.speed;
        const wantYaw = v / R;
        /* Hold the circle with a simple integral controller on yaw rate. */
        let integ = 0;
        for (let i = 0; i < 120 * 6; i++) {
          d.keys.KeyW = d.speed < v;          // maintain the speed
          d.keys.KeyS = d.speed > v + 1.5;
          const err = wantYaw - Math.abs(d.yawRate);
          integ = Math.max(-0.6, Math.min(0.6, integ + err * H * 1.4));
          d.steer = -Math.max(0, Math.min(0.52, integ + err * 0.30));
          g.step(H);
        }
        const latG = Math.abs(d.latAccel) / 9.81;
        const steerDeg = Math.abs(d.steer) * 57.3;
        const heldYaw = Math.abs(d.yawRate);
        clear();
        /* Only keep points where the circle was actually held. */
        if (latG > 0.08 && Math.abs(heldYaw - wantYaw) < wantYaw * 0.25) {
          pts.push({ latG, steerDeg, kmh });
        }
      }
      if (pts.length < 2) return { gradientDegPerG: null, points: pts.length };
      const n = pts.length;
      const sx = pts.reduce((a, p) => a + p.latG, 0), sy = pts.reduce((a, p) => a + p.steerDeg, 0);
      const sxx = pts.reduce((a, p) => a + p.latG * p.latG, 0);
      const sxy = pts.reduce((a, p) => a + p.latG * p.steerDeg, 0);
      const slope = (n * sxy - sx * sy) / Math.max(1e-6, n * sxx - sx * sx);
      return { gradientDegPerG: +slope.toFixed(2), points: n,
               maxLatG: +Math.max(...pts.map((p) => p.latG)).toFixed(2) };
    };

    /* ── straight line ──────────────────────────────────────────────────── */
    const accel = () => {
      d.placeAt(straightT); clear();
      d.keys.KeyW = true;
      let t = 0;
      for (let i = 0; i < 120 * 40 && d.speed * 3.6 < 100; i++) { g.step(H); t += H; }
      const to100 = d.speed * 3.6 >= 99 ? t : null;
      for (let i = 0; i < 120 * 30 && d.speed * 3.6 < 160; i++) { g.step(H); t += H; }
      clear();
      return { zeroTo100S: to100 ? +to100.toFixed(2) : null,
               topKmh: +(d.speed * 3.6).toFixed(0) };
    };
    const braking = () => {
      runUpTo(100); clear();
      const x0 = d.pos.x, z0 = d.pos.z;
      d.keys.KeyS = true;
      for (let i = 0; i < 120 * 12 && d.speed > 0.6; i++) g.step(H);
      clear();
      return { hundredToZeroM: +Math.hypot(d.pos.x - x0, d.pos.z - z0).toFixed(1) };
    };

    /* ── lift-off ───────────────────────────────────────────────────────── */
    const liftOff = () => {
      runUpTo(90);
      d.keys.KeyW = true; d.keys.KeyD = true;
      for (let i = 0; i < 120 * 2.5; i++) g.step(H);
      const before = Math.abs(d.yawRate);
      d.keys.KeyW = false;                    // close the throttle, keep the lock
      let peak = before;
      for (let i = 0; i < 120 * 1.5; i++) { g.step(H); peak = Math.max(peak, Math.abs(d.yawRate)); }
      clear();
      return { yawRiseOnLiftPct: before > 1e-3 ? +(((peak - before) / before) * 100).toFixed(0) : null };
    };

    /* ── reverse ────────────────────────────────────────────────────────── */
    const reverse = () => {
      d.placeAt(straightT); clear();
      const s = Math.sin(d.yaw), c = Math.cos(d.yaw);
      const x0 = d.pos.x, z0 = d.pos.z;
      /* Hold S: it brakes to a stop, engages reverse, then drives backwards. */
      d.keys.KeyS = true;
      for (let i = 0; i < 120 * 6; i++) g.step(H);
      const gear = d.gear;
      clear();
      const dx = d.pos.x - x0, dz = d.pos.z - z0;
      const along = dx * s + dz * c;          // negative = went backwards
      return { movedBackwardsM: +(-along).toFixed(2), kmh: +(d.speed * 3.6).toFixed(1), gear };
    };

    const result = {
      step80: stepSteer(80),
      step120: stepSteer(120),
      understeer: understeer(),
      accel: accel(),
      braking: braking(),
      liftOff: liftOff(),
      reverse: reverse(),
    };
    padOff();
    return result;
  });
});

fs.writeFileSync(path.join(dir, `${tag}.json`), JSON.stringify(out, null, 1));
const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) =>
  (v && typeof v === 'object') ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, v]]);
const rows = flat(out);
console.log(`\n${tag}`);
for (const [k, v] of rows) console.log(`  ${k.padEnd(28)} ${v}`);
if (BASE) {
  const f = path.join(dir, `${BASE}.json`);
  if (fs.existsSync(f)) {
    const b = Object.fromEntries(flat(JSON.parse(fs.readFileSync(f, 'utf8'))));
    console.log(`\ndelta vs ${BASE}`);
    for (const [k, v] of rows) {
      if (typeof v !== 'number' || typeof b[k] !== 'number' || v === b[k]) continue;
      console.log(`  ${k.padEnd(28)} ${b[k]}  ->  ${v}`);
    }
  }
}
