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
  const clumpWarp = 0.86 + 0.26 * rng();
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const base = out.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    /* Lumpy rather than spherical: a tree crown is a pile of smaller masses
     * and a clean ellipsoid reads as a lollipop at any distance.
     *
     * The warp is now PER CLUMP with only a slight per-vertex jitter on top.
     * It used to be a fresh 0.78-1.08 random at every vertex, which was
     * tolerable on a 42-vertex subdivision-1 lobe and turns a 12-vertex
     * subdivision-0 one into a spiked star — each vertex is a sixth of the
     * silhouette, so randomising them individually IS the silhouette. The
     * shape variation has to live at the scale of the clump; anything below
     * that is noise on a surface too coarse to carry it. */
    const warp = clumpWarp * (0.96 + 0.08 * rng());
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

/* A tree crown, as a cloud of small clumps.
 *
 * The first version built each crown from four to seven LARGE icosahedron
 * lobes at subdivision 1. That is 80 facets per lobe spread over a mass two to
 * three metres across, so each facet was most of a metre wide and every tree
 * read as a stack of faceted polyhedra — reported, accurately, as the trees
 * being crude.
 *
 * The fix costs nothing, because FACET SIZE SCALES WITH LOBE SIZE. Twenty-four
 * clumps at subdivision 0 is 480 triangles, exactly what six lobes at
 * subdivision 1 cost, and every facet is now a fifth the size. The silhouette
 * stops being a polygon and starts being foliage, for the same budget.
 *
 * Two other things a tree needs and these did not have:
 *
 *   BRANCHES. A crown floating above a bare pole is the single clearest tell
 *   of a game tree. Real limbs leave the trunk low and carry the foliage
 *   outward, and even three of them change the read completely because they
 *   connect the two masses the eye is trying to reconcile.
 *
 *   AN IRREGULAR OUTLINE. Clumps are placed on a profile with jitter in all
 *   three axes and random per-clump scale, so no two trees share a silhouette
 *   and none of them is symmetrical. A tree that is symmetrical about its
 *   trunk is a lamp.
 */
function crownClumps(out, kind, h, rng, top, bot, detail, count, profile) {
  for (let i = 0; i < count; i++) {
    const u = i / Math.max(1, count - 1);
    /* Golden-angle spiral: fills a volume evenly without the banding a
     * uniformly random scatter shows at these counts. */
    const a = i * 2.399 + rng() * 0.8;
    const p = profile(u, rng);
    const rad = p.r * (0.55 + rng() * 0.75);
    const y = p.y * h * (0.97 + rng() * 0.06);
    const dist = p.spread * Math.sqrt(rng());
    const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
    lobe(out, cx, y, cz,
         rad, rad * p.squash * (0.8 + rng() * 0.45), rad,
         rng, top, bot, detail);
  }
}

