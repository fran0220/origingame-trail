/* What is actually lying on a volcano.
 *
 * The level was terrain, four pools, eighty poles and some steam, and the
 * frame-share audit said so: skyline 11.2%, lakes 0.11%, poles 0.06%, nothing
 * else. Standing anywhere on it you are looking at an unbroken surface, and
 * that is the one thing a volcano never is.
 *
 * An andesite cone sheds constantly. Everything that comes out of the vent
 * lands somewhere and stays there, because nothing grows over it and no water
 * carries it away, so the ground is COVERED in loose rock at every size from
 * gravel to house. Four kinds are worth building separately because they are
 * made by different events and therefore sit in different places:
 *
 *   BLOCKS — angular lumps of old lava broken off a flow. They lie where the
 *   flow was, which is the steep ground and the ridges.
 *
 *   BOMBS — blobs of molten rock thrown out and frozen in the air, so they are
 *   rounded, sometimes spindle-shaped, and they lie where they landed:
 *   scattered thinly over EVERYTHING including the flat crater floor, which is
 *   the only thing that puts objects on that ash pan at all.
 *
 *   RUBBLE — the fine stuff, in drifts and lee slopes, where the wind has
 *   swept it into a bank.
 *
 *   ERRATIC — the occasional very large block, alone. One of these does more
 *   for a sense of scale than fifty small ones, because it is the only thing
 *   on the mountain a person can be measured against.
 */
import * as THREE from 'three';
import { Noise2D, clamp, smoothstep, lerp } from '../../world/noise.js';
import { STAGES, DATUM, VERT, trackElevation } from './route.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* One irregular lump, as a deformed icosahedron. Blocks get sharp planar
 * faces, bombs get a smooth skin, and the difference is a single exponent —
 * which is the whole reason both live in one function. */
function lump(rng, r, angular) {
  const g = new THREE.IcosahedronGeometry(1, angular ? 0 : 1);
  const pos = g.getAttribute('position');
  const n = pos.count;
  /* Three axes of squash, so nothing is a ball. A bomb is a spindle and a
   * block is a slab; both are far from spherical and a field of spheres is
   * the single most obvious way to get a rockfield wrong. */
  const sx = r * (0.72 + rng() * 0.75);
  const sy = r * (0.50 + rng() * 0.62) * (angular ? 0.72 : 1);
  const sz = r * (0.72 + rng() * 0.75);
  for (let i = 0; i < n; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    /* Angular: push each vertex toward the nearest face plane so the facets
     * stay flat and the edges stay sharp. Rounded: soften instead. */
    const k = angular ? 1.0 + (rng() - 0.5) * 0.34 : 0.86 + rng() * 0.28;
    pos.setXYZ(i, x * sx * k, y * sy * k, z * sz * k);
  }
  g.computeVertexNormals();
  return g;
}

