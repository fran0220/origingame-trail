/* The people watching, and the people running the stage.
 *
 * This is a timed special stage with a start gantry, split timing and a finish
 * — and not one human being anywhere on it. That is a bigger absence than it
 * sounds, because a rally stage is defined by its spectators: it is a public
 * road closed for the afternoon, and the only reason it is closed is that
 * people came to watch. An empty one is a test session.
 *
 * WHERE PEOPLE ACTUALLY STAND, which is not "along the road":
 *
 *   ON THE OUTSIDE OF CORNERS, on high ground, behind something. Nobody sensible
 *   stands on the inside of a bend or on a straight — the inside is where a car
 *   goes when it lets go, and a straight is boring. Placement is therefore
 *   driven by the same curvature measurement that positions the chevrons, and
 *   it puts groups exactly where the corner is worth watching.
 *
 *   IN CLUMPS, facing the road. People arrive together, stand together, and all
 *   look the same way. An even scatter of individuals facing random directions
 *   is the single most artificial thing a crowd can do.
 *
 *   WELL BACK. Twelve to thirty metres, which is both where marshals put them
 *   and what stops a figure being close enough for its lack of a face to
 *   matter.
 *
 * MARSHALS are separate: high-visibility, alone or in pairs, closer in, and at
 * the points that need watching rather than the points worth watching.
 */
import * as THREE from 'three';
import { BOUNDS, LAKE_Y, ROAD_SHOULDER } from './basin.js';
import { clearsPoint } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A person: legs, torso, arms, head. About 90 triangles.
 *
 * Deliberately no face and no hands. At the distance these are seen from —
 * never closer than twelve metres — a head is four pixels, and detail below
 * the silhouette is invisible while the SILHOUETTE is everything. What has to
 * be right is the proportion: head one seventh of the height, shoulders wider
 * than hips, legs half the total. Get those wrong and a figure reads as a
 * garden gnome at any resolution.
 */
