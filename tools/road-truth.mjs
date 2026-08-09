/* Does the seal lie on the ground the carve made?
 *
 * A road that floats is the single most damaging defect this level can have,
 * and it is nearly impossible to judge from a frame: an embankment and a
 * hovering ribbon look identical from the driving position and differ only in
 * whether the terrain under the shoulder rises to meet it. So measure it.
 *
 * For a grid of points across and along the road, compare the ribbon's design
 * surface against the terrain heightfield beneath. On the sealed formation the
 * two must agree to within a few centimetres — the deliberate LIFT and the
 * terrain mesh's own 0.6 m sampling — and outside it the terrain must return
 * to natural ground smoothly, with no step.
 */
import { run } from './harness.mjs';

await run({ hash: 'manual&tier=high&level=lake', timeout: 300_000 }, async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game;
    const lv = g.level, terrain = g.terrain, trail = g.trail;
    const THREE = window.THREE;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const HALF = 4.1, SHOULDER = 5.9;

    const rows = [];
    let worstSeal = 0, worstSealAt = null;
    let worstStep = 0, worstStepAt = null;
    const grades = [];

    let prevY = null, prevS = 0;
    for (let i = 0; i <= 240; i++) {
      const t = i / 240;
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;

      // grade of the centreline
      const cy = terrain.roadY(t, 0);
      const s = t * trail.length;
      if (prevY !== null) grades.push(Math.abs(cy - prevY) / Math.max(1e-6, s - prevS));
      prevY = cy; prevS = s;

      for (const o of [-5.6, -4.0, -2.0, 0, 2.0, 4.0, 5.6]) {
        const x = P.x + nx * o, z = P.z + nz * o;
        const design = terrain.roadY(t, o)
          - Math.max(0, Math.abs(o) - HALF) * 0.030 * 1.9;
        const ground = terrain.height(x, z);
        const gap = design - ground;      // >0 means ribbon above ground
        if (Math.abs(o) <= HALF && Math.abs(gap) > Math.abs(worstSeal)) {
          worstSeal = gap; worstSealAt = { t: +t.toFixed(3), o, gap: +gap.toFixed(3) };
        }
      }

      // step just outside the formation: terrain must not cliff away
      for (const side of [-1, 1]) {
        const a = terrain.height(P.x + nx * SHOULDER * side, P.z + nz * SHOULDER * side);
        const b = terrain.height(P.x + nx * (SHOULDER + 1.0) * side, P.z + nz * (SHOULDER + 1.0) * side);
        const step = Math.abs(a - b);
        if (step > worstStep) { worstStep = step; worstStepAt = { t: +t.toFixed(3), side, step: +step.toFixed(3) }; }
      }
    }

    grades.sort((a, b) => a - b);
    return {
      worstSeal: +worstSeal.toFixed(3), worstSealAt,
      worstStep: +worstStep.toFixed(3), worstStepAt,
      gradeMax: +grades[grades.length - 1].toFixed(4),
      gradeP99: +grades[Math.floor(grades.length * 0.99)].toFixed(4),
      length: +trail.length.toFixed(1),
      roadStats: lv.road?.stats?.() ?? null,
    };
  });

  console.log(`  seal on formation   worst ${r.worstSeal.toFixed(3)} m`);
  console.log(`  batter step         worst ${r.worstStep.toFixed(3)} m / m`);
  console.log(`  grade               max ${(r.gradeMax * 100).toFixed(1)}%  p99 ${(r.gradeP99 * 100).toFixed(1)}%`);
  console.log(`  stage               ${r.length} m, ${r.roadStats.tris} tris, ${r.roadStats.posts} posts`);

  const fail = [];
  /* The seal must lie on the ground the carve made. The tolerance is the
   * deliberate 45 mm lift plus the terrain grid's own 0.6 m sampling, and it
   * is tight on purpose: this number was 1.34 m when the trail had two
   * meanings for `t`, and nothing in a frame said so. */
  if (Math.abs(r.worstSeal) > 0.12) {
    fail.push(`seal floats ${r.worstSeal.toFixed(3)} m over its formation at t=${r.worstSealAt.t}`);
  }
  /* A batter is a slope, not a cliff. Anything approaching 1:1 just outside
   * the shoulder is a wall a car would climb rather than an embankment. */
  if (r.worstStep > 1.1) {
    fail.push(`batter steps ${r.worstStep.toFixed(2)} m in one metre at t=${r.worstStepAt.t}`);
  }
  /* The grade limiter in _buildPathProfile exists to keep this drivable. */
  if (r.gradeMax > 0.11) {
    fail.push(`grade reaches ${(r.gradeMax * 100).toFixed(1)}%, past what the limiter allows`);
  }
  if (fail.length) {
    console.error('FAILED');
    for (const f of fail) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('ok — the seal lies on its formation, and the grade is drivable');
});
