/* Corridor clearance for extended objects.
 *
 * This exists because the same bug was written three times in three different
 * files within one day:
 *
 *   - the lake's scree fans put boulders on the seal, because the OUTCROP was
 *     tested against the road and its debris, which runs downhill from it, was
 *     not;
 *   - the lake's shore stones sat on the seal because a beach-height test
 *     alone does not know where the road is;
 *   - the jungle's fallen trunks lay across the trail like a barricade,
 *     because an eleven-metre log was tested at its root end only.
 *
 * The shared mistake is not carelessness about any one of those. It is a
 * category error: TESTING A POINT TO PLACE A THING THAT IS NOT A POINT. A
 * scatter rule that asks "is this anchor clear?" answers a different question
 * from "is this object clear?", and the two only agree for objects with no
 * size — which is almost nothing worth drawing.
 *
 * So the rule is a function, and it takes the object's extent. Any new scatter
 * layer should reach for `clearsSegment` or `clearsDisc` rather than calling
 * `trail.nearest` once and hoping.
 */

/**
 * Is a single point at least `margin` metres from the trail centreline?
 *
 * Only correct for things genuinely smaller than the margin — a fence post, a
 * tuft, a cobble. If it has a length or a radius worth drawing, it is not this.
 */
export function clearsPoint(trail, x, z, margin, q = {}) {
  return trail.nearest(x, z, q).dist >= margin;
}

/**
 * Is a straight segment clear along its whole length?
 *
 * For logs, fences, wires, jetties, ramps — anything long. Sampling rather
 * than solving is deliberate: the trail is an arbitrary spline, the closest
 * approach has no closed form, and a sample every metre or so is both exact
 * enough and cheap enough for build-time scatter.
 */
export function clearsSegment(trail, x0, z0, x1, z1, margin, step = 1.0) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / step));
  const q = {};
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (trail.nearest(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, q).dist < margin) return false;
  }
  return true;
}

/**
 * Is a disc of radius `radius` about a point clear?
 *
 * The cheap correct answer for anything roughly round in plan — a boulder, a
 * tree, a shed, a stockyard. Adding the radius to the margin is exact for a
 * straight trail and conservative for a curved one, which is the right way to
 * be wrong.
 */
export function clearsDisc(trail, x, z, radius, margin, q = {}) {
  return trail.nearest(x, z, q).dist >= margin + radius;
}

/**
 * Is a fan clear — a spray of debris running from an origin in a direction?
 *
 * Specifically for talus and outflow: things whose ORIGIN is on the hillside
 * but whose CONTENT ends up somewhere else entirely.
 */
export function clearsFan(trail, x, z, dirX, dirZ, reach, margin, step = 1.5) {
  return clearsSegment(trail, x, z, x + dirX * reach, z + dirZ * reach, margin, step);
}
