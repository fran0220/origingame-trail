/* Do the controls do what they say, and does the view come back?
 *
 * "The controls are reversed" was reported against a car whose physics was
 * correct in every axis. What was reversed was the relationship between the
 * view and the car: the mouse look had no centre, so an ordinary mouse
 * movement parked the chase camera round the side of the car and left it
 * there, and from behind the car's own front bumper every input reads
 * backwards. This asserts on both halves — the inputs, and the view they are
 * read against.
 */
import { run } from './harness.mjs';

const fail = [];
const check = (c, m) => { if (!c) fail.push(m); };

await run({ hash: 'manual&tier=high&level=lake', timeout: 300_000 }, async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game, d = g.walker, THREE = window.THREE;
    const V = new THREE.Vector3();

    /* Displacement in the heading the car started with. */
    const trial = (keys, secs) => {
      d.placeAt(0.30);
      for (const k in d.keys) d.keys[k] = false;
      d.lookYaw = 0; d.lookPitch = 0; d._lookHeld = -99;
      const x0 = d.pos.x, z0 = d.pos.z, yaw0 = d.yaw;
      for (const k of keys) d.keys[k] = true;
      for (let i = 0; i < 60 * secs; i++) g.step(1 / 60);
      const dx = d.pos.x - x0, dz = d.pos.z - z0;
      /* The car's true right is (-cos yaw, sin yaw): in a right-handed Y-up
       * frame an object facing +Z has its right at -X. The first version of
       * this file used (cos yaw, -sin yaw) — the car's *left* — which is why
       * it passed while D steered the wrong way on screen. */
      const s = Math.sin(yaw0), c = Math.cos(yaw0);
      for (const k in d.keys) d.keys[k] = false;
      let dyaw = d.yaw - yaw0;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      return { fwd: dx * s + dz * c, right: -dx * c + dz * s, dyaw };
    };

    /* Where the camera points, in the car's frame. */
    const camInCarFrame = () => {
      g.camera.getWorldDirection(V);
      const s = Math.sin(d.yaw), c = Math.cos(d.yaw);
      return { alongNose: V.x * s + V.z * c, toRight: -V.x * c + V.z * s };
    };

    const glance = (mode, dxPix) => {
      d.placeAt(0.30); d.camMode = mode;
      d.lookYaw = 0; d.lookPitch = 0; d._lookHeld = -99;
      for (let i = 0; i < 20; i++) g.step(1 / 60);
      /* Move the mouse, as the browser would. */
      d.lookYaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dxPix * 0.0026));
      d._lookHeld = d._time;
      for (let i = 0; i < 6; i++) g.step(1 / 60);
      const held = camInCarFrame();
      /* Then stop touching it for two seconds. */
      for (let i = 0; i < 120; i++) g.step(1 / 60);
      return { held, after: camInCarFrame(), lookYaw: d.lookYaw };
    };

    return {
      W: trial(['KeyW'], 3),
      WD: trial(['KeyW', 'KeyD'], 4),
      WA: trial(['KeyW', 'KeyA'], 4),
      chaseRight: glance('chase', 200),
      chaseLeft: glance('chase', -200),
      hoodRight: glance('hood', 200),
    };
  });

  check(r.W.fwd > 5, `W moved the car ${r.W.fwd.toFixed(1)} m along its nose`);
  check(Math.abs(r.W.right) < 1.5, `W drifted ${r.W.right.toFixed(1)} m sideways`);
  check(r.WD.right > 3 && r.WD.dyaw < -0.15, 'D did not steer the car to its right');
  check(r.WA.right < -3 && r.WA.dyaw > 0.15, 'A did not steer the car to its left');

  /* A glance must point the way the mouse went, in both views. */
  check(r.chaseRight.held.toRight > 0.15,
        `mouse right aimed the chase camera ${r.chaseRight.held.toRight.toFixed(2)} to the right`);
  check(r.chaseLeft.held.toRight < -0.15,
        `mouse left aimed the chase camera ${r.chaseLeft.held.toRight.toFixed(2)} to the right`);
  check(r.hoodRight.held.toRight > 0.15,
        `mouse right aimed the hood camera ${r.hoodRight.held.toRight.toFixed(2)} to the right`);

  /* And it must come back, or every later input is read against a view that is
   * no longer pointing where the car is going. */
  for (const [name, g2] of Object.entries({ chaseRight: r.chaseRight, chaseLeft: r.chaseLeft, hoodRight: r.hoodRight })) {
    check(Math.abs(g2.lookYaw) < 0.02, `${name}: the glance did not return (lookYaw ${g2.lookYaw.toFixed(3)})`);
    check(g2.after.alongNose > 0.97, `${name}: the view did not come back to the nose (${g2.after.alongNose.toFixed(3)})`);
  }

  console.log(`  W          ${r.W.fwd.toFixed(1)} m forward, ${r.W.right.toFixed(2)} m sideways`);
  console.log(`  W+D        ${r.WD.right.toFixed(1)} m right, yaw ${(r.WD.dyaw * 57.3).toFixed(0)} deg`);
  console.log(`  W+A        ${r.WA.right.toFixed(1)} m right, yaw ${(r.WA.dyaw * 57.3).toFixed(0)} deg`);
  console.log(`  glance     chase R ${r.chaseRight.held.toRight.toFixed(2)} / L ${r.chaseLeft.held.toRight.toFixed(2)}, hood R ${r.hoodRight.held.toRight.toFixed(2)}`);
  console.log(`  return     lookYaw -> ${r.chaseRight.lookYaw.toFixed(4)}, aim ${r.chaseRight.after.alongNose.toFixed(3)} along the nose`);
});

if (fail.length) {
  console.error('FAILED');
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('ok — every input moves the car the way it says, and the view returns to the road');
