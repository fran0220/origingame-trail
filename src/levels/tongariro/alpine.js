/* The vegetation line.
 *
 * Below about 1400 m the Mangatepopo valley is tussock, and by the saddle
 * there is nothing at all. That transition is not decoration — it is the
 * single clearest way a player can be told how high they have climbed, and it
 * costs no UI: the plants simply stop.
 *
 * FOUR THINGS, all of them common enough on the Central Plateau that leaving
 * any of them out is what makes a tussock slope look like a golf course:
 *
 *   RED TUSSOCK, in big loose clumps, the dominant cover on the valley floor.
 *   SNOW TUSSOCK higher and sparser, paler and more upright.
 *   DRACOPHYLLUM — "turpentine scrub" — a stiff dark shrub with a bare woody
 *   base, which is what breaks up a field of grass into something with
 *   structure.
 *   BOG PINE in the wet hollows, low and spreading.
 *
 * The whole thing is instanced off two primitives, a blade fan and a twig
 * bush, because at this density anything else is unaffordable and at this
 * distance nothing else is visible.
 */
import * as THREE from 'three';
import { Noise2D, clamp, smoothstep, lerp } from '../../world/noise.js';
import { DATUM, VERT } from './route.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A tussock: a fan of blades from one point, each a tapered strip that bends
 * outward. Blades are bent rather than flat for the reason the bush's leaves
 * are — a flat strip changes brightness all at once and reads as a card. */
