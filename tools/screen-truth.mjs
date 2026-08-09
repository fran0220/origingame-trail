/* Everything the player judges, measured in the frame the player has.
 *
 * The world-space version of this test passed while the car steered the wrong
 * way, because it asserted against the same mirrored lateral axis the bug
 * lived in. In three.js's right-handed Y-up frame an object facing +Z has its
 * right at -X, and this model's lateral axis is +X — so "the car moved toward
 * its right" and "the car moved toward the right of the screen" were opposite
 * claims, and only the second one is a claim about the game.
 *
 * So: freeze the camera, apply an input, and project. Nothing here derives a
 * handedness; it measures one.
 */
import { run } from './harness.mjs';

const fail = [];
const check = (c, m) => { if (!c) fail.push(m); };

await run({ hash: 'manual&tier=high&level=lake', timeout: 300_000 }, async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game, d = g.walker, THREE = window.THREE;
    const cam = g.camera, V = new THREE.Vector3();
    const frozen = new THREE.Matrix4();

    const reset = () => {
      d.placeAt(0.30);
      for (const k in d.keys) d.keys[k] = false;
      d.lookYaw = 0; d.lookPitch = 0; d._lookHeld = -99;
      d.vx = d.vy = d.yawRate = 0; d.steer = 0;
    };
    /* Project with a camera matrix captured before the input, so the chase
     * camera cannot follow the car and hide the answer. */
    const freeze = () => {
      cam.updateMatrixWorld();
      frozen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    };
    const ndcX = (x, y, z) => {
      V.set(x, y, z).applyMatrix4(frozen);
      return V.x;
    };

    const steerTest = (key, secs) => {
      reset();
      d.keys.KeyW = true;
      for (let i = 0; i < 90; i++) g.step(1 / 60);      // get rolling
      freeze();
      const x0 = ndcX(d.pos.x, d.pos.y + 0.6, d.pos.z);
      d.keys[key] = true;
      for (let i = 0; i < 60 * secs; i++) g.step(1 / 60);
      const x1 = ndcX(d.pos.x, d.pos.y + 0.6, d.pos.z);
      const roll = d.bodyRoll;
      for (const k in d.keys) d.keys[k] = false;
      return { screenMove: +(x1 - x0).toFixed(3), roll: +roll.toFixed(4) };
    };

    const out = { D: steerTest('KeyD', 1.6), A: steerTest('KeyA', 1.6) };

    /* The glance, in the same frame. */
    const glance = (mode, yaw) => {
      reset(); d.camMode = mode;
      for (let i = 0; i < 30; i++) g.step(1 / 60);
      freeze();
      /* A landmark straight ahead: if the view turns right, it must slide left. */
      const s = Math.sin(d.yaw), c = Math.cos(d.yaw);
      const px = d.pos.x + s * 40, pz = d.pos.z + c * 40, py = d.pos.y + 2;
      const before = ndcX(px, py, pz);
      d.lookYaw = yaw; d._lookHeld = d._time;
      for (let i = 0; i < 8; i++) g.step(1 / 60);
      cam.updateMatrixWorld();
      frozen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      const after = ndcX(px, py, pz);
      d.camMode = 'chase';
      return +(after - before).toFixed(3);
    };
    out.glanceRightChase = glance('chase', 0.5);
    out.glanceRightHood = glance('hood', 0.5);
    return out;
  });

  /* Steering: D must move the car toward the right of the frame. */
  check(r.D.screenMove > 0.05, `D moved the car ${r.D.screenMove} in NDC x (want > 0, i.e. right of frame)`);
  check(r.A.screenMove < -0.05, `A moved the car ${r.A.screenMove} in NDC x (want < 0, i.e. left of frame)`);

  /* Body roll: cornering throws the mass outward, so a right-hand turn leans
   * the car onto its left side. carMesh takes positive roll as "right side
   * down", so a right turn must produce a negative value. */
  check(r.D.roll < 0, `right turn rolled ${r.D.roll} (want < 0: lean out of the turn, onto the left wheels)`);
  check(r.A.roll > 0, `left turn rolled ${r.A.roll} (want > 0)`);

  /* Glance: turning the head right must slide a landmark ahead to the left. */
  check(r.glanceRightChase < -0.05, `chase glance right moved a forward landmark ${r.glanceRightChase} (want < 0)`);
  check(r.glanceRightHood < -0.05, `hood glance right moved a forward landmark ${r.glanceRightHood} (want < 0)`);

  console.log(`  steer      D ${r.D.screenMove >= 0 ? '+' : ''}${r.D.screenMove} NDC   A ${r.A.screenMove} NDC`);
  console.log(`  roll       D ${r.D.roll}   A ${r.A.roll}`);
  console.log(`  glance     chase ${r.glanceRightChase}   hood ${r.glanceRightHood}`);
});

if (fail.length) {
  console.error('FAILED');
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('ok — inputs move the car and the view the way the screen says they should');
