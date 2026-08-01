/* Resolving authored anchors into world positions.
 *
 * The content tables describe *where* in the terms the level is authored in —
 * a position along the trail, a constant from the system that built a ruin, a
 * species and a place to look for one — and this turns those into metres. It
 * runs once at boot, after every world system has finished building, because
 * a trail-relative anchor needs the finished heightfield and a plant anchor
 * needs the finished scatter.
 */
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _tan = new THREE.Vector3();

/**
 * @param {object} at            an anchor from content.js
 * @param {object} world         { trail, terrain, veg }
 * @returns {THREE.Vector3}      ground-level world position
 */
export function resolveAnchor(at, world) {
  const { trail, terrain, veg } = world;

  if (at.kind === 'point') {
    const y = at.y != null ? at.y : terrain.height(at.x, at.z);
    return new THREE.Vector3(at.x, y, at.z);
  }

  if (at.kind === 'trail') {
    const p = trailOffset(at.t, at.off, trail);
    return new THREE.Vector3(p.x, terrain.height(p.x, p.z), p.z);
  }

  if (at.kind === 'plant') {
    const anchor = trailOffset(at.t, at.off, trail);
    const list = veg?.notable?.[at.species];
    let best = null, bestD = at.search * at.search;
    if (list) {
      for (const q of list) {
        const d = (q.x - anchor.x) ** 2 + (q.z - anchor.z) ** 2;
        if (d < bestD) { bestD = d; best = q; }
      }
    }
    /* No instance of that species grew near the anchor. Falling back to the
     * anchor keeps the subject reachable and framable — it is still the right
     * part of the forest — rather than dropping a record the player would then
     * have no way to complete. */
    if (!best) return new THREE.Vector3(anchor.x, terrain.height(anchor.x, anchor.z), anchor.z);
    return new THREE.Vector3(best.x, terrain.height(best.x, best.z), best.z);
  }

  throw new Error(`unknown anchor kind: ${at.kind}`);
}

/**
 * A point `off` metres to the side of the trail at normalised arc length `t`.
 *
 * The lateral basis is (tangent.z, -tangent.x), which is the direction whose
 * signed value in Trail.nearest().side equals `off`. Matching that convention
 * is what lets an offset measured in the debug overlay be pasted into the
 * content table unchanged.
 */
export function trailOffset(t, off, trail, out = { x: 0, z: 0 }) {
  trail.pointAt(t, _p);
  trail.tangentAt(t, _tan);
  out.x = _p.x + _tan.z * off;
  out.z = _p.z - _tan.x * off;
  return out;
}
