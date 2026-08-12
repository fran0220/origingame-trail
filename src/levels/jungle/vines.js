/* Supplejack and kiekie: the layer between the canopy and the floor.
 *
 * The forest is built in two bands with a hole between them. There is a
 * detailed understorey up to about three metres, and there is a canopy from
 * about twelve up, and the eight metres in between contain trunks and nothing
 * else. That gap is why the level, for all its density, still reads as a set
 * of tree columns on a carpet rather than as a volume — Karangahake bush has
 * its most tangled layer exactly there, and it is cane, not tropical liana.
 *
 * Supplejack fills it, and it is the right thing to fill it with for a reason
 * beyond botany: it is the only object in the scene whose SILHOUETTE reads
 * against a bright background. Everything else here is a mass. A hanging cane
 * is a line, and a line crossing a shaft of light is the strongest depth cue
 * available in a forest interior, because the eye immediately knows which side
 * of it everything else is on.
 *
 * Two forms, and the difference matters:
 *
 *   HANGING STRANDS, which fall from the canopy under their own weight and are
 *   therefore CATENARIES with a free lower end that curls. These are the ones
 *   that catch light.
 *
 *   LOOPED SWAGS, which have grown from one crown across to another and hang
 *   between two anchors. These are what tells you there is a canopy up there
 *   at all, from a camera that cannot see it.
 */
