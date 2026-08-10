/* The Crossing's topology, measured before any of it is drawn.
 *
 * The whole argument for a third level is that it has relief the other two
 * cannot have. Probing the existing levels for a point where the ground falls
 * away on BOTH sides of the path found 1.14 m on the lake and 0.23 m of notch
 * on the jungle walk, and two set-pieces were abandoned because of it. This
 * reports the same number for Tongariro, plus the elevation profile and the
 * per-stage cross-section, straight off the height function.
 *
 * Run it before building anything on top: if the ridge stops reading as a
 * ridge in this table it will not read as one on screen either.
 *
 *   node tools/tprofile.mjs
 */
import { trackElevation, stageAt, crossSection, BOUNDS } from '../src/levels/tongariro/route.js';

const rows = [];
let maxBoth = 0, maxBothT = 0, maxGrad = 0, maxGradAt = '';
for (let k = 0; k <= 400; k++) {
  const t = k / 400;
  const on = crossSection(t, 1, 0);
  let dl = 0, dr = 0;
  for (const d of [5, 10, 18, 28, 40, 55]) {
    dl = Math.max(dl, on - crossSection(t, +1, d));
    dr = Math.max(dr, on - crossSection(t, -1, d));
  }
  const both = Math.min(dl, dr);
  if (both > maxBoth) { maxBoth = both; maxBothT = t; }
  /* Steepest cross-slope anywhere, which is the number that decides whether
   * the mesh can draw it at all. */
  for (const side of [1, -1]) {
    for (let d = 2; d < 240; d += 2) {
      const g = Math.abs(crossSection(t, side, d) - crossSection(t, side, d + 2)) / 2;
      if (g > maxGrad) { maxGrad = g; maxGradAt = `${stageAt(t)} at ${d} m`; }
    }
  }
  if (k % 25 === 0) rows.push({ t: +t.toFixed(2), stage: stageAt(t),
    elev: Math.round(trackElevation(t)), fallL: +dl.toFixed(1),
    fallR: +dr.toFixed(1), both: +both.toFixed(1) });
}
const pad = (s, n) => String(s).padStart(n);
console.log('\n   t         stage    elev   fall L  fall R    both');
for (const r of rows) {
  console.log(`${pad(r.t, 5)} ${pad(r.stage, 13)} ${pad(r.elev, 6)} ${pad(r.fallL, 8)} ${pad(r.fallR, 7)} ${pad(r.both, 7)}`);
}
console.log(`\n  deepest drop on BOTH sides: ${maxBoth.toFixed(1)} m at t=${maxBothT.toFixed(3)}`);
console.log('    for comparison: lake 1.14 m, jungle 0.23 m of notch');
console.log(`  steepest cross-slope: ${maxGrad.toFixed(2)} rise/run (${(Math.atan(maxGrad) * 57.3).toFixed(0)} deg), ${maxGradAt}`);
console.log('    a heightfield cell rising more than its own width cannot be drawn as a slope');

/* ALONG-TRAIL GRADIENT — the axis this tool did not check for the whole of the
 * level's first build. Cross-slope decides whether the mesh can DRAW a face;
 * this decides whether a person can WALK it, and the level shipped with an
 * 88 m rise over 18 m of walking because nothing was asking. A tool that
 * measures one axis of a two-axis problem is not a check, it is a blind spot
 * with a green tick on it. */
const LENGTH = Math.hypot(BOUNDS.x1 - BOUNDS.x0, BOUNDS.z0 - BOUNDS.z1) * 0.92;
let maxWalk = 0, maxWalkAt = '';
for (let k = 0; k < 1000; k++) {
  const t = k / 1000, t2 = t + 0.001;
  const rise = Math.abs(crossSection(t2, 1, 0) - crossSection(t, 1, 0));
  const run = 0.001 * LENGTH;
  const g = rise / run;
  if (g > maxWalk) { maxWalk = g; maxWalkAt = `${stageAt(t)} at t=${t.toFixed(2)}`; }
}
console.log(`  steepest ALONG the trail: ${maxWalk.toFixed(2)} rise/run (${(Math.atan(maxWalk) * 57.3).toFixed(0)} deg), ${maxWalkAt}`);
console.log('    a graded walking track is 12-20 deg; 30 is a scramble, 45 is a climb');
if (maxWalk > 0.70) { console.log('\n  FAIL — that is not a track, it is a wall.'); process.exitCode = 1; }
