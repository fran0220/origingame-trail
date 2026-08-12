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
    /* OPEN LOOKING AT THE DIVIDE, NOT AT THE BOOT LID.
     *
     * Travel is −Z, the lake is −X, the Alps sit on the northern horizon.
     * The previous arc started *ahead* of the car and looked back at it, so
     * the first frame faced south into empty terrace and never saw the range
     * this level is named for. Hold west of the road and high, look north-
     * west across the water at the massif, then drop onto the chase rig. */
    this._targetPos.copy(camPos);
    this._targetLook.copy(camLook);

    const openX = carPos.x - 72;
    const openY = carPos.y + 28;
    const openZ = carPos.z - 24;
    const lookX = carPos.x - 300;
    const lookY = carPos.y + 148;
    const lookZ = carPos.z - 1980;

    this._pos.set(
      openX + (this._targetPos.x - openX) * e,
      openY + (this._targetPos.y - openY) * e,
      openZ + (this._targetPos.z - openZ) * e);
    this._look.set(
      lookX + (this._targetLook.x - lookX) * e,
      lookY + (this._targetLook.y - lookY) * e,
      lookZ + (this._targetLook.z - lookZ) * e);

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
    this.camera.updateMatrixWorld();

    if (s >= 1) { this.done = true; this.active = false; }
    return true;
  }
}
