/* This level's surface water, drawn onto the minimap's bake.
 *
 * Not from Terrain.wetAt(): that field is *moisture*, and it reaches forty
 * metres out from the falls as spray. Painting it as water put a lake over the
 * whole ruins clearing. The pool, the channel, the spillway and the swallow
 * hole each know their own plan, so the map asks them.
 *
 * It lives beside those plans rather than inside the minimap because it is the
 * one part of the map that is not a fact about maps. Everything else that file
 * does — hillshade from sampled heights, the trail at its real width, a blit
 * through a rotation — is true of any level's map. This is true of a level
 * that happens to have a stream, a plunge pool and a spillway in it, and the
 * next level does not have any of those.
 */
import { BROOK_T0, BROOK_T1, BROOK_HEAD, brookOffset, SWALLOW } from './brook.js';
import { POOL, SPILL_Z0, SPILL_Z1, spillCentre, spillHalf } from './spillway.js';
import { smoothstep } from '../../world/noise.js';
import { trailOffset } from '../../game/anchors.js';
import { PPM } from '../../game/minimap.js';

const TAU = Math.PI * 2;
const _off = { x: 0, z: 0 };

/**
 * @param {CanvasRenderingContext2D} ctx the bake, in map pixels
 * @param {import('../game/minimap.js').Minimap} map for `mx`/`my` and the trail
 */
export function drawWater(ctx, map) {
  ctx.fillStyle = 'rgba(46,104,118,.92)';
  ctx.strokeStyle = 'rgba(46,104,118,.92)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.arc(map.mx(POOL.x), map.my(POOL.z), POOL.r * PPM, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(map.mx(SWALLOW.x), map.my(SWALLOW.z), SWALLOW.r * PPM, 0, TAU);
  ctx.fill();

  // The run below the pool, which is where the falls actually land.
  ctx.beginPath();
  let first = true;
  for (let z = SPILL_Z0; z >= SPILL_Z1; z -= 1) {
    const cx = spillCentre(z);
    const px = map.mx(cx + spillHalf(z)), py = map.my(z);
    if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
  }
  for (let z = SPILL_Z1; z <= SPILL_Z0; z += 1) {
    ctx.lineTo(map.mx(spillCentre(z) - spillHalf(z)), map.my(z));
  }
  ctx.closePath();
  ctx.fill();

  /* The brook, on the trail's own offset curve, resolved through the same
   * trailOffset() the content anchors use.
   *
   * This started out with its own copy of the lateral basis and got the sign
   * backwards, which drew the stream on the dry side of the path — twenty-two
   * metres from the water at the point the level asks you to photograph it.
   * There is exactly one right answer to "which side is `off` on" and it is
   * not one worth writing down twice. */
  ctx.lineWidth = 2.6 * PPM;
  let prev = null;
  for (let t = BROOK_T0; t <= BROOK_T1 + 1e-6; t += 0.002) {
    const c = trailOffset(t, brookOffset(t), map.trail, _off);
    const px = map.mx(c.x), py = map.my(c.z);
    /* The head of the channel is a seep, not a stream: the level ramps the
     * water in over BROOK_HEAD of arc length. Stroking the full-weight line
     * all the way to BROOK_T0 would promise a brook some twenty-five metres
     * before there is one to find. */
    if (prev) {
      ctx.globalAlpha = smoothstep(BROOK_T0, BROOK_T0 + BROOK_HEAD, t);
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    prev = [px, py];
  }
  ctx.globalAlpha = 1;
}
