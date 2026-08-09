/* Rock: what the hills are actually made of, where it breaks through.
 *
 * Every slope in this basin is a smooth continuous surface, and that is the
 * one thing that most gives it away as a heightfield. Real hill country in
 * this part of the country is schist, and schist does three specific things
 * that a noise function never will:
 *
 *   IT OUTCROPS ON THE RIDGES AND THE STEEP FACES, because that is where the
 *   soil cannot stay. Rock appears exactly where the gradient is high and
 *   almost nowhere else, so the placement rule is a slope threshold rather
 *   than a scatter — that correlation is most of why real rock reads as
 *   belonging to the hill rather than as being dropped on it.
 *
 *   IT FALLS DOWNHILL AND PILES UP. Below every outcrop is a fan of its own
 *   debris, coarse at the top and fine at the bottom, at the angle of repose.
 *   An outcrop with no scree below it looks like scenery; the scree is what
 *   makes it look like it has been there a while.
 *
 *   IT IS ANGULAR. Schist splits along its foliation into slabs and blocks
 *   with flat faces and sharp edges. A rounded rock is a river rock, and the
 *   only rounded stone in this level is on the beach where it belongs — the
 *   lake has spent ten thousand years making it that way.
 */
import * as THREE from 'three';
import { BOUNDS, VALLEY, shoreX, LAKE_Y, ROAD_SHOULDER } from './basin.js';
import { clearsPoint, clearsDisc } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* An angular block. Built by taking an icosahedron and pushing every vertex
 * onto a small set of planes, which is what gives schist its flat faces and
 * sharp arrises — a jittered sphere gives a potato, and a potato is a river
 * cobble no matter what colour it is painted. */
function blockGeometry(rng, foliated) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  /* The foliation: one dominant plane the rock prefers to split along, plus
   * two cross joints. Flattening along the dominant one is what makes slabs. */
  const flat = 0.42 + rng() * 0.30;
  const planes = [];
  for (let i = 0; i < 7; i++) {
    const th = rng() * Math.PI * 2, ph = Math.acos(rng() * 2 - 1);
    planes.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th),
                 0.62 + rng() * 0.34]);
  }
  const v = new THREE.Vector3();
  const pos = [], col = [];
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i) * (foliated ? flat : 1.0), p.getZ(i));
    /* Clip against each plane: min over planes of (d / dot) scales the vertex
     * back onto the nearest facet, so the hull is a polyhedron. */
    let k = 1;
    for (const [nx, ny, nz, d] of planes) {
      const dot = v.x * nx + v.y * ny + v.z * nz;
      if (dot > 1e-4) k = Math.min(k, d / dot);
    }
    v.multiplyScalar(k);
    pos.push(v.x, v.y, v.z);
    /* Schist is grey-green with a mica sheen and pale lichen on anything that
     * has faced the weather. Upward faces get the lichen. */
    const up = Math.max(0, v.y);
    const lich = Math.pow(up, 1.4) * (0.35 + rng() * 0.45);
    const base = 0.180 + rng() * 0.055;
    col.push(base * 1.02 + lich * 0.26, base * 1.05 + lich * 0.30, base * 0.98 + lich * 0.18);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(g.getIndex() ? Array.from(g.getIndex().array)
                            : Array.from({ length: p.count }, (_, i) => i));
  out.computeVertexNormals();
  g.dispose();
  return out;
}

/* A beach cobble: the same builder with the planes turned off and the whole
 * thing squashed, because a lake stone is a flattened ellipsoid — waves sort
 * shingle so the flat faces end up lying down. */
function cobbleGeometry(rng) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  const pos = [], col = [];
  const sx = 1.0, sy = 0.38 + rng() * 0.22, sz = 0.72 + rng() * 0.42;
  for (let i = 0; i < p.count; i++) {
    const w = 0.90 + rng() * 0.16;
    pos.push(p.getX(i) * sx * w, p.getY(i) * sy * w, p.getZ(i) * sz * w);
    /* Greywacke shingle runs from near-white through grey to blue-black, and
     * the variety within a beach is far wider than within one outcrop. */
    const t = rng();
    const v = 0.130 + Math.pow(t, 0.7) * 0.310;
    col.push(v * (0.96 + rng() * 0.10), v * (0.97 + rng() * 0.08), v * (1.00 + rng() * 0.08));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(g.getIndex() ? Array.from(g.getIndex().array)
                            : Array.from({ length: p.count }, (_, i) => i));
  out.computeVertexNormals();
  g.dispose();
  return out;
}

/* Driftwood: a bleached, barkless limb. Six-sided, tapered, with a kink,
 * because a straight stick reads as dropped dowel. */
