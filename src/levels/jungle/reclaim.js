/* The forest taking the ruins back.
 *
 * The ruins are 536 blocks of clean cut stone standing in a rainforest, and
 * that is the one thing they cannot be. A wall in this climate is colonised
 * within a season and structural within a decade: the roots find the joints,
 * widen them, and end up holding the stone they are pulling apart. The single
 * most recognisable image of a jungle ruin is not the architecture, it is the
 * timber gripping it.
 *
 * WHY ROOTS RATHER THAN MOSS. Moss is a tint — it changes the colour of a
 * surface and leaves its silhouette exactly where it was. A root changes the
 * OUTLINE: it breaks the straight top edge of a wall, which is the line that
 * makes the stone read as masonry, and it is that broken edge the eye reads as
 * age. Tinting the blocks green would have been a tenth of the work and would
 * have made them look like green blocks.
 *
 * They are grown from the STONE ITSELF rather than scattered near it. The
 * ruin geometry is sampled for high, outward-facing vertices — the tops and
 * shoulders of walls — and a root is draped from each one down the face it
 * belongs to. Placing them from the ruin's plan instead would put roots in
 * mid-air wherever a block had fallen, and the fallen blocks are most of what
 * is out there.
 */
import * as THREE from 'three';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class JungleReclaim {
  constructor(ruins, terrain, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'jungle-reclaim';
    this.materials = [];

    const rng = random(0x9ea11c);
    const pos = [], col = [], idx = [];
    let roots = 0;

    /* ── find the stone ───────────────────────────────────────────────────
     * Sample the ruin meshes for candidate anchors: vertices that are high
     * relative to their own mesh and face outward. Deduplicated onto a coarse
     * grid so a single wall does not receive forty roots in one metre. */
    const anchors = [];
    const seen = new Set();
    const V = new THREE.Vector3(), N = new THREE.Vector3();
    ruins.root.updateMatrixWorld(true);
    ruins.root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const p = o.geometry.getAttribute('position');
      const nr = o.geometry.getAttribute('normal');
      if (!p || !nr) return;
      /* Mesh-local top, so a low block still gets roots on ITS top rather
       * than only the tallest wall in the ruin getting all of them. */
      let hi = -Infinity, lo = Infinity;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y > hi) hi = y;
        if (y < lo) lo = y;
      }
      const band = Math.max(0.25, (hi - lo) * 0.32);
      for (let i = 0; i < p.count; i += 3) {
        if (p.getY(i) < hi - band) continue;
        N.set(nr.getX(i), nr.getY(i), nr.getZ(i));
        /* Outward or upward faces only — a root on the underside of a lintel
         * is hanging from nothing. */
        if (N.y < -0.2) continue;
        V.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld);
        const key = `${Math.round(V.x / 1.1)},${Math.round(V.y / 0.9)},${Math.round(V.z / 1.1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        N.transformDirection(o.matrixWorld);
        anchors.push({ x: V.x, y: V.y, z: V.z, nx: N.x, nz: N.z });
      }
    });

    /* ── drape a root from each ───────────────────────────────────────────
     * A root leaves the top, runs down the face, and turns out at the bottom
     * where it reaches soil. The outward push at the foot is what stops it
     * looking like a painted stripe on the wall. */
    const SIDES = 4;
    const DENS = tier === 'low' ? 0.35 : tier === 'medium' ? 0.65 : 1.0;
    const want = Math.min(anchors.length, Math.round(anchors.length * DENS));
    const stride = Math.max(1, Math.floor(anchors.length / Math.max(1, want)));

    for (let ai = 0; ai < anchors.length; ai += stride) {
      const a = anchors[ai];
      const ground = terrain.height(a.x, a.z);
      const drop = a.y - ground;
      if (drop < 0.35 || drop > 9) continue;

      const SEG = 7;
      const r0 = 0.030 + rng() * 0.055;
      const path = [];
      const lean = 0.10 + rng() * 0.26;
      const wander = rng() * 6.283;
      let nx = a.nx, nz = a.nz;
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG;
        /* Clings to the face for most of the drop, then flares out into the
         * litter — a root that meets the ground vertically has not rooted. */
        const out = lean * (0.18 + Math.pow(t, 2.4) * 1.6);
        const sway = Math.sin(wander + t * 3.1) * 0.09 * (1 - t * 0.4);
        path.push([
          a.x + nx * out - nz * sway,
          a.y - drop * t - (t > 0.94 ? 0.05 : 0),
          a.z + nz * out + nx * sway,
        ]);
      }

      const base = pos.length / 3;
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG;
        /* Thickest at the top where it is doing the holding, tapering down. */
        const r = r0 * (1.0 - t * 0.45) * (0.85 + rng() * 0.3);
        /* Old root: grey-brown, paler than the leaf litter and darker than
         * the stone, which is what makes it read against both. */
        const v = 0.088 + rng() * 0.032 + t * 0.018;
        for (let s = 0; s < SIDES; s++) {
          const ang = (s / SIDES) * Math.PI * 2 + t * 1.9;
          const shade = 0.70 + 0.46 * (Math.cos(ang) * 0.5 + 0.5);
          pos.push(path[k][0] + Math.cos(ang) * r,
                   path[k][1],
                   path[k][2] + Math.sin(ang) * r);
          col.push(v * 1.10 * shade, v * 0.98 * shade, v * 0.80 * shade);
        }
      }
      for (let k = 0; k < SEG; k++) {
        for (let s = 0; s < SIDES; s++) {
          const n = (s + 1) % SIDES;
          idx.push(base + k * SIDES + s, base + (k + 1) * SIDES + s, base + k * SIDES + n);
          idx.push(base + k * SIDES + n, base + (k + 1) * SIDES + s, base + (k + 1) * SIDES + n);
        }
      }
      roots++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'reclaim-root', color: 0xffffff, vertexColors: true,
      roughness: 0.95, metalness: 0.0, envMapIntensity: 0.25,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'reclaim:roots';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    this.counts = { anchors: anchors.length, roots, triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
