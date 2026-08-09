/* What stands beside a state highway, apart from the marker posts.
 *
 * Two families, and both are doing more for the drive than for the scenery.
 *
 * Power lines are the only thing in this basin with a long horizontal rhythm.
 * A pole every fifty metres reads as a metronome at speed — it is how a driver
 * senses how fast they are actually going on a road with no other close
 * reference — and the catenary between them is one of the few curves in the
 * frame that is not a hill. They follow the road because that is where the
 * easement is.
 *
 * Chevron boards mark the corners, and unlike everything else here they are
 * information the player can act on. They are placed by *measuring the
 * alignment*, not by hand: any corner whose radius drops under 260 m gets a
 * board on its outside, which is roughly where a highway engineer would put
 * one, and it means the signs cannot drift out of step with the road the way
 * a hand-placed set would the first time the route is retuned.
 */
import * as THREE from 'three';
import { ROAD_SHOULDER, LAKE_Y, BOUNDS } from './basin.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class LakeRoadside {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-roadside';
    this.materials = [];
    this.meshes = [];
    this.geometries = [];

    const trail = terrain.trail;
    const rng = random(0x20de51);
    const L = trail.length;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const dummy = new THREE.Object3D();

    /* ── poles and wires, as one merged run ─────────────────────────────── */
    const pos = [], col = [], idx = [];
    const push = (x, y, z, c) => { const n = pos.length / 3; pos.push(x, y, z); col.push(...c); return n; };
    const POLE = [0.118, 0.098, 0.076];
    const WIRE = [0.055, 0.052, 0.050];

    const prism = (x, y, z, r0, r1, h, c, sides = 5) => {
      const b = pos.length / 3;
      for (let ring = 0; ring < 2; ring++) {
        const r = ring ? r1 : r0;
        for (let s = 0; s < sides; s++) {
          const a = (s / sides) * Math.PI * 2;
          push(x + Math.cos(a) * r, y + ring * h, z + Math.sin(a) * r,
               c.map((v) => v * (0.78 + 0.34 * ring)));
        }
      }
      for (let s = 0; s < sides; s++) {
        const n = (s + 1) % sides;
        idx.push(b + s, b + sides + s, b + n);
        idx.push(b + n, b + sides + s, b + sides + n);
      }
    };
    /* A hanging wire, drawn as a thin strip through its own catenary. */
    const span = (a, b, sag, c) => {
      const SEG = 6, t = 0.028;
      let prev = null;
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
        const y = a.y + (b.y - a.y) * u - sag * Math.sin(Math.PI * u);
        const v0 = push(x, y + t, z, c), v1 = push(x, y - t, z, c);
        if (prev) {
          idx.push(prev[0], prev[1], v0, prev[1], v1, v0);
          idx.push(v0, v1, prev[0], v1, prev[1], prev[0]);
        }
        prev = [v0, v1];
      }
    };

    const SPACING = 52;
    const HEIGHT = 7.4;
    const ARMS = [-0.62, 0, 0.62];
    let poles = 0, prevTops = null;
    for (let m = SPACING * 0.5; m < L; m += SPACING) {
      trail.pointAt(m / L, P); trail.tangentAt(m / L, T);
      const nx = T.z, nz = -T.x;
      /* Always on the inland side, where the easement runs — a line between
       * the road and the lake would be in every single frame of the drive. */
      const off = -(ROAD_SHOULDER + 5.2);
      const x = P.x + nx * off, z = P.z + nz * off;
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 1.0 || x < BOUNDS.x0 + 6 || x > BOUNDS.x1 - 6) { prevTops = null; continue; }
      prism(x, y - 0.15, z, 0.135, 0.095, HEIGHT, POLE, 5);
      /* Crossarm. */
      const ax = -nz, az = nx;
      const b0 = pos.length / 3;
      const arm = 0.95;
      for (const s of [-1, 1]) {
        push(x + ax * arm * s - nx * 0.055, y + HEIGHT - 0.55, z + az * arm * s - nz * 0.055, POLE);
        push(x + ax * arm * s + nx * 0.055, y + HEIGHT - 0.55, z + az * arm * s + nz * 0.055, POLE);
        push(x + ax * arm * s - nx * 0.055, y + HEIGHT - 0.42, z + az * arm * s - nz * 0.055, POLE);
        push(x + ax * arm * s + nx * 0.055, y + HEIGHT - 0.42, z + az * arm * s + nz * 0.055, POLE);
      }
      idx.push(b0, b0 + 1, b0 + 5, b0, b0 + 5, b0 + 4);
      idx.push(b0 + 2, b0 + 6, b0 + 7, b0 + 2, b0 + 7, b0 + 3);
      idx.push(b0, b0 + 4, b0 + 6, b0, b0 + 6, b0 + 2);
      idx.push(b0 + 1, b0 + 3, b0 + 7, b0 + 1, b0 + 7, b0 + 5);
      poles++;

      const tops = ARMS.map((a) => ({
        x: x + ax * a, y: y + HEIGHT - 0.36, z: z + az * a,
      }));
      if (prevTops) for (let w = 0; w < tops.length; w++) span(prevTops[w], tops[w], 0.85, WIRE);
      prevTops = tops;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometries.push(geo);
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.86, metalness: 0.0,
      side: THREE.DoubleSide,
    });
    this.materials.push(lineMat);
    const lineMesh = new THREE.Mesh(geo, lineMat);
    lineMesh.name = 'roadside:power';
    lineMesh.castShadow = true; lineMesh.receiveShadow = true;
    this.root.add(lineMesh);
    this.meshes.push(lineMesh);

    /* ── chevron boards, placed by measuring the corners ─────────────────── */
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    const radiusAt = (m) => {
      const S = 26;
      if (m - S < 0 || m + S > L) return Infinity;
      trail.pointAt((m - S) / L, A); trail.pointAt(m / L, B); trail.pointAt((m + S) / L, C);
      const ax = B.x - A.x, az = B.z - A.z, bx = C.x - B.x, bz = C.z - B.z;
      const cross = ax * bz - az * bx;
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(C.x - A.x, C.z - A.z);
      if (la * lb * lc < 1e-6) return Infinity;
      const k = 2 * Math.abs(cross) / (la * lb * lc);
      return { r: k > 1e-6 ? 1 / k : Infinity, turn: Math.sign(cross) };
    };

    /* Board: a yellow rectangle with a black chevron, both sides. */
    const boardGeo = (() => {
      const bp = [], bc = [], bi = [];
      const bpush = (x, y, z, c) => { const n = bp.length / 3; bp.push(x, y, z); bc.push(...c); return n; };
      const YEL = [0.640, 0.430, 0.048], BLK = [0.022, 0.022, 0.024];
      const quad = (x0, y0, x1, y1, zz, c) => {
        const a = bpush(x0, y0, zz, c), b = bpush(x1, y0, zz, c);
        const cc = bpush(x1, y1, zz, c), d = bpush(x0, y1, zz, c);
        bi.push(a, b, cc, a, cc, d); bi.push(a, cc, b, a, d, cc);
      };
      quad(-0.30, 0.0, 0.30, 0.60, 0, YEL);
      /* The chevron itself, as two bars meeting at a point. */
      for (const s of [-1, 1]) {
        const a = bpush(0.0 * s, 0.10, 0.012, BLK), b = bpush(0.22 * s, 0.30, 0.012, BLK);
        const c = bpush(0.22 * s, 0.46, 0.012, BLK), d = bpush(0.0 * s, 0.26, 0.012, BLK);
        bi.push(a, b, c, a, c, d); bi.push(a, c, b, a, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
      g.setIndex(bi); g.computeVertexNormals();
      return g;
    })();
    this.geometries.push(boardGeo);
    const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.55, 5);
    postGeo.translate(0, 0.775, 0);
    this.geometries.push(postGeo);

    const signMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const postMat = new THREE.MeshStandardMaterial({ color: 0xb9b7ae, roughness: 0.7, metalness: 0.1 });
    this.materials.push(signMat, postMat);

    const boards = [];
    let last = -999;
    for (let m = 40; m < L - 40; m += 12) {
      const q = radiusAt(m);
      if (q === Infinity || q.r > 260) continue;
      if (m - last < 34) continue;
      last = m;
      trail.pointAt(m / L, P); trail.tangentAt(m / L, T);
      const nx = T.z, nz = -T.x;
      /* Outside of the bend: a chevron faces the driver from the far side of
       * the corner, which is the side the road curves away from. */
      const side = q.turn > 0 ? 1 : -1;
      const off = (ROAD_SHOULDER + 1.5) * side;
      const x = P.x + nx * off, z = P.z + nz * off;
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 0.9) continue;
      boards.push({ x, y, z, yaw: Math.atan2(T.x, T.z) + Math.PI, flip: side < 0 });
    }
    if (boards.length) {
      const bm = new THREE.InstancedMesh(boardGeo, signMat, boards.length);
      const pm = new THREE.InstancedMesh(postGeo, postMat, boards.length);
      bm.name = 'roadside:chevrons';
      boards.forEach((b, i) => {
        dummy.position.set(b.x, b.y + 0.85, b.z);
        dummy.rotation.set(0, b.yaw, 0);
        dummy.scale.set(b.flip ? -1 : 1, 1, 1);
        dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix);
        dummy.position.set(b.x, b.y - 0.1, b.z);
        dummy.rotation.set(0, b.yaw, 0); dummy.scale.setScalar(1);
        dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix);
      });
      bm.instanceMatrix.needsUpdate = true; pm.instanceMatrix.needsUpdate = true;
      for (const m2 of [bm, pm]) {
        m2.castShadow = true; m2.receiveShadow = true; m2.computeBoundingSphere();
        this.root.add(m2); this.meshes.push(m2);
      }
    }

    this.counts = { poles, chevrons: boards.length, triangles: idx.length / 3 };
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