function driftGeometry(rng) {
  const pos = [], col = [], idx = [];
  const SEG = 5, SIDES = 6;
  const len = 1.6 + rng() * 2.6;
  const bend = (rng() - 0.5) * 0.55;
  const pale = [0.395 + rng() * 0.10, 0.372 + rng() * 0.09, 0.330 + rng() * 0.08];
  let yaw = 0;
  const path = [];
  let cx = 0, cz = 0;
  for (let s = 0; s <= SEG; s++) {
    path.push([cx, cz]);
    yaw += bend / SEG;
    cx += Math.cos(yaw) * (len / SEG); cz += Math.sin(yaw) * (len / SEG);
  }
  for (let s = 0; s <= SEG; s++) {
    const t = s / SEG;
    const r = (0.075 + rng() * 0.045) * (1 - t * 0.62);
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      const n = pos.length / 3;
      pos.push(path[s][0] + Math.cos(a) * r, Math.sin(a) * r, path[s][1] + Math.cos(a) * r * 0.2);
      const shade = 0.74 + 0.36 * (Math.sin(a) * 0.5 + 0.5);
      col.push(pale[0] * shade, pale[1] * shade, pale[2] * shade);
      if (n !== undefined) { /* nothing */ }
    }
  }
  for (let s = 0; s < SEG; s++) {
    for (let k = 0; k < SIDES; k++) {
      const a = s * SIDES + k, b = s * SIDES + (k + 1) % SIDES;
      idx.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class LakeRock {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-rock';
    this.materials = [];
    this.meshes = [];
    this.geometries = [];

    const rng = random(0x0c3a17);
    const trail = terrain.trail;
    const dummy = new THREE.Object3D();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.93, metalness: 0.0,
    });
    this.materials.push(mat);

    /* Gradient, which every placement rule here is a function of. */
    const slopeAt = (x, z) => {
      const e = 1.5;
      const dx = (terrain.height(x + e, z) - terrain.height(x - e, z)) / (2 * e);
      const dz = (terrain.height(x, z + e) - terrain.height(x, z - e)) / (2 * e);
      return { g: Math.hypot(dx, dz), dx, dz };
    };

    const DENS = tier === 'low' ? 0.35 : tier === 'medium' ? 0.65 : 1.0;

    /* ── outcrops, and the scree below each one ─────────────────────────── */
    const outVariants = [0, 1, 2].map((i) => blockGeometry(random(0x77a1 + i), true));
    const screeVariants = [0, 1].map((i) => blockGeometry(random(0x31c5 + i), false));
    this.geometries.push(...outVariants, ...screeVariants);
    const outLists = outVariants.map(() => []);
    const screeLists = screeVariants.map(() => []);

    const TRIES = Math.round(16000 * DENS);
    let outcrops = 0;
    for (let i = 0; i < TRIES; i++) {
      const z = BOUNDS.z0 - rng() * VALLEY;
      const x = BOUNDS.x0 + 8 + rng() * (BOUNDS.x1 - BOUNDS.x0 - 16);
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 2.0) continue;
      if (!clearsDisc(trail, x, z, 3.0, ROAD_SHOULDER + 4)) continue;
      const s = slopeAt(x, z);
      /* THE RULE: rock only where soil cannot hold. The threshold is not a
       * guess about real hillsides, it is read off THIS terrain's own slope
       * histogram — sampling 20,000 points in the valley gives:
       *
       *     gradient > 0.5   2.1% of the ground
       *     gradient > 0.3   3.7%
       *     gradient > 0.2  12.3%
       *
       * The first version used 0.5 because that is roughly where real turf
       * gives up, and got 37 outcrops in two kilometres — invisible. This
       * heightfield is far gentler than the country it is modelled on, so the
       * threshold has to be the one that selects the steepest eighth of it,
       * whatever that is in absolute terms. Placement rules that correlate
       * with the terrain have to be calibrated against the terrain. */
      if (s.g < 0.20) continue;
      const chance = Math.min(1, (s.g - 0.20) * 3.0);
      if (rng() > chance) continue;

      const scale = 0.9 + Math.pow(rng(), 2.1) * 4.2;
      const v = (rng() * outVariants.length) | 0;
      outLists[v].push({
        x, y: y - scale * 0.30, z, s: scale,
        /* Bedded rock lies with its foliation following the hillside, not at
         * a random attitude — it has not been tipped out of a truck. */
        rx: -Math.atan2(s.dz, 1) * 0.7 + (rng() - 0.5) * 0.25,
        rz: Math.atan2(s.dx, 1) * 0.7 + (rng() - 0.5) * 0.25,
        ry: rng() * 6.283,
      });
      outcrops++;

      /* The debris fan. Downhill is -gradient; stones get smaller and sparser
       * as they travel, and they stop where the slope eases. */
      const nStones = 5 + ((rng() * 16) | 0);
      const ux = -s.dx / (s.g || 1), uz = -s.dz / (s.g || 1);
      for (let k = 0; k < nStones; k++) {
        const run = Math.pow(rng(), 0.6) * (7 + scale * 5.5);
        const spread = (rng() - 0.5) * (2.2 + run * 0.42);
        const sx2 = x + ux * run - uz * spread;
        const sz2 = z + uz * run + ux * spread;
        const sy2 = terrain.height(sx2, sz2);
        if (sy2 < LAKE_Y + 0.6) continue;
        /* AND NOT ON THE ROAD. The outcrop is kept out of the corridor, but
         * its debris fan runs DOWNHILL, and downhill from a cut slope is the
         * carriageway. The first render of this put boulders in the middle of
         * the seal — a rule that clears the parent does not clear the
         * children, and every derived scatter needs the exclusion applied to
         * it directly. Real scree that reaches a highway gets picked up. */
        if (!clearsPoint(trail, sx2, sz2, ROAD_SHOULDER + 2.5)) continue;
        const size = (0.16 + rng() * 0.42) * (1 - run / (9 + scale * 7)) * scale * 0.55;
        if (size < 0.05) continue;
        const vv = (rng() * screeVariants.length) | 0;
        screeLists[vv].push({
          x: sx2, y: sy2 - size * 0.35, z: sz2, s: size,
          rx: (rng() - 0.5) * 1.1, ry: rng() * 6.283, rz: (rng() - 0.5) * 1.1,
        });
      }
    }

    /* ── beach shingle and driftwood ────────────────────────────────────── */
    const cobVariants = [0, 1, 2].map((i) => cobbleGeometry(random(0x5b20 + i)));
    this.geometries.push(...cobVariants);
    const cobLists = cobVariants.map(() => []);
    const N_COB = Math.round(26000 * DENS);
    for (let i = 0; i < N_COB; i++) {
      const z = BOUNDS.z0 - rng() * VALLEY;
      const sx = shoreX(z);
      /* A shingle beach is a narrow band that straddles the waterline: a few
       * metres of dry storm berm above and a metre or two of wet stone below.
       * Weighted toward the water, because that is where it is sorted. */
      const off = -1.8 + Math.pow(rng(), 0.7) * 9.5;
      const x = sx - off;
      const y = terrain.height(x, z);
      if (y > LAKE_Y + 2.6 || y < LAKE_Y - 1.2) continue;
      /* The road runs within a few metres of the water in places, and a
       * beach-height test alone will happily put shingle on the seal there. */
      if (!clearsPoint(trail, x, z, ROAD_SHOULDER + 2.5)) continue;
      const size = 0.055 + Math.pow(rng(), 2.6) * 0.34;
      const v = (rng() * cobVariants.length) | 0;
      cobLists[v].push({
        x, y: y - size * 0.22, z, s: size,
        rx: (rng() - 0.5) * 0.30, ry: rng() * 6.283, rz: (rng() - 0.5) * 0.30,
      });
    }

    const driftGeo = driftGeometry(rng);
    this.geometries.push(driftGeo);
    const drift = [];
    const N_DRIFT = Math.round(VALLEY / 26);
    for (let i = 0; i < N_DRIFT; i++) {
      const z = BOUNDS.z0 - rng() * VALLEY;
      const x = shoreX(z) - (0.4 + rng() * 4.5);
      const y = terrain.height(x, z);
      if (y > LAKE_Y + 1.9 || y < LAKE_Y - 0.5) continue;
      if (!clearsDisc(trail, x, z, 2.0, ROAD_SHOULDER + 2.5)) continue;
      drift.push({
        x, y: y + 0.05, z, s: 0.7 + rng() * 0.8,
        /* Driftwood lies parallel to the shore. Waves that put it there were
         * running along the beach, and anything lying across the swash gets
         * turned within a day. */
        ry: (rng() - 0.5) * 0.8, rz: (rng() - 0.5) * 0.22,
      });
    }

    const add = (geo, list, name) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      m.name = name;
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y, q.z);
        dummy.rotation.set(q.rx || 0, q.ry || 0, q.rz || 0);
        dummy.scale.setScalar(q.s);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = true; m.receiveShadow = true;
      m.computeBoundingSphere();
      this.root.add(m); this.meshes.push(m);
    };
    outVariants.forEach((g, i) => add(g, outLists[i], `rock:outcrop:${i}`));
    screeVariants.forEach((g, i) => add(g, screeLists[i], `rock:scree:${i}`));
    cobVariants.forEach((g, i) => add(g, cobLists[i], `rock:shingle:${i}`));
    add(driftGeo, drift, 'rock:driftwood');

    this.counts = {
      outcrops,
      scree: screeLists.reduce((a, l) => a + l.length, 0),
      shingle: cobLists.reduce((a, l) => a + l.length, 0),
      driftwood: drift.length,
      meshes: this.meshes.length,
    };
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