import * as THREE from 'three';
import { clearsPoint } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class JungleVines {
  constructor(terrain, trail, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'jungle-vines';
    this.materials = [];

    const rng = random(0x71ae09);
    const pos = [], col = [], idx = [];
    const P = new THREE.Vector3();
    const L = trail.length;
    let strands = 0, swags = 0, leaves = 0;

    /* A vine is drawn as a triangular prism, not a quad billboard. Three
     * sides is the fewest that gives a rope a consistent width from every
     * direction, and a billboard strip that has to face the camera is both a
     * per-frame cost and wrong the moment you look along it. */
    const SIDES = 3;

    const strandColour = (t, rough) => {
      /* Dark brown, greener and lighter toward the tip where it is still
       * growing. Older wood at the top is nearly black in this light. */
      const g = Math.pow(t, 1.5);
      const v = 0.052 + rough * 0.030;
      return [v * (0.9 + g * 0.5), v * (0.95 + g * 1.25), v * (0.8 + g * 0.35)];
    };

    /* A leaf, as a single double-sided triangle pair on the vine. They are
     * sparse and only on the lower half — a liana's foliage is up in the
     * canopy where the light is, and what hangs down is mostly bare rope. */
    const leaf = (x, y, z, ang, size, tint) => {
      const cx = Math.cos(ang), sz2 = Math.sin(ang);
      const c = [0.055 + tint * 0.030, 0.115 + tint * 0.070, 0.038 + tint * 0.022];
      const a = pos.length / 3;
      pos.push(x, y, z,
               x + cx * size - sz2 * size * 0.34, y - size * 0.30, z + sz2 * size + cx * size * 0.34,
               x + cx * size + sz2 * size * 0.34, y - size * 0.30, z + sz2 * size - cx * size * 0.34);
      for (let k = 0; k < 3; k++) col.push(...c);
      idx.push(a, a + 1, a + 2, a, a + 2, a + 1);
      leaves++;
    };

    /* Extrude a polyline into a tapered prism. */
    const rope = (path, r0, r1, rough) => {
      const base = pos.length / 3;
      for (let i = 0; i < path.length; i++) {
        const t = i / (path.length - 1);
        const r = r0 + (r1 - r0) * t;
        const c = strandColour(t, rough);
        for (let k = 0; k < SIDES; k++) {
          const a = (k / SIDES) * Math.PI * 2 + t * 2.2;
          /* The twist (t * 2.2) is what makes a vine look like a vine: real
           * lianas are helical, and a prism that does not rotate along its
           * length reads as extruded plastic. */
          const shade = 0.72 + 0.42 * (Math.cos(a) * 0.5 + 0.5);
          pos.push(path[i][0] + Math.cos(a) * r, path[i][1], path[i][2] + Math.sin(a) * r);
          col.push(c[0] * shade, c[1] * shade, c[2] * shade);
        }
      }
      for (let i = 0; i < path.length - 1; i++) {
        for (let k = 0; k < SIDES; k++) {
          const a = base + i * SIDES + k, b = base + i * SIDES + (k + 1) % SIDES;
          idx.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
        }
      }
    };

    const DENS = tier === 'low' ? 0.35 : tier === 'medium' ? 0.65 : 1.0;
    const CLEAR = 1.9;

    const site = (near, far) => {
      for (let k = 0; k < 20; k++) {
        trail.pointAt(rng(), P);
        const a = rng() * Math.PI * 2;
        const r = near + Math.pow(rng(), 0.65) * (far - near);
        const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        if (!clearsPoint(trail, x, z, CLEAR)) continue;
        return { x, z, y: terrain.height(x, z) };
      }
      return null;
    };

    /* ── hanging strands ────────────────────────────────────────────────── */
    const nStrand = Math.round(L * 2.10 * DENS);
    for (let i = 0; i < nStrand; i++) {
      const s = site(2.2, 20);
      if (!s) continue;
      const top = s.y + 9 + rng() * 8;
      /* How far down it reaches. Most stop well clear of the floor — a vine
       * that touches down has usually rooted and become a stem, which is a
       * different object. */
      const drop = 3.0 + Math.pow(rng(), 1.4) * (top - s.y - 1.2);
      const SEG = 9;
      const r0 = 0.020 + rng() * 0.040;
      const rough = rng();
      /* Sway: the strand is not plumb. Amplitude grows toward the free end,
       * and the last two segments curl, because the tip of a hanging liana is
       * the youngest and lightest part of it. */
      const swayA = rng() * 6.283, swayR = 0.25 + rng() * 0.9;
      const path = [];
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG;
        const curl = Math.pow(Math.max(0, t - 0.72) / 0.28, 2) * (0.5 + rng() * 0.6);
        const off = swayR * t * t + curl;
        path.push([s.x + Math.cos(swayA + t * 2.6) * off,
                   top - drop * t,
                   s.z + Math.sin(swayA + t * 2.6) * off]);
      }
      rope(path, r0, r0 * 0.55, rough);
      strands++;
      if (rng() < 0.5) {
        const n = 1 + ((rng() * 4) | 0);
        for (let k = 0; k < n; k++) {
          const t = 0.45 + rng() * 0.5;
          const j = Math.min(SEG, Math.round(t * SEG));
          leaf(path[j][0], path[j][1], path[j][2], rng() * 6.283,
               0.10 + rng() * 0.16, rng());
        }
      }
    }

    /* ── swags between crowns ───────────────────────────────────────────── */
    const nSwag = Math.round(L * 0.38 * DENS);
    for (let i = 0; i < nSwag; i++) {
      const a = site(3.0, 22);
      if (!a) continue;
      const ang = rng() * 6.283;
      const span = 5 + rng() * 11;
      const bx = a.x + Math.cos(ang) * span, bz = a.z + Math.sin(ang) * span;
      if (!clearsPoint(trail, bx, bz, CLEAR)) continue;
      const by = terrain.height(bx, bz);
      const ay = a.y + 10 + rng() * 6, byy = by + 10 + rng() * 6;
      /* A real catenary, not an arc. The sag is a fraction of the span, which
       * is what makes a long swag hang lower than a short one — an arc of
       * fixed curvature gets this backwards and looks like a croquet hoop. */
      const sag = span * (0.16 + rng() * 0.20);
      const SEG = 10;
      const path = [];
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG;
        const u = (t - 0.5) * 2;
        path.push([a.x + (bx - a.x) * t,
                   ay + (byy - ay) * t - sag * (1 - u * u),
                   a.z + (bz - a.z) * t]);
      }
      const r0 = 0.028 + rng() * 0.035;
      rope(path, r0, r0 * 0.85, rng());
      swags++;
      const n = 2 + ((rng() * 5) | 0);
      for (let k = 0; k < n; k++) {
        const j = 1 + ((rng() * (SEG - 1)) | 0);
        leaf(path[j][0], path[j][1] - 0.05, path[j][2], rng() * 6.283,
             0.10 + rng() * 0.14, rng());
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.94, metalness: 0.0,
      side: THREE.DoubleSide,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'vines';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.counts = { strands, swags, leaves, triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
