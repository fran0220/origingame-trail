/* The fallen giant, and the slot cut through it.
 *
 * Measuring the jungle the way the lake was measured — toggling every feature
 * layer at twenty stations — shows them piled into the last quarter: 16 to 21%
 * of frame around the ruins and the falls, and 2.8 to 3.6% across the whole
 * first half. The player walks roughly two hundred metres of undifferentiated
 * forest before anything happens.
 *
 * A windthrown tree across the track is what happens on a real one, and the
 * response is always the same: nobody moves a two-tonne trunk, so a crew walks
 * in with a chainsaw and takes a SLOT out of it exactly as wide as the track.
 * The result is the most recognisable object on any bush track in this
 * country, and it is worth more than its size for three reasons:
 *
 *   IT IS ON THE TRACK. Not beside it — through it. The player cannot fail to
 *   see it, and cannot fail to walk through the cut, which is the whole point.
 *
 *   IT IS A HORIZONTAL LINE. Everything in a forest is vertical; a trunk lying
 *   across the view at chest height is the strongest possible interruption,
 *   and the two sawn faces frame the track like a doorway.
 *
 *   THE CUT FACES ARE PALE. Fresh-sawn heartwood against wet bark and dark
 *   litter is the highest contrast in the level, and it reads at a distance
 *   where the trunk itself is just another dark mass.
 */
