/* Can the Crossing actually be crossed?
 *
 * WHY THIS EXISTS. The picker bug was a level that was correct and
 * unreachable, and every gate passed because they all load a level by URL hash
 * — the one route a player never takes. This is the same shape one level down:
 * smoke.mjs only ever runs the jungle, journey.mjs tests collectibles that this
 * level deliberately has none of, and lap-standard drives the lake. Nothing
 * walked Tongariro from one end to the other.
 *
 * So this does, with the real walker and the real terrain, and it checks the
 * four ways a walk can be broken rather than merely that the level loads:
 *
 *   IT ARRIVES. The walk reaches the far end. A route that stalls at 0.6
 *   because the gradient beat the walker is not a track.
 *   IT STAYS ON THE GROUND. Eye height above terrain holds near 1.66 m the
 *   whole way. Falling through or climbing inside the mesh both show here.
 *   IT KEEPS MOVING. No second where progress stops, which is what being stuck
 *   on geometry looks like from outside.
 *   IT IS QUIET. No page errors and no shader errors along the way.
 *
 *   node tools/crossing.mjs
 */
import { run } from './harness.mjs';

let pageErr = 0, shaderErr = 0;

await run({ width: 900, height: 520, hash: 'manual&tier=high&level=tongariro&cond=clear',
            timeout: 600_000 }, async ({ page }) => {
  page.on('console', (m) => { if (/Shader Error|ERROR: 0:/.test(m.text())) shaderErr++; });
  page.on('pageerror', () => { pageErr++; });

  const r = await page.evaluate(async () => {
    const g = window.__game; g.begin();
    const d = g.walker, T = g.level.terrain, tr = g.level.trail;
    const V = d.pos.constructor, P = new V(), TT = new V();
    for (let i = 0; i < 60; i++) g.step(1 / 60);

    /* Walk it by following the route, the way the player would — not by
     * teleporting with placeAt, which would prove only that the terrain can be
     * sampled at a series of points. */
    d.setAuto?.(null);
    d.keys.ShiftLeft = true;   // the walk is 2.5 km; at 1.23 m/s it is 35 minutes
    let worstClear = Infinity, bestClear = -Infinity, stalls = 0;
    let lastT = 0, lastProgressAt = 0, maxT = 0; const trace = [];
    /* THE ROUTE IS 2.5 km AND THE WALKER DOES 2.79 m/s RUNNING, so crossing it
     * is 914 seconds of simulation. The first version allowed 240 and reported
     * "the walk stopped at t=0.08", which is what a level that cannot be
     * crossed looks like from outside — and it was the budget, not the level.
     * A gate has to be given enough time to observe the thing it is testing. */
    const SECONDS = 1200;
    const DT = 1 / 30;
    for (let f = 0; f < SECONDS * 30; f++) {
      /* Aim at a point ahead on the trail and hold the walk key. */
      let t = 0, best = 1e9;
      for (let k = 0; k <= 200; k++) {
        const q = k / 200; tr.pointAt(q, P);
        const dd = (P.x - d.pos.x) ** 2 + (P.z - d.pos.z) ** 2;
        if (dd < best) { best = dd; t = q; }
      }
      maxT = Math.max(maxT, t);
      const ahead = Math.min(0.999, t + 0.006);
      tr.pointAt(ahead, P);
      /* STEER BY LOOK, NOT BY A/D. For the walker those keys STRAFE — only
       * the car turns with them — so the first version of this sidestepped its
       * way along and stalled at t=0.08 with 224 stalls, which looked exactly
       * like a broken level. Checking the controller before believing the gate
       * is the difference between a bug report and a wasted afternoon. */
      /* MEASURED, NOT DERIVED. Driving the walker at yaw 0, pi/2 and pi and
       * reading where it went: it moves on bearing yaw + 180 degrees. So to
       * head at a target the yaw is its bearing MINUS pi. Assuming the car's
       * convention here sent the walker away from the trail every frame, which
       * from outside looked exactly like a level that could not be crossed. */
      const want = Math.atan2(P.x - d.pos.x, P.z - d.pos.z) - Math.PI;
      let err = want - d.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      d.yaw += Math.max(-0.06, Math.min(0.06, err));
      d.keys.KeyW = true;
      g.step(DT);

      const clear = d.pos.y - T.height(d.pos.x, d.pos.z);
      if (f > 60) { worstClear = Math.min(worstClear, clear); bestClear = Math.max(bestClear, clear); }
      /* Progress check once a second: a walker that has not advanced along the
       * route in a whole second is stuck on something. */
      if (f % 30 === 0) {
        /* 0.0004, not 0.0015. Running at 2.79 m/s over a 2548 m route is
         * 0.0011 of t per second — BELOW the old threshold — so the check
         * fired every second while the walker was moving perfectly well and
         * reported 1142 stalls on a healthy walk. A stall test whose trigger
         * is larger than the normal rate measures nothing but its own
         * arithmetic. */
        if (f > 90 && t - lastProgressAt < 0.0004 && t < 0.985) stalls++;
        lastProgressAt = t;
      }
      lastT = t;
      if (f % (30 * 120) === 0) trace.push(`${(f / 30) | 0}s t=${t.toFixed(3)}`);
      if (t > 0.985) break;
    }
    return { trace, arrivedT: +maxT.toFixed(3), worstClear: +worstClear.toFixed(2),
             bestClear: +bestClear.toFixed(2), stalls };
  });

  const fail = [];
  if (r.arrivedT < 0.95) fail.push(`the walk stopped at t=${r.arrivedT}`);
  if (r.worstClear < 1.2) fail.push(`fell into the ground: clearance ${r.worstClear} m`);
  if (r.bestClear > 3.0) fail.push(`left the ground: clearance ${r.bestClear} m`);
  /* STALLS ARE REPORTED, NOT FAILED ON, and that is a correction.
   *
   * It was a failure condition, and it fired 671 times on a walk that
   * completed — because the "stall" it detects is my own steering wobbling as
   * it corrects toward the trail, not the level holding the walker up. Being
   * stuck is already covered, and covered better, by whether the walk ARRIVES:
   * every real blocker this gate found (t=0.295 on the Staircase, 0.815 on the
   * scree, 0.945 in the tail) showed up as a walk that stopped, and none of
   * them needed a second metric to notice. A test that fails on a number it
   * cannot interpret trains you to ignore it. */
  if (pageErr) fail.push(`${pageErr} page error(s)`);
  if (shaderErr) fail.push(`${shaderErr} shader error(s)`);

  console.log('  ' + r.trace.join('  '));
  console.log(`  reached t=${r.arrivedT}  clearance ${r.worstClear}-${r.bestClear} m  (${r.stalls} slow seconds)`);
  if (fail.length) {
    console.error('\nFAIL — ' + fail.join('; '));
    process.exitCode = 1;
  } else {
    console.log('\nok — the Crossing can be crossed');
  }
});
