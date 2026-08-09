/* Trees, in the arrangements this country actually puts them in.
 *
 * A Mackenzie basin is not forested and this level should not be. What it has
 * instead is *planted* trees, and they are one of the strongest signals in the
 * landscape precisely because they are so obviously deliberate: a line of
 * Lombardy poplars along a boundary fence, a dark block of radiata pine
 * shelterbelt square to the wind, willows following a creek down to the lake.
 * Nothing else in the basin has a straight edge or a hard vertical, so a single
 * belt does more for the eye than a hundred more shrubs would.
 *
 * Three species, three placement rules, and the rules are the point:
 *
 *   Poplars stand in a LINE at even spacing, because someone planted them one
 *   fence post apart. Evenness is the signal — scatter them and they stop
 *   reading as planted.
 *   Pines stand in a BLOCK with a hard upwind edge, because a shelterbelt is
 *   a wall built against a prevailing nor'wester.
 *   Willows follow WATER, in a ragged string, because nobody planted those.
 *
 * Everything is built in code: a tapered trunk, a few boughs, and foliage as
 * overlapping lobes whose vertex colour carries the light from crown to
 * underside. At the distance these are read from — a line of them at 500 m is
 * a serrated edge on a hillside — silhouette and tone are the whole job.
 */
import * as THREE from 'three';
import { BOUNDS, VALLEY, shoreX, LAKE_Y, ROAD_SHOULDER, FANS } from './basin.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A lobe of foliage: a deformed icosphere, cheap and round, with its colour
 * driven by height within the crown so the underside is in its own shade. */
function lobe(out, cx, cy, cz, rx, ry, rz, rng, top, bottom, detail) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const base = out.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    /* Lumpy rather than spherical: a tree crown is a pile of smaller masses
     * and a clean ellipsoid reads as a lollipop at any distance. */
    const warp = 0.78 + 0.30 * rng();
    out.pos.push(cx + x * rx * warp, cy + y * ry * warp, cz + z * rz * warp);
    const u = Math.min(1, Math.max(0, y * 0.5 + 0.5));
    for (let c = 0; c < 3; c++) out.col.push(bottom[c] + (top[c] - bottom[c]) * (0.25 + 0.75 * u));
  }
  /* PolyhedronGeometry — and therefore IcosahedronGeometry — is NOT indexed:
   * getIndex() returns null and every triangle is three consecutive vertices.
   * Assuming an index buffer here threw on the first tree built. */
  const src = geo.getIndex();
  if (src) for (let i = 0; i < src.count; i++) out.idx.push(base + src.getX(i));
  else for (let i = 0; i < n; i++) out.idx.push(base + i);
  geo.dispose();
}

function taperedTrunk(out, h, r0, r1, lean, rng, bark) {
  const SIDES = 5;
  const base = out.pos.length / 3;
  const lx = Math.cos(lean.a) * lean.d, lz = Math.sin(lean.a) * lean.d;
  for (let ring = 0; ring < 2; ring++) {
    const t = ring, y = h * t, r = r0 + (r1 - r0) * t;
    for (let s = 0; s < SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      out.pos.push(Math.cos(a) * r + lx * t, y, Math.sin(a) * r + lz * t);
      for (let c = 0; c < 3; c++) out.col.push(bark[c] * (0.72 + 0.36 * t));
    }
  }
  for (let s = 0; s < SIDES; s++) {
    const n = (s + 1) % SIDES;
    out.idx.push(base + s, base + SIDES + s, base + n);
    out.idx.push(base + n, base + SIDES + s, base + SIDES + n);
  }
}