function branch(out, x0, y0, z0, x1, y1, z1, r0, r1, bark) {
  const SIDES = 4;
  const base = out.pos.length / 3;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz) || 1;
  /* An arbitrary frame perpendicular to the limb. */
  const ux = dx / len, uy = dy / len, uz = dz / len;
  let px = -uz, py = 0, pz = ux;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
  for (let ring = 0; ring < 2; ring++) {
    const t = ring, r = r0 + (r1 - r0) * t;
    for (let s = 0; s < SIDES; s++) {
      const ang = (s / SIDES) * Math.PI * 2;
      const cs = Math.cos(ang) * r, sn = Math.sin(ang) * r;
      out.pos.push(x0 + dx * t + px * cs + qx * sn,
                   y0 + dy * t + py * cs + qy * sn,
                   z0 + dz * t + pz * cs + qz * sn);
      const shade = 0.72 + 0.4 * (Math.sin(ang) * 0.5 + 0.5);
      out.col.push(bark[0] * shade, bark[1] * shade, bark[2] * shade);
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
  /* Clump subdivision follows the tier. Small clumps hide facets far better
   * than large ones, but at arm's length a 20-face blob still reads as a
   * polyhedron, and these stand right beside the road. Subdivision 1 is 80
   * faces on a one-metre clump — about 12 cm per facet — which is under the
   * size the eye picks out at the distance they are passed. Low tier keeps
   * the coarse clump and drops the count instead, because a coarse clump
   * still reads as foliage while half as many leaves a hole in the tree. */
  const dt = detail === 0 ? 0 : 1;
  const N = detail === 0 ? 0.55 : 1;

  if (kind === 'poplar') {
    /* Lombardy poplar: a green exclamation mark. Almost no width, all height,
     * and the reason a row of them is visible from the next valley. */
    const h = 11 + rng() * 7;
    const bark = [0.115, 0.100, 0.072];
    taperedTrunk(out, h * 0.94, 0.26, 0.10, lean, rng, bark);
    const top = [0.230, 0.330, 0.115], bot = [0.070, 0.115, 0.048];
    /* Short branches, steeply upswept — a Lombardy's limbs run almost
     * parallel to its trunk, which is why the whole tree is a column. */
    for (let i = 0; i < 5; i++) {
      const a = i * 2.399, y = h * (0.22 + i * 0.13);
      branch(out, 0, y, 0, Math.cos(a) * 0.75, y + 1.9, Math.sin(a) * 0.75,
             0.075, 0.03, bark);
    }
    crownClumps(out, kind, h, rng, top, bot, dt, Math.round(84 * N), (u) => ({
      y: 0.18 + 0.78 * u,
      /* CLUMPS MUST OVERLAP OR THEY ARE BEADS.
       *
       * The first tuning used 0.52 m clumps spaced up 14 m of trunk, which is
       * a vertical gap of half a metre between centres and a radius smaller
       * than that — so they never touched and the tree read as a string of
       * faceted balls threaded on a pole, which is worse than the four big
       * lobes it replaced. A clump has to be comfortably larger than the
       * spacing of its neighbours before a cloud of them becomes a mass. */
      /* SMALLER CLUMPS AGAIN, AND THE ARITHMETIC SAYS WHY. The pass above
       * fixed beads-on-a-pole by making clumps comfortably larger than their
       * spacing, and it was right, but it left them at 1.15 m radius on a
       * crown whose half-width is about 1.9 m. That is TWO BALLS ACROSS THE
       * TREE. No amount of overlap saves a canopy built from two spheres —
       * inspected at 26 m the row read as stacks of faceted green boulders,
       * which is the same complaint the jungle trees drew before they were
       * rebuilt from small clumps.
       *
       * 0.62 m at 84 clumps keeps the overlap rule intact — spacing up the
       * trunk is 0.13 m, still far under the radius — while putting six
       * masses across the crown instead of two, which is the number at which
       * a silhouette stops being a stack of circles. */
      r: 0.62 * (1 - Math.abs(u - 0.34) * 0.85),
      squash: 1.30,
      spread: 0.86 * (1 - Math.abs(u - 0.38) * 0.9),
    }));
  } else if (kind === 'pine') {
    /* Radiata: a dark, heavy, slightly ragged dome on a bare lower trunk,
     * which is what a shelterbelt pine looks like once it has been up thirty
     * years and lost its skirt. */
    const h = 9 + rng() * 6;
    const bark = [0.085, 0.070, 0.052];
    taperedTrunk(out, h * 0.62, 0.34, 0.20, lean, rng, bark);
    const top = [0.105, 0.160, 0.078], bot = [0.030, 0.052, 0.030];
    for (let i = 0; i < 6; i++) {
      const a = i * 2.399 + rng() * 0.4;
      const y = h * (0.44 + (i % 3) * 0.14);
      const reach = 1.5 + rng() * 1.1;
      branch(out, 0, y, 0, Math.cos(a) * reach, y + 0.7 + rng() * 0.7,
             Math.sin(a) * reach, 0.11, 0.035, bark);
    }
    /* SAME FAULT THE POPLARS HAD, AND THE SAME ARITHMETIC. 28 clumps at 1.42 m
     * radius on a crown 3.7 m in half-width is TWO AND A HALF BALLS ACROSS THE
     * TREE, and no amount of overlap rescues a canopy built from three
     * spheres. Frame-share work already proved this on the poplars: smaller
     * clumps at detail 0 cost fewer triangles than fewer large smooth ones and
     * put six masses across instead of two. */
    /* Detail 1, not 0, unlike the poplars. A poplar is a narrow column usually
     * seen at fifty metres; a shelterbelt pine is four metres across and stands
     * beside the road, so the same coarse ball that reads as foliage at
     * distance reads as a stack of crystals at eight. The clump COUNT is the
     * fix, not the facet count — and frame time is insensitive to both. */
    crownClumps(out, kind, h, rng, top, bot, dt, Math.round(96 * N), (u) => ({
      y: 0.46 + 0.52 * u,
      r: 0.66 * (1 - u * 0.38),
      squash: 0.80,
      /* Ragged: a mature radiata's outline is not a dome, it is a dome with
       * pieces missing where limbs have been lost to wind. */
      spread: 2.3 * (1 - u * 0.55),
    }));
  } else {
    /* Willow: wide, low, and drooping, sitting in the wet. */
    const h = 6.5 + rng() * 3.5;
    const bark = [0.105, 0.092, 0.066];
    taperedTrunk(out, h * 0.42, 0.38, 0.24, lean, rng, bark);
    const top = [0.245, 0.300, 0.118], bot = [0.078, 0.108, 0.052];
    for (let i = 0; i < 5; i++) {
      const a = i * 2.399 + rng() * 0.6;
      const reach = 1.9 + rng() * 1.3;
      branch(out, 0, h * 0.40, 0, Math.cos(a) * reach, h * (0.62 + rng() * 0.2),
             Math.sin(a) * reach, 0.13, 0.04, bark);
    }
    crownClumps(out, kind, h, rng, top, bot, dt, Math.round(104 * N), (u) => ({
      y: 0.52 + 0.34 * u,
      r: 0.62 * (1 - u * 0.22),
      /* Flattened and hanging — the top of a willow is broad and its edges
       * fall away below the widest point. */
      squash: 0.62,
      spread: 2.6 * (1 - u * 0.30),
    }));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  /* Compliance, baked per species into the geometry rather than carried on a
   * uniform, because all three species share one material and one draw path.
   * A Lombardy poplar is a flagpole with leaves — it barely bends but its
   * whole crown shivers; a radiata pine is stiff and heavy; a willow is the
   * loosest thing in the basin. Getting these three wrong relative to each
   * other is more noticeable than getting the absolute amount wrong.
   *
   * Re-added deliberately: rewriting this function once dropped the attribute
   * and the shelterbelts silently stopped moving. */
  const SWAY = { poplar: 1.00, pine: 0.42, willow: 1.55 }[kind] ?? 0.8;
  const sway = new Float32Array(out.pos.length / 3);
  sway.fill(SWAY);
  g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
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

    /* Wind.
     *
     * The grass and the jungle canopy have swayed since they were written;
     * these trees did not, and they are the tallest things in the basin. A
     * static poplar row beside a moving sward is worse than both being still,
     * because the eye reads the contradiction directly — the shelterbelt looks
     * painted onto a live landscape.
     *
     * Displacement is proportional to height above the ground ^1.7, which is
     * the standard cantilever approximation and the reason a tree's crown
     * moves several times as far as its mid-trunk while its base stays put. A
     * linear falloff makes the whole tree slide sideways, which reads as the
     * ground moving. */
    this.uniforms = {
      uShelterTime: { value: 0 },
      uShelterWind: { value: new THREE.Vector2(0.62, 0.78) },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader =
        'uniform float uShelterTime;\nuniform vec2 uShelterWind;\nattribute float aSway;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          '{',
          '  /* Per-tree phase from its own world position, so a shelterbelt',
          '     does not beat in unison — a row of poplars all reaching the',
          '     same way at the same instant is the single most artificial',
          '     thing wind can do. */',
          '  vec3 inst = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
          '  float ph = inst.x * 0.21 + inst.z * 0.17;',
          '  /* A slow gust travelling across the valley, modulating a faster',
          '     flutter. Wind arrives in waves; a single sine reads as a',
          '     metronome and is the tell of every cheap vegetation shader. */',
          '  float gust = 0.55 + 0.45 * sin(uShelterTime * 0.23 - inst.x * 0.010 - inst.z * 0.008);',
          '  float s = sin(uShelterTime * 1.15 + ph) * 0.62',
          '          + sin(uShelterTime * 2.31 + ph * 1.7) * 0.27',
          '          + sin(uShelterTime * 4.10 + ph * 2.9) * 0.11;',
          '  float h = max(transformed.y, 0.0);',
          '  float amp = aSway * gust * pow(h * 0.085, 1.7) * 0.42;',
          '  transformed.x += uShelterWind.x * s * amp;',
          '  transformed.z += uShelterWind.y * s * amp;',
          '}',
        ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'lake-shelter-wind-v1';

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

  update(dt) { this.uniforms.uShelterTime.value += dt; }
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