function tussockGeo(rng, blades, height, spread) {
  const pos = [], col = [], idx = [];
  const base = [0.34, 0.30, 0.17], tip = [0.62, 0.55, 0.32];
  for (let b = 0; b < blades; b++) {
    const a = rng() * 6.283;
    const lean = (0.25 + rng() * 0.75) * spread;
    const h = height * (0.55 + rng() * 0.62);
    const w = 0.016 + rng() * 0.014;
    const SEG = 4;
    const dx = Math.cos(a), dz = Math.sin(a);
    let prev = null;
    for (let s = 0; s <= SEG; s++) {
      const u = s / SEG;
      /* Blades arc over: straight up at the base, falling away at the tip,
       * which is what makes a tussock a fountain and not a hedgehog. */
      const bend = u * u;
      const x = dx * lean * bend, z = dz * lean * bend;
      const y = h * u * (1 - 0.18 * bend);
      const hw = w * (1 - u * 0.82);
      const n0 = pos.length / 3;
      pos.push(x - dz * hw, y, z + dx * hw, x + dz * hw, y, z - dx * hw);
      const k = lerp(0, 1, u);
      const c = [lerp(base[0], tip[0], k), lerp(base[1], tip[1], k), lerp(base[2], tip[2], k)];
      col.push(...c, ...c);
      if (prev !== null) idx.push(prev, prev + 1, n0, prev + 1, n0 + 1, n0);
      prev = n0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* A stiff shrub: a few woody stems with a dark mass on top. */
function shrubGeo(rng, dark) {
  const pos = [], col = [], idx = [];
  const wood = [0.130, 0.104, 0.072];
  const leaf = dark ? [0.088, 0.126, 0.070] : [0.155, 0.170, 0.098];
  const box = (cx, cy, cz, hw, h, hd, c) => {
    const b = pos.length / 3;
    for (let i = 0; i < 8; i++) {
      pos.push(cx + ((i & 1) ? hw : -hw), cy + ((i & 2) ? h : 0), cz + ((i & 4) ? hd : -hd));
      col.push(...c);
    }
    const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
    F.forEach((f) => idx.push(b+f[0], b+f[1], b+f[2], b+f[0], b+f[2], b+f[3]));
  };
  const n = 3 + ((rng() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + rng();
    const r = rng() * 0.18;
    const h = 0.22 + rng() * 0.30;
    box(Math.cos(a) * r, 0, Math.sin(a) * r, 0.020, h * 0.55, 0.020, wood);
    /* FOLIAGE OVERLAPPING DOWN THE STEM, NOT PERCHED ON TOP OF IT. The first
     * version put one lump at the top of each bare stick and a field of them
     * read as small dark tables — the gap between the ground and the leaves
     * was the whole silhouette, and a shrub does not have one. Dracophyllum
     * does hold its leaves in tufts at the ends of stems, but the stems are
     * short and the tufts overlap into a single stiff mass. */
    const fh = 0.16 + rng() * 0.16;
    box(Math.cos(a) * r * 1.15, h * 0.42, Math.sin(a) * r * 1.15,
        0.11 + rng() * 0.09, fh, 0.11 + rng() * 0.09, leaf);
    box(Math.cos(a) * r * 0.6, h * 0.30 + fh * 0.5, Math.sin(a) * r * 0.6,
        0.09 + rng() * 0.07, fh * 0.8, 0.09 + rng() * 0.07, leaf);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Alpine {
  constructor(terrain, trail, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'tongariro-alpine';
    this.materials = [];
    const rng = random(0x77c1a5);
    const dense = tier === 'low' ? 0.35 : tier === 'medium' ? 0.65 : 1;

    const V = 4;
    const geos = {
/* Bigger. Red tussock is knee to waist high and a 0.62 m clump read as a
       * tuft of dry grass; the whole point of it is that it is the thing you
       * are wading through. */
      red:   Array.from({ length: V }, () => tussockGeo(rng, 56, 1.08, 0.58)),
      snow:  Array.from({ length: V }, () => tussockGeo(rng, 40, 1.18, 0.42)),
      scrub: Array.from({ length: V }, () => shrubGeo(rng, true)),
      bog:   Array.from({ length: V }, () => shrubGeo(rng, false)),
    };

    const mat = new THREE.MeshStandardMaterial({
      name: 'alpine-plants', vertexColors: true, side: THREE.DoubleSide,
      roughness: 0.94, metalness: 0.0, envMapIntensity: 0.28,
    });
    this.materials.push(mat);

    /* THE LIMITS ARE ALTITUDES, IN REAL METRES, because that is what they are
     * on the mountain and because writing them in model units would silently
     * break the next time the vertical scale moves — which has already
     * happened once to the scoria colour. */
    const KINDS = [
      { key: 'red',   n: 72000, lo: 1120, hi: 1480, wet: 0.0 },
      { key: 'snow',  n: 34000, lo: 1240, hi: 1640, wet: 0.0 },
      { key: 'scrub', n: 14000, lo: 1120, hi: 1540, wet: 0.0 },
      { key: 'bog',   n:  4000, lo: 1120, hi: 1400, wet: 0.0 },
    ];

    const B = terrain.bounds;
    const areaKm2 = ((B.x1 - B.x0) * (B.z0 - B.z1)) / 1e6;
    const nz = new Noise2D(0x61b2);
    const q = {}, dummy = new THREE.Object3D();
    this.counts = { total: 0 };

    for (const spec of KINDS) {
      const lists = Array.from({ length: V }, () => []);
      const want = Math.round(spec.n * areaKm2 * dense);
      let tries = 0;
      while (lists.reduce((a, l) => a + l.length, 0) < want && tries < want * 6) {
        tries++;
        const x = B.x0 + rng() * (B.x1 - B.x0);
        const z = B.z1 + rng() * (B.z0 - B.z1);
        const y = terrain.height(x, z);
        if (y < 5) continue;
        const realY = y / VERT + DATUM;
        /* Fade in at the bottom of the band and out at the top, so the cover
         * thins with height instead of stopping at a contour line. Nothing
         * about a bushline is a line when you are standing on it. */
        const band = smoothstep(spec.lo, spec.lo + 90, realY)
                   * (1 - smoothstep(spec.hi - 160, spec.hi, realY));
        if (band < 0.02 || rng() > band) continue;
        const slope = terrain.slopeAt(x, z);
        if (slope > 0.38) continue;
        terrain.sampleField(x, z, q);
        if (q.dist < trail.widthAt(clamp(q.t, 0, 1)) + 1.1) continue;
        /* Patchy, like the rock: tussock grows in stands with bare scoria
         * between, and an even lawn is the tell. */
        const patch = clamp(Math.pow(nz.n(x * 0.014, z * 0.014) * 0.5 + 0.58, 1.6) * 1.4, 0, 1);
        if (rng() > patch) continue;
        lists[(rng() * V) | 0].push({ x, y, z, s: 0.72 + rng() * 0.75, yaw: rng() * 6.283 });
      }

      lists.forEach((list, v) => {
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(geos[spec.key][v], mat, list.length);
        mesh.name = `alpine:${spec.key}:${v}`;
        list.forEach((it, i) => {
          dummy.position.set(it.x, it.y - 0.04, it.z);
          dummy.rotation.set(0, it.yaw, 0);
          dummy.scale.setScalar(it.s);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.root.add(mesh);
        this.counts.total += list.length;
      });
      this.counts[spec.key] = lists.reduce((a, l) => a + l.length, 0);
    }
    this.geometries = Object.values(geos).flat();
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
