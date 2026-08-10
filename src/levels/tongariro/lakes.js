/* The Emerald Lakes and the Blue Lake.
 *
 * These are the picture people have in their heads when they hear the name:
 * three small pools of the most improbable green, sitting in raw red scoria
 * with steam drifting over them. The colour is real and it is chemistry — the
 * water is leaching minerals out of the thermal ground under it, and it is
 * also why it smells of sulphur and why you must not drink it.
 *
 * WHY THEY ARE WORTH BUILDING BEFORE ANYTHING ELSE. The frame-share work on
 * the other two levels said the same thing twice: a set-piece measured at its
 * own station beats scatter spread along the whole route, and the strongest
 * ones are the ones that change the palette. This level is grey ash, red
 * scoria and black lava — nothing in it is even slightly green — so a handful
 * of pools at 0.35/0.72/0.55 will carry further than any amount of rock.
 *
 * They also mark the one place the route does something: you come off the
 * ridge down a scree slope and they are suddenly below you.
 */
import * as THREE from 'three';
import { Noise2D, clamp, smoothstep } from '../../world/noise.js';
import { STAGES } from './route.js';

/* Each pool: t along the route, metres off the centreline, radius, depth of
 * colour, and its own tint. The three Emerald Lakes are genuinely different
 * colours — the smallest is nearly yellow-green and the largest is closer to
 * teal, because they are different depths over different beds. */
/* CLOSE TO THE TRACK, BECAUSE THE TRACK GOES BETWEEN THEM. Placed 14 to 34 m
 * off first and they measured 0.88% of frame at their best station against a
 * bar of 5 — a walker looking along the route had them at the very edge of the
 * picture or outside it. That is not where they are: coming off Red Crater you
 * descend the scree directly into the basin and the poled route threads
 * between the pools, which is why every photograph of them is taken from about
 * six metres away.
 *
 * Bigger too. The real three are roughly 20 to 50 m across, and at 11 m radius
 * seen from 40 m they were the size of a puddle. */
const POOLS = [
  { t: 0.838, off:  12, r: 25, tint: 0x1f8f74, name: 'emerald-1' },
  { t: 0.854, off:  -8, r: 20, tint: 0x2f9b62, name: 'emerald-2' },
  { t: 0.868, off:  14, r: 28, tint: 0x18836f, name: 'emerald-3' },
  { t: 0.930, off: -26, r: 42, tint: 0x2a6ea8, name: 'blue-lake' },
];

export class Lakes {
  constructor(terrain, trail) {
    this.root = new THREE.Group();
    this.root.name = 'tongariro-lakes';
    this.materials = [];
    this.counts = { pools: 0, triangles: 0 };
    this.pools = [];

    const n = new Noise2D(0x3ea1);
    const P = new THREE.Vector3(), T = new THREE.Vector3();

    const mat = new THREE.MeshStandardMaterial({
      name: 'crater-lake',
      vertexColors: true,
      /* Rough, not mirror. These are shallow, mineral-laden and often ruffled
       * by the wind that never stops on the saddle; a glassy pool here would
       * read as a sheet of plastic. The colour comes from what is dissolved in
       * the water and from the pale bed under it, not from a reflection. */
      roughness: 0.34,
      metalness: 0.0,
      envMapIntensity: 0.85,
      transparent: true,
      opacity: 0.94,
      depthWrite: true,
    });
    this.materials.push(mat);

    for (const spec of POOLS) {
      trail.pointAt(spec.t, P);
      trail.tangentAt(spec.t, T);
      const nx = T.z, nz = -T.x;
      const cx = P.x + nx * spec.off, cz = P.z + nz * spec.off;

      /* THE POOL SITS AT THE LOWEST GROUND IT COVERS, not at its centre's
       * height. A disc placed at the centre height on any slope has half of
       * itself buried and the other half floating, which is the standard way
       * water is got wrong. */
      let low = Infinity;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        low = Math.min(low, terrain.height(cx + Math.cos(a) * spec.r * 0.92,
                                           cz + Math.sin(a) * spec.r * 0.92));
      }
      const y = low + 0.35;

      const SEG = 30, RINGS = 5;
      const pos = [], col = [], idx = [];
      const base = new THREE.Color(spec.tint);
      /* The pale rim is a NARROW band, not half the pool. At 0.55 toward near-white
       * over a gradient that ran from u 0.15 to 0.85, most of the disc was the
       * shallow tint and the whole thing read as milky turquoise rather than as
       * the deep green these are famous for. Real ones are pale only in the last
       * couple of metres where the bed comes up. */
      const shallow = new THREE.Color(spec.tint).lerp(new THREE.Color(0xa9dcc4), 0.42);
      const c = new THREE.Color();
      for (let j = 0; j <= RINGS; j++) {
        const u = j / RINGS;
        for (let s = 0; s <= SEG; s++) {
          const a = (s / SEG) * Math.PI * 2;
          /* Not a circle: a crater pool is the shape of the hollow it is in. */
          const wob = 1 + n.n(Math.cos(a) * 2.4 + spec.t * 40, Math.sin(a) * 2.4) * 0.22;
          const r = spec.r * u * wob;
          pos.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
          /* Deep in the middle, pale at the rim where the bed comes up — the
           * gradient IS the depth, and it is what makes a flat disc read as
           * water with a bottom rather than as coloured glass. */
          c.copy(shallow).lerp(base, smoothstep(0.02, 0.45, 1 - u));
          col.push(c.r, c.g, c.b);
        }
      }
      const W = SEG + 1;
      for (let j = 0; j < RINGS; j++) {
        for (let s = 0; s < SEG; s++) {
          const a0 = j * W + s, a1 = a0 + 1, b0 = a0 + W, b1 = b0 + 1;
          idx.push(a0, a1, b0, a1, b1, b0);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();

      const m = new THREE.Mesh(g, mat);
      m.name = `lake:${spec.name}`;
      m.castShadow = false;
      m.receiveShadow = true;
      this.root.add(m);
      this.pools.push({ x: cx, z: cz, y, r: spec.r, name: spec.name });
      this.counts.pools++;
      this.counts.triangles += idx.length / 3;
    }
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() {
    this.root.traverse((o) => o.geometry?.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