function personGeometry(rng, variant) {
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { const n = pos.length / 3; pos.push(x, y, z); col.push(...c); return n; };
  const limb = (x0, y0, z0, x1, y1, z1, r, c, sides = 5) => {
    const base = pos.length / 3;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    /* A PERPENDICULAR THAT SURVIVES A VERTICAL LIMB.
     *
     * The obvious choice, (-uz, 0, ux), is the cross product of the limb with
     * world up — and it is exactly zero when the limb IS world up. A person is
     * mostly vertical limbs: both legs, the torso and the neck. Normalising
     * that zero vector produced NaN positions, so every upright part of every
     * figure vanished and the crowd rendered as a scatter of disconnected
     * arms, which is what the first photograph of it showed.
     *
     * Cross with whichever axis the limb is least aligned to instead. That is
     * the standard fix and it has no degenerate case. */
    const refX = Math.abs(uy) > 0.9 ? 1 : 0;
    const refY = Math.abs(uy) > 0.9 ? 0 : 1;
    let px = uy * (refX ? 0 : 0) - uz * refY;
    let py = uz * refX - ux * 0;
    let pz = ux * refY - uy * refX;
    const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
    for (let ring = 0; ring < 2; ring++) {
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const cs = Math.cos(a) * r, sn = Math.sin(a) * r;
        push(x0 + dx * ring + px * cs + qx * sn,
             y0 + dy * ring + py * cs + qy * sn,
             z0 + dz * ring + pz * cs + qz * sn,
             c.map((v) => v * (0.74 + 0.42 * (Math.sin(a) * 0.5 + 0.5))));
      }
    }
    for (let s = 0; s < sides; s++) {
      const n = (s + 1) % sides;
      idx.push(base + s, base + sides + s, base + n);
      idx.push(base + n, base + sides + s, base + sides + n);
    }
  };

  const H = 1.62 + rng() * 0.20;
  /* Outdoor clothing in a cold basin: dark trousers, a coloured jacket. The
   * jacket is the only chroma and it is what makes a crowd read as a crowd
   * rather than as a row of posts. */
  const JACKETS = [
    [0.300, 0.075, 0.062], [0.075, 0.130, 0.290], [0.320, 0.230, 0.055],
    [0.090, 0.200, 0.115], [0.240, 0.245, 0.250], [0.110, 0.105, 0.120],
  ];
  const jacket = JACKETS[(rng() * JACKETS.length) | 0];
  const trouser = [0.055 + rng() * 0.045, 0.055 + rng() * 0.040, 0.070 + rng() * 0.045];
  const skin = [0.330, 0.235, 0.180];

  const hip = H * 0.50, shoulder = H * 0.83, headY = H * 0.90;
  const stance = 0.055 + rng() * 0.045;
  limb(-stance, 0, 0, -stance * 0.85, hip, 0, 0.052, trouser);
  limb(stance, 0, 0, stance * 0.85, hip, 0, 0.052, trouser);
  /* Torso: shoulders wider than hips, which is most of the read. */
  limb(0, hip, 0, 0, shoulder, 0, 0.115 + rng() * 0.020, jacket, 6);
  for (const s of [-1, 1]) {
    /* Arms hang slightly out and slightly forward — folded or in pockets is
     * what people actually do while waiting in the cold, and either reads as
     * "not standing to attention". */
    limb(s * 0.13, shoulder - 0.02, 0, s * (0.15 + rng() * 0.05),
         hip + 0.06, 0.04 + rng() * 0.06, 0.040, jacket);
  }
  limb(0, headY - 0.02, 0, 0, headY + 0.11, 0, 0.070, skin, 6);
  if (variant % 2 === 0) {
    /* A beanie on half of them. It is one more object but it breaks the row
     * of identical pale dots that a crowd of bare heads becomes. */
    limb(0, headY + 0.05, 0, 0, headY + 0.13, 0, 0.076, jacket, 6);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class LakeStage {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-stage';
    this.materials = [];
    this.geometries = [];

    const rng = random(0x5a17e2);
    const trail = terrain.trail;
    const L = trail.length;
    const P = new THREE.Vector3(), A = new THREE.Vector3(),
          B = new THREE.Vector3(), C = new THREE.Vector3();
    const dummy = new THREE.Object3D();

    const mat = new THREE.MeshStandardMaterial({
      name: 'stage-people', color: 0xffffff, vertexColors: true,
      roughness: 0.92, metalness: 0.0,
      /* Small bright objects at the default 1.0 pick up the sky and sparkle —
       * the sward lesson, applied up front. */
      envMapIntensity: 0.32,
    });
    this.materials.push(mat);

    /* Curvature, measured the same way the chevrons measure it, so the crowd
     * and the corner signs cannot disagree about where the corners are. */
    const cornerAt = (m) => {
      const S = 26;
      if (m - S < 0 || m + S > L) return null;
      trail.pointAt((m - S) / L, A); trail.pointAt(m / L, B); trail.pointAt((m + S) / L, C);
      const ax = B.x - A.x, az = B.z - A.z, bx = C.x - B.x, bz = C.z - B.z;
      const cross = ax * bz - az * bx;
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz),
            lc = Math.hypot(C.x - A.x, C.z - A.z);
      if (la * lb * lc < 1e-6) return null;
      const k = 2 * Math.abs(cross) / (la * lb * lc);
      if (k < 1e-6) return null;
      return { r: 1 / k, turn: Math.sign(cross) };
    };

    const DENS = tier === 'low' ? 0.45 : tier === 'medium' ? 0.75 : 1.0;
    const variants = [0, 1].map((v) => personGeometry(random(0x2b7 + v * 97), v));
    this.geometries.push(...variants);
    const lists = variants.map(() => []);
    let groups = 0, marshals = 0;

    let last = -999;
    for (let m = 40; m < L - 40; m += 10) {
      const q = cornerAt(m);
      /* MEASURED, then widened. At r <= 240 m with 120 m between groups this
       * produced 9 groups and 69 people over two kilometres, visible at 2 of
       * 16 stations — a stage with a handful of onlookers rather than a crowd.
       * This alignment is fast and open, so 240 m selects only the few tight
       * corners; 420 m selects everywhere the road actually bends, which is
       * where people would stand. */
      if (!q || q.r > 420) continue;
      if (m - last < 68) continue;
      last = m;
      trail.pointAt(m / L, P); 
      const T = new THREE.Vector3();
      trail.tangentAt(m / L, T);
      const nx = T.z, nz = -T.x;
      /* OUTSIDE of the bend. Same sign convention as the chevrons. */
      const side = q.turn > 0 ? 1 : -1;

      const n = Math.round((9 + rng() * 22) * DENS);
      const cluster = 3.5 + rng() * 6.5;
      /* Closer than the first cut. Twelve metres is where marshals put people
       * and thirty is where they become specks. */
      const back = 11 + rng() * 12;
      const cx = P.x + nx * side * back, cz = P.z + nz * side * back;
      let placed = 0;
      for (let i = 0; i < n; i++) {
        const x = cx + (rng() - 0.5) * 2 * cluster;
        const z = cz + (rng() - 0.5) * 2 * cluster;
        if (x < BOUNDS.x0 + 8 || x > BOUNDS.x1 - 8) continue;
        const y = terrain.height(x, z);
        if (y < LAKE_Y + 1.0) continue;
        if (!clearsPoint(trail, x, z, ROAD_SHOULDER + 5)) continue;
        /* Facing the road, give or take — people fidget and talk to each
         * other, they do not stand in rank. */
        const toRoad = Math.atan2(P.x - x, P.z - z);
        lists[(rng() * 2) | 0].push({
          x, y, z, yaw: toRoad + (rng() - 0.5) * 0.9, s: 0.94 + rng() * 0.12,
        });
        placed++;
      }
      if (placed) groups++;

      /* A marshal on the inside, closer in, in a high-vis vest — the one
       * person whose job is to be seen. */
      if (rng() < 0.75) {
        const mx = P.x - nx * side * (ROAD_SHOULDER + 4 + rng() * 3);
        const mz = P.z - nz * side * (ROAD_SHOULDER + 4 + rng() * 3);
        const my = terrain.height(mx, mz);
        if (my > LAKE_Y + 0.8 && clearsPoint(trail, mx, mz, ROAD_SHOULDER + 2.5)) {
          lists[0].push({ x: mx, y: my, z: mz,
                          yaw: Math.atan2(P.x - mx, P.z - mz) + (rng() - 0.5) * 0.4,
                          s: 1.0, hiVis: true });
          marshals++;
        }
      }
    }

    variants.forEach((geo, v) => {
      const list = lists[v];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = `stage:people:${v}`;
      const col = new THREE.Color();
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y, q.z);
        dummy.rotation.set(0, q.yaw, 0);
        dummy.scale.setScalar(q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        /* High-vis is a per-instance tint rather than a separate mesh: it is
         * one person in ten and a second draw call for that is not worth it. */
        if (q.hiVis) col.setRGB(2.6, 2.2, 0.5); else col.setRGB(1, 1, 1);
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    });

    this.counts = {
      groups, marshals,
      people: lists.reduce((a, l) => a + l.length, 0),
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