export class Rockfield {
  constructor(terrain, trail, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'tongariro-rock';
    this.materials = [];

    const rng = random(0x4b17a3);
    const dense = tier === 'low' ? 0.35 : tier === 'medium' ? 0.65 : 1;

    /* Four geometry variants per kind so a field is not one lump repeated. */
    const VARIANTS = 5;
    const geos = {
      block:   Array.from({ length: VARIANTS }, () => lump(rng, 1, true)),
      bomb:    Array.from({ length: VARIANTS }, () => lump(rng, 1, false)),
      rubble:  Array.from({ length: VARIANTS }, () => lump(rng, 1, true)),
      erratic: Array.from({ length: VARIANTS }, () => lump(rng, 1, true)),
    };

    const mat = new THREE.MeshStandardMaterial({
      /* vertexColors is FALSE and that is the fix. It was true, and these
       * geometries are bare icosahedra with no colour attribute at all — so
       * the shader read zero for every vertex and multiplied the whole field
       * to black, which is why 30,000 rocks rendered as holes cut in the
       * mountain and why lightening the palette changed nothing at all. The
       * colour arrives per INSTANCE, which three applies on top of the
       * material's own and which needs no attribute on the geometry. */
      name: 'volcanic-rock', vertexColors: false,
      roughness: 0.93, metalness: 0.0, envMapIntensity: 0.30,
    });
    this.materials.push(mat);

    /* Colour follows the ground it is lying on, because it came from there:
     * black lava low down, oxidised red on the ridge, pale ash-dusted on the
     * crater floor. A uniform grey rockfield on a red mountain is the giveaway
     * that the rocks were scattered by a different program from the terrain. */
/* MUCH PALER THAN "VOLCANIC ROCK IS BLACK" SUGGESTS, and this is the same
     * correction the lake's chipseal needed. At 0.072 linear the blocks came
     * out as holes cut in the mountain — pure black shapes on pale ash, which
     * is what an albedo below the darkest thing the eye expects always does.
     *
     * Weathered andesite in alpine daylight is a mid grey-brown around 0.16 to
     * 0.24, because what you see is a dusty oxidised surface and not fresh
     * glass. The fresh stuff is under it and stays there. */
    const BLACK = new THREE.Color(0.168, 0.148, 0.136);
    const RED   = new THREE.Color(0.430, 0.155, 0.072);
    const PALE  = new THREE.Color(0.292, 0.262, 0.232);
    const tmp = new THREE.Color();

    const KINDS = [
      /* kind, count per km2 at high tier, size range, slope preference */
      { kind: 'block',   n: 5200, r: [0.28, 1.35], wantSlope: [0.16, 0.70] },
      { kind: 'bomb',    n: 2600, r: [0.16, 0.62], wantSlope: [0.00, 0.55] },
      { kind: 'rubble',  n: 7000, r: [0.09, 0.30], wantSlope: [0.05, 0.42] },
      { kind: 'erratic', n: 34,   r: [1.9,  4.2],  wantSlope: [0.00, 0.30] },
      /* Valley floor slabs. Without these the Mangatepopo tussock reads
       * as a lawn: nothing at the scale of a person sits in the grass. */
      { kind: 'block',   n: 280, r: [1.1, 3.4],  wantSlope: [0.00, 0.28], valley: true },
    ];

    const B = terrain.bounds;
    const areaKm2 = ((B.x1 - B.x0) * (B.z0 - B.z1)) / 1e6;
    const q = {};
    const dummy = new THREE.Object3D();
    this.counts = { total: 0 };

    for (const spec of KINDS) {
      const lists = Array.from({ length: VARIANTS }, () => []);
      const want = Math.round(spec.n * areaKm2 * dense);
      let tries = 0;
      while (lists.reduce((a, l) => a + l.length, 0) < want && tries < want * 8) {
        tries++;
        const x = B.x0 + rng() * (B.x1 - B.x0);
        const z = B.z1 + rng() * (B.z0 - B.z1);
        terrain.sampleField(x, z, q);
        const y = terrain.height(x, z);
        /* Nothing below the plateau: that band is the level's own edge and
         * putting rocks on it advertises where the world stops. */
        if (y < 5) continue;
        const slope = terrain.slopeAt(x, z);
        const [s0, s1] = spec.wantSlope;
        if (slope < s0 || slope > s1) continue;
        if (spec.valley && !(q.t < STAGES.staircase[0])) continue;
        /* Keep the tread clear. A boulder in the middle of a poled route is
         * not what the route is for, and the walker cannot climb it. */
        if (q.dist < trail.widthAt(clamp(q.t, 0, 1)) + 1.8) continue;
        /* Clustered, not uniform: rock comes off in falls, so it arrives in
         * patches with bare ground between. A Poisson scatter reads as static
         * on a screen, which is the other half of getting a rockfield wrong. */
        const clump = this._n(x, z);
        if (rng() > clump) continue;

        const r = lerp(spec.r[0], spec.r[1], Math.pow(rng(), 2.1));
        const v = (rng() * VARIANTS) | 0;
        const realY = y / VERT + DATUM;
        tmp.copy(BLACK)
          .lerp(RED, smoothstep(1600, 1820, realY))
          .lerp(PALE, smoothstep(0.30, 0.02, slope) * 0.45);
        const shade = 0.86 + rng() * 0.34;
        lists[v].push({ x, y, z, r, yaw: rng() * 6.283,
                        tilt: (rng() - 0.5) * 0.5,
                        c: [tmp.r * shade, tmp.g * shade, tmp.b * shade] });
      }

      lists.forEach((list, v) => {
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(geos[spec.kind][v], mat, list.length);
        mesh.name = `rock:${spec.kind}:${v}`;
        const colours = new Float32Array(list.length * 3);
        list.forEach((it, i) => {
          dummy.position.set(it.x, it.y + it.r * 0.12, it.z);
          dummy.rotation.set(it.tilt, it.yaw, it.tilt * 0.6);
          dummy.scale.setScalar(it.r);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          colours[i * 3] = it.c[0]; colours[i * 3 + 1] = it.c[1]; colours[i * 3 + 2] = it.c[2];
        });
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = spec.kind !== 'rubble';
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.root.add(mesh);
        this.counts.total += list.length;
      });
      this.counts[spec.kind] = lists.reduce((a, l) => a + l.length, 0);
    }
    this.geometries = Object.values(geos).flat();
  }

  /* Low-frequency field that decides where rock has collected. */
  _n(x, z) {
    this._nz = this._nz || new Noise2D(0x2f81);
    const a = this._nz.n(x * 0.010, z * 0.010) * 0.5 + 0.5;
    const b = this._nz.n(x * 0.045 + 31, z * 0.045) * 0.5 + 0.5;
    return clamp(Math.pow(a * 0.72 + b * 0.28, 1.7) * 1.5, 0, 1);
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
