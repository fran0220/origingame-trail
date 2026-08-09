/* One driver, shared by every tool that needs the car driven.
 *
 * The point of a fixed driver is the same as the point of a fixed camera
 * station: if the line is the same between two runs, a change in the numbers is
 * a change in the car. That only holds if the driver is *competent*, though.
 * The first version of this was a bang-bang controller that aimed at a point a
 * fixed fraction of arc length ahead and lifted on a heading error, and it
 * spent a third of the stage off the road — so every handling number it
 * produced was really a measurement of how badly it drove, and tuning the car
 * against it would have meant tuning the car to flatter a bad driver.
 *
 * This one does what a driver does:
 *
 *   Looks ahead a distance that grows with speed, at the centre of its own
 *   lane rather than at the crown of the road.
 *
 *   Reads the curvature of the road it is about to be on and sets a speed for
 *   it from the grip available — v = sqrt(a / kappa) — rather than braking
 *   after the corner has already started.
 *
 *   Steers to a *target angle* instead of holding a key down. The keyboard is
 *   binary and the car ramps toward full lock while a key is held, so a
 *   controller that presses until the error goes away always overshoots and
 *   then has to catch itself. Aiming at an angle and releasing once it is
 *   reached is what a person does, and it is the difference between hands that
 *   are busy and hands that are not.
 */

/** Signed distance from the car to the centre of its own lane, and the heading
 *  of that lane, at a point `lookM` ahead. */
function laneTarget(g, lookM, LANE = 1.75) {
  const trail = g.trail, d = g.walker, THREE = window.THREE;
  const P = laneTarget._P ||= new THREE.Vector3();
  const T = laneTarget._T ||= new THREE.Vector3();
  const q = trail.nearest(d.pos.x, d.pos.z, {});
  const t = Math.min(1, q.t + lookM / trail.length);
  trail.pointAt(t, P); trail.tangentAt(t, T);
  const ay = Math.atan2(T.x, T.z);
  /* (cos yaw, -sin yaw) is the left of a nose-+Z car in this frame; New
   * Zealand drives on the left. */
  return { t: q.t, off: q.dist, x: P.x + Math.cos(ay) * LANE, z: P.z - Math.sin(ay) * LANE };
}

/**
 * The fastest speed the car may be doing *now* to still make everything ahead.
 *
 * The first version took the worst curvature in the next 150 m, weighted it,
 * and turned it into a speed. That is not how braking works: a 120 m corner
 * 140 m away does not limit you now, and the same corner 40 m away limits you
 * a great deal. Taking a single worst-case over the window therefore brakes
 * far too early for distant corners and far too late for near ones, and the
 * trace showed it — the car held its lane on the straights and ran 6 m wide
 * through the bends.
 *
 * The standard construction instead: for every point ahead, work out the speed
 * that point needs, then work backwards through the braking the car can
 * actually do to get the speed permitted here — v = sqrt(v_req^2 + 2 a s).
 * The minimum over the window is the answer, and it is exact rather than
 * heuristic.
 */
function speedLimitAhead(g, spanM, cornerA, brakeA) {
  const trail = g.trail, d = g.walker, THREE = window.THREE;
  const A = speedLimitAhead._A ||= new THREE.Vector3();
  const B = speedLimitAhead._B ||= new THREE.Vector3();
  const C = speedLimitAhead._C ||= new THREE.Vector3();
  const q = trail.nearest(d.pos.x, d.pos.z, {});
  const L = trail.length;
  const SP = 12;
  let limit = Infinity;
  for (let s = 0; s < spanM; s += SP) {
    const t0 = Math.min(1, q.t + s / L);
    const t1 = Math.min(1, q.t + (s + SP) / L);
    const t2 = Math.min(1, q.t + (s + 2 * SP) / L);
    if (t2 >= 1) break;
    trail.pointAt(t0, A); trail.pointAt(t1, B); trail.pointAt(t2, C);
    const ax = B.x - A.x, az = B.z - A.z, bx = C.x - B.x, bz = C.z - B.z;
    const cross = Math.abs(ax * bz - az * bx);
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(C.x - A.x, C.z - A.z);
    if (la * lb * lc < 1e-6) continue;
    const k = 2 * cross / (la * lb * lc);
    const vHere = k > 1e-5 ? Math.sqrt(cornerA / k) : Infinity;
    /* What we may be doing now and still shed the difference by then. */
    const vNow = Math.sqrt(vHere * vHere + 2 * brakeA * s);
    if (vNow < limit) limit = vNow;
  }
  return limit;
}

/**
 * One frame of driving. Sets keys on the driver; the caller still calls step().
 * @param {object} g   window.__game
 * @param {object} [o] cornerG: how much lateral the driver is willing to use.
 */
export function drive(g, o = {}) {
  const d = g.walker;
  const cornerG = o.cornerG ?? 8.4;      // m/s^2 the driver plans corners at
  const vmax = o.vmax ?? 62;

  const look = laneTarget(g, 11 + d.speed * 0.95);
  let err = Math.atan2(look.x - d.pos.x, look.z - d.pos.z) - d.yaw;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;

  /* Target roadwheel angle, not a direction to hold a key in. The gain is
   * scaled down with speed because the same angle is a much larger lateral
   * acceleration at 45 m/s than at 15. */
  const gain = 0.85 / (1 + d.speed * 0.045);
  let want = err * gain * 3.2;
  const lock = 0.52;
  want = Math.max(-lock, Math.min(lock, want));

  /* Steer toward that angle and stop when it is reached. `_readInput` ramps
   * `steer` while a key is down and springs it back when both are up, so
   * releasing inside the tolerance band is what holds a steady angle. */
  const tol = 0.012;
  d.keys.KeyA = want - d.steer > tol;
  d.keys.KeyD = want - d.steer < -tol;

  /* Speed planning, looking far enough ahead to brake rather than to react.
   * 260 m is about six seconds at 160 km/h, which is roughly how far a driver
   * on an open road is actually reading. */
  const target = Math.min(vmax, speedLimitAhead(g, 260, cornerG, o.brakeA ?? 7.0));

  const over = d.speed - target;
  d.keys.KeyW = over < -0.8;
  d.keys.KeyS = over > 0.6;
  /* Never fully off the throttle in a long corner: a car coasting at the limit
   * is on its nose and will not hold a line. */
  if (!d.keys.KeyS && over < 1.0) d.keys.KeyW = true;

  return { err, want, target, off: look.off, t: look.t };
}