function treeGeometry(kind, variant, rng, detail = 1) {
  const out = { pos: [], col: [], idx: [] };
  const lean = { a: rng() * 6.283, d: 0.10 + rng() * 0.22 };

  if (kind === 'poplar') {
    /* Lombardy poplar: a green exclamation mark. Almost no width, all height,
     * and the reason a row of them is visible from the next valley. */
    const h = 11 + rng() * 7;
    taperedTrunk(out, h * 0.94, 0.26, 0.10, lean, rng, [0.115, 0.100, 0.072]);
    const top = [0.230, 0.330, 0.115], bot = [0.070, 0.115, 0.048];
    const lobes = 5 + (variant % 2);
    for (let i = 0; i < lobes; i++) {
      const u = i / (lobes - 1);
      const y = h * (0.20 + 0.76 * u);
      const r = (1.55 - 0.85 * Math.abs(u - 0.42) * 2) * (0.85 + rng() * 0.3);
      lobe(out, lean.d * (y / h) * Math.cos(lean.a), y, lean.d * (y / h) * Math.sin(lean.a),
           Math.max(0.5, r), Math.max(0.9, r * 1.9), Math.max(0.5, r), rng, top, bot, detail);
    }
  } else if (kind === 'pine') {
    /* Radiata: a dark, heavy, slightly ragged dome on a bare lower trunk,
     * which is what a shelterbelt pine looks like once it has been up thirty
     * years and lost its skirt. */
    const h = 9 + rng() * 6;
    taperedTrunk(out, h * 0.55, 0.34, 0.20, lean, rng, [0.085, 0.070, 0.052]);
    const top = [0.105, 0.160, 0.078], bot = [0.030, 0.052, 0.030];
    const lobes = 4 + (variant % 3);
    for (let i = 0; i < lobes; i++) {
      const u = i / lobes;
      const y = h * (0.42 + 0.58 * u);
      const spread = (1 - u * 0.55) * (2.4 + rng() * 1.1);
      const a = rng() * 6.283, off = rng() * spread * 0.45;
      lobe(out, Math.cos(a) * off, y, Math.sin(a) * off,
           spread, spread * 0.72, spread, rng, top, bot, detail);
    }
  } else {
    /* Willow: wide, low, and drooping, sitting in the wet. */
    const h = 6.5 + rng() * 3.5;
    taperedTrunk(out, h * 0.42, 0.38, 0.24, lean, rng, [0.105, 0.092, 0.066]);
    const top = [0.245, 0.300, 0.118], bot = [0.078, 0.108, 0.052];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.257 + rng() * 0.5, r = 1.5 + rng() * 1.5;
      lobe(out, Math.cos(a) * r, h * (0.52 + rng() * 0.30), Math.sin(a) * r,
           2.5 + rng(), 1.5 + rng() * 0.7, 2.5 + rng(), rng, top, bot, detail);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.setIndex(out.idx);
  g.computeVertexNormals();
  return g;
}

export class LakeShelter {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-shelter';
    this.materials = [];
    this.meshes = [];
    this.counts = { poplar: 0, pine: 0, willow: 0 };

    const detail = tier === 'low' ? 0 : 1;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.93, metalness: 0,
    });
    this.materials.push(mat);
    this.mat = mat;

    const rng = random(0x7a1e3);
    const dummy = new THREE.Object3D();
    const variants = {
      poplar: [0, 1].map((v) => treeGeometry('poplar', v, random(0x11a0 + v), detail)),
      pine: [0, 1, 2].map((v) => treeGeometry('pine', v, random(0x22b0 + v), detail)),
      willow: [0, 1].map((v) => treeGeometry('willow', v, random(0x33c0 + v), detail)),
    };
    this.geometries = Object.values(variants).flat();

    const lists = { poplar: [], pine: [], willow: [] };
    const trail = terrain.trail;
    const ok = (x, z, minRoad = ROAD_SHOULDER + 7) => {
      if (x < BOUNDS.x0 + 12 || x > BOUNDS.x1 - 12) return null;
      if (z > BOUNDS.z0 - 12 || z < BOUNDS.z1 + 12) return null;
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 1.2) return null;
      if (trail.nearest(x, z, {}).dist < minRoad) return null;
      return y;
    };

    /* ── poplar rows, along boundaries ─────────────────────────────────── */
    const rows = Math.round(VALLEY / 240);
    for (let r = 0; r < rows; r++) {
      const z0 = BOUNDS.z0 - ((r + 0.5) / rows) * VALLEY + (rng() - 0.5) * 90;
      /* A boundary runs inland from the shore, square to it, because that is
       * how a run is fenced off. */
      const x0 = shoreX(z0) + 26 + rng() * 44;
      const dirA = 1.35 + (rng() - 0.5) * 0.7;
      const n = 9 + ((rng() * 14) | 0);
      const spacing = 6.5 + rng() * 2.5;
      for (let i = 0; i < n; i++) {
        const x = x0 + Math.cos(dirA) * spacing * i;
        const z = z0 + Math.sin(dirA) * spacing * i;
        const y = ok(x, z);
        if (y === null) continue;
        lists.poplar.push({ x, y, z, s: 0.85 + rng() * 0.40, yaw: rng() * 6.283 });
      }
    }

    /* ── pine shelterbelts, as blocks ──────────────────────────────────── */
    const belts = Math.round(VALLEY / 430);
    for (let b = 0; b < belts; b++) {
      const z0 = BOUNDS.z0 - ((b + 0.35) / belts) * VALLEY + (rng() - 0.5) * 120;
      const x0 = shoreX(z0) + 55 + rng() * 70;
      const along = 1.5 + (rng() - 0.5) * 0.5;
      const deep = 2 + ((rng() * 2) | 0);
      const long = 7 + ((rng() * 9) | 0);
      for (let i = 0; i < long; i++) {
        for (let d = 0; d < deep; d++) {
          const x = x0 + Math.cos(along) * 5.4 * i - Math.sin(along) * 5.0 * d;
          const z = z0 + Math.sin(along) * 5.4 * i + Math.cos(along) * 5.0 * d;
          const y = ok(x, z);
          if (y === null) continue;
          lists.pine.push({ x, y, z, s: 0.82 + rng() * 0.42, yaw: rng() * 6.283 });
        }
      }
    }

    /* ── willows, on the fan mouths where the streams come out ─────────── */
    for (const [fu] of FANS) {
      const fz = BOUNDS.z0 - fu * VALLEY;
      const n = 5 + ((rng() * 7) | 0);
      for (let i = 0; i < n; i++) {
        const z = fz + (rng() - 0.5) * 90;
        const x = shoreX(z) + 8 + rng() * 30;
        const y = ok(x, z, ROAD_SHOULDER + 4);
        if (y === null) continue;
        lists.willow.push({ x, y, z, s: 0.85 + rng() * 0.45, yaw: rng() * 6.283 });
      }
    }

    for (const [kind, list] of Object.entries(lists)) {
      if (!list.length) continue;
      this.counts[kind] = list.length;
      const per = Math.ceil(list.length / variants[kind].length);
      variants[kind].forEach((geo, v) => {
        const slice = list.slice(v * per, (v + 1) * per);
        if (!slice.length) return;
        const mesh = new THREE.InstancedMesh(geo, mat, slice.length);
        mesh.name = `shelter:${kind}:${v}`;
        slice.forEach((q, i) => {
          dummy.position.set(q.x, q.y - 0.25, q.z);
          dummy.rotation.set(0, q.yaw, 0);
          dummy.scale.set(q.s, q.s * (0.9 + (i % 5) * 0.05), q.s);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        /* Trees are the tallest things in the basin and the only ones that
         * throw a shadow with a recognisable shape, so these do cast. */
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.root.add(mesh);
        this.meshes.push(mesh);
      });
    }
  }

  update() {}
  setTier() {}
  cullAround(x, z) {
    this.meshes.forEach((m) => {
      const s = m.boundingSphere;
      m.visible = !s || Math.hypot(s.center.x - x, s.center.z - z) < 900 + s.radius;
    });
  }
  stats() { return { ...this.counts, meshes: this.meshes.length }; }
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
