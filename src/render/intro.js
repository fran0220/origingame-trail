/* The opening move: from the basin to the driver's seat.
 *
 * A stage does not begin at the wheel. It begins with the helicopter shot that
 * tells you where you are, and then it comes down to the car — and the reason
 * that shot exists in every rally broadcast is that the landscape is the
 * point, and once you are in the seat you can never see it again. This level
 * spends its whole budget on a basin the player only ever glimpses past a
 * wing mirror at 130 km/h. Thirty seconds of it, once, costs nothing and is
 * the only chance the scenery gets to be looked at.
 *
 * HOW IT IS BUILT, and the constraint that shapes it:
 *
 *   IT ENDS EXACTLY WHERE THE GAME BEGINS. The last frame of the intro is the
 *   first frame of play, to the pixel. Anything else is a cut, and a cut here
 *   reads as a loading screen. So the path is defined as an OFFSET from the
 *   live chase camera rather than as absolute positions: at s = 1 the offset
 *   is zero and the intro is the game, whatever the game's camera happens to
 *   be doing.
 *
 *   IT IS SKIPPABLE ON THE FIRST INPUT. A cinematic you cannot escape is a
 *   tax on every replay after the first, and this stage is meant to be
 *   replayed. Any key, click or touch ends it.
 *
 *   IT USES SMOOTHSTEP TWICE, NOT ONCE. A single ease-out arrives at the seat
 *   still moving and the hand-off shows. Squaring the ease means the last
 *   second is nearly stationary, so the join is invisible even though the
 *   camera has travelled four hundred metres to reach it.
 */
import * as THREE from 'three';

const V = () => new THREE.Vector3();

export class Intro {
  /**
   * @param {THREE.Camera} camera the live camera; driven directly.
   * @param {{seconds?:number}} [opts]
   */
  constructor(camera, opts = {}) {
    this.camera = camera;
    this.seconds = opts.seconds ?? 9.0;
    this.elapsed = 0;
    this.done = false;
    this.active = true;
    this._pos = V();
    this._look = V();
    this._targetPos = V();
    this._targetLook = V();
  }

  skip() { this.done = true; this.active = false; }

  /**
   * Drive the camera for this frame.
   *
   * @param {number} dt seconds
   * @param {THREE.Vector3} carPos where the car is
   * @param {THREE.Vector3} camPos where the game camera wants to be
   * @param {THREE.Vector3} camLook where the game camera wants to look
   */
  update(dt, carPos, camPos, camLook) {
    if (this.done) return false;
    this.elapsed += dt;
    const s = Math.min(1, this.elapsed / this.seconds);

    /* Squared smoothstep: eases in AND out, then eases out again, so the
     * approach to the seat is asymptotic and the hand-off cannot be seen. */
    const ss = s * s * (3 - 2 * s);
    const e = ss * ss * (3 - 2 * ss);

    /* THE ARC. High and wide over the lake at the start, swinging in and down.
     * Expressed relative to the car so it works wherever the car is, and so
     * the end state is exactly the game camera with no special-casing.
     *
     * The height falls faster than the distance: dropping out of the sky
     * before closing the range is what makes it read as a helicopter coming
     * down to a road, rather than as a zoom. */
    /* FLAT AND FAR, NOT HIGH AND CLOSE. At 88 m up and 150 m out the camera
     * pitches down about 30 degrees, and at that angle it looks straight over
     * the far edge of a finite terrain into the void beyond it — the top half
     * of the opening frame was empty green. Trading height for distance keeps
     * the same view of the road while putting the horizon, and therefore the
     * sky and the Alps, back above it. 52 over 205 is about 14 degrees. */
    const dist = 205 * (1 - e);
    const height = 52 * (1 - e) * (1 - e * 0.35);
    /* A HALF TURN, STARTING AHEAD OF THE CAR AND ENDING BEHIND IT.
     *
     * The first cut orbited a quarter turn outward at 340 m and 165 m up, and
     * the opening frame was a floating slab of terrain in a green void — the
     * camera was at x = -326, z = 101, and the basin is x from -300 to 210, z
     * from 70 to -1990. It was outside the world. The car spawns at z = 48,
     * which is 22 m from the near edge, so there is no room BEHIND the start
     * and none to either side at that radius.
     *
     * The only direction with two kilometres of map in it is FORWARD, down the
     * stage. So the shot opens ahead of the car looking back at it, with the
     * road the player is about to drive laid out underneath, and swings a full
     * half turn to arrive behind the car facing the way it is pointing. That
     * is both the safe volume and the better shot: it shows the stage first
     * and the driver second. */
    const ang = (1 - e) * Math.PI;

    this._targetPos.copy(camPos);
    this._targetLook.copy(camLook);

    const bx = camPos.x - carPos.x, bz = camPos.z - carPos.z;
    const bl = Math.hypot(bx, bz) || 1;
    const ux = bx / bl, uz = bz / bl;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = ux * ca - uz * sa, rz = ux * sa + uz * ca;

    this._pos.set(
      this._targetPos.x + rx * dist,
      this._targetPos.y + height,
      this._targetPos.z + rz * dist);
    /* The look target slides from the car itself to wherever the game wants
     * to look. Early on it is the car that anchors the shot; by the end it is
     * the road ahead, which is what the player needs. */
    this._look.lerpVectors(carPos, this._targetLook, e);

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
    this.camera.updateMatrixWorld();

    if (s >= 1) { this.done = true; this.active = false; }
    return true;
  }
}