import * as THREE from 'three';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class JungleWindthrow {
  constructor(terrain, trail, tier = 'high', collision = null) {
    this.root = new THREE.Group();
    this.root.name = 'jungle-windthrow';
    this.materials = [];

    const rng = random(0x11d7a0);
    const pos = [], col = [], idx = [];
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const L = trail.length;

    const BARK = [0.072, 0.062, 0.048];
    /* Brighter than it looks on paper, and deliberately so. At 0.415 the sawn
     * faces rendered the same muted grey-green as everything else, because
     * this forest floor sits in deep shade and every albedo is dragged toward
     * the ambient. The design claim was that the cut is the highest contrast
     * in the level; a value that does not survive the lighting does not make
     * that claim true. 0.60 is still under fresh pine and it reads. */
    const SAW = [0.600, 0.512, 0.322];
    const MOSS = [0.062, 0.098, 0.048];

    /* Half a trunk: a tube from `from` to `to` in plan, at a fixed height, with
     * a flat sawn cap at the `to` end. Two of these with a gap between them is
     * a log with a slot in it, and building it that way means the cut faces
     * are real geometry rather than a texture. */
    const halfTrunk = (fx, fz, tx, tz, y0, y1, r0, r1, capAtTo) => {
      const SIDES = 10;
      const dx = tx - fx, dz = tz - fz;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      const RINGS = 6;
      const rings = [];
      for (let k = 0; k <= RINGS; k++) {
        const t = k / RINGS;
        const cx = fx + dx * t, cz = fz + dz * t;
        const cy = y0 + (y1 - y0) * t;
        const r = r0 + (r1 - r0) * t;
        const base = pos.length / 3;
        for (let s = 0; s < SIDES; s++) {
          const a = (s / SIDES) * Math.PI * 2;
          /* Bark is lumpy; a smooth cylinder is a pipe. */
          const rr = r * (0.93 + rng() * 0.14);
          const up = Math.sin(a);
          pos.push(cx + (-uz) * Math.cos(a) * rr, cy + Math.sin(a) * rr,
                   cz + (ux) * Math.cos(a) * rr);
          /* Moss on the upper side only — it grows where the rain sits. */
          const m = Math.max(0, up) * (0.35 + rng() * 0.5);
          const shade = 0.72 + 0.44 * (up * 0.5 + 0.5);
          col.push(BARK[0] * shade + MOSS[0] * m,
                   BARK[1] * shade + MOSS[1] * m,
                   BARK[2] * shade + MOSS[2] * m);
        }
        rings.push(base);
      }
      for (let k = 0; k < RINGS; k++) {
        for (let s = 0; s < SIDES; s++) {
          const n = (s + 1) % SIDES;
          idx.push(rings[k] + s, rings[k + 1] + s, rings[k] + n);
          idx.push(rings[k] + n, rings[k + 1] + s, rings[k + 1] + n);
        }
      }
      if (capAtTo) {
        /* The sawn face: a flat disc of pale heartwood, with a darker ring of
         * sapwood at its edge. This is the object the eye actually catches. */
        const rb = rings[RINGS];
        const c = pos.length / 3;
        pos.push(tx, y1, tz);
        col.push(...SAW);
        for (let s = 0; s < SIDES; s++) {
          const n = (s + 1) % SIDES;
          idx.push(c, rb + n, rb + s);
        }
        /* Re-tint the rim vertices toward sawn timber so the cut does not have
         * a bark-coloured edge. */
        for (let s = 0; s < SIDES; s++) {
          const vi = rb + s;
          for (let j = 0; j < 3; j++) {
            col[vi * 3 + j] = col[vi * 3 + j] * 0.35 + SAW[j] * 0.75;
          }
        }
      }
    };

    /* Place it a third of the way along — inside the empty first half, and far
     * enough in that the trailhead is out of sight behind. */
    const at = 0.30;
    trail.pointAt(at, P);
    trail.tangentAt(at, T);
    const yaw = Math.atan2(T.x, T.z);
    /* Across the track, with a few degrees of skew: a tree falls where it
     * falls, and one exactly perpendicular reads as a gate. */
    const cross = yaw + Math.PI / 2 + (rng() - 0.5) * 0.5;
    const cx0 = Math.sin(cross), cz0 = Math.cos(cross);
    const groundY = terrain.height(P.x, P.z);

    /* The slot: as wide as the track and no wider, which is what makes it read
     * as cut FOR the track rather than as a gap the tree happened to leave. */
    const HALF_SLOT = 0.85;
    const REACH = 9.5;
    const R_BUTT = 0.78, R_TIP = 0.46;
    const yLie = groundY + 0.72;

    /* Butt side, cut face pointing at the track. */
    halfTrunk(P.x - cx0 * REACH, P.z - cz0 * REACH,
              P.x - cx0 * HALF_SLOT, P.z - cz0 * HALF_SLOT,
              yLie + 0.22, yLie, R_BUTT, R_BUTT * 0.92, true);
    /* Tip side. */
    halfTrunk(P.x + cx0 * REACH, P.z + cz0 * REACH,
              P.x + cx0 * HALF_SLOT, P.z + cz0 * HALF_SLOT,
              yLie - 0.10, yLie, R_TIP, R_BUTT * 0.88, true);

    /* The root plate, standing on end at the butt — a windthrown tree brings
     * its roots up with it, and that vertical disc of earth and timber is the
     * second most recognisable thing about one. */
    const rpx = P.x - cx0 * (REACH + 1.2), rpz = P.z - cz0 * (REACH + 1.2);
    const rpy = terrain.height(rpx, rpz);
    const SIDES = 12;
    const rbase = pos.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * Math.PI * 2;
        const r = (1.9 + rng() * 0.5) * (ring ? 1 : 0.96);
        pos.push(rpx + (-cz0) * Math.cos(a) * r + cx0 * ring * 0.35,
                 rpy + 0.15 + Math.abs(Math.sin(a)) * r * 1.15,
                 rpz + (cx0) * Math.cos(a) * r + cz0 * ring * 0.35);
        const k = 0.62 + rng() * 0.5;
        col.push(BARK[0] * k * 1.4, BARK[1] * k * 1.25, BARK[2] * k * 1.1);
      }
    }
    for (let s = 0; s < SIDES; s++) {
      const n = (s + 1) % SIDES;
      idx.push(rbase + s, rbase + SIDES + s, rbase + n);
      idx.push(rbase + n, rbase + SIDES + s, rbase + SIDES + n);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'windthrow', color: 0xffffff, vertexColors: true,
      roughness: 0.95, metalness: 0.0, envMapIntensity: 0.20,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'windthrow:trunk';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    /* Solid on both sides of the slot, and NOT across it. The cut is the way
     * through; blocking it would be the one thing this object must not do. */
    if (collision) {
      for (const s of [-1, 1]) {
        collision.addCapsule({
          ax: P.x + cx0 * HALF_SLOT * s, az: P.z + cz0 * HALF_SLOT * s,
          bx: P.x + cx0 * REACH * s, bz: P.z + cz0 * REACH * s,
          radius: 0.70,
          minY: yLie - 1.4, maxY: yLie + 1.0,
          kind: 'windthrow',
        });
      }
    }

    this.counts = { slotWidthM: HALF_SLOT * 2, spanM: REACH * 2,
                    triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
