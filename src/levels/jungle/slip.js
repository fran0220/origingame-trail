/* Where the bank slipped, and the crib that holds the track up.
 *
 * Re-measuring the jungle after the windthrow shows it lifted t = 0.275 from
 * 4.2% to 5.9% and left the run either side of it at 2.7 to 2.8% — still the
 * thinnest stretch of the walk. This goes at t = 0.35.
 *
 * A track cut into a steep bank in high rainfall does one thing eventually: it
 * slips. What follows is equally predictable — the crew benches the track back
 * in and holds the downhill edge with a crib of split timber pinned into the
 * slope. Half of any long track in this country is held up by one.
 *
 * WHAT MAKES IT WORTH THE SPACE:
 *
 *   RAW EARTH. Every surface in this level is green, brown-black or timber. A
 *   fresh slip scar is pale orange clay, and it is the only large area of
 *   unvegetated ground anywhere on the walk — visible far further than its
 *   size suggests for that reason alone.
 *
 *   EXPOSED ROOTS. The scarp above the slip cuts through the root mat, so a
 *   fringe of severed roots hangs over the top edge. It is the detail that
 *   says the ground FAILED rather than that someone dug here.
 *
 *   A HORIZONTAL CRIB against a vertical forest, stepped back as it rises,
 *   which is both how they are built and what makes one read as engineering
 *   rather than as a fence lying down.
 */
import * as THREE from 'three';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class JungleSlip {
  constructor(terrain, trail, tier = 'high', collision = null) {
    this.root = new THREE.Group();
    this.root.name = 'jungle-slip';
    this.materials = [];

    const rng = random(0x51199a);
    const pos = [], col = [], idx = [];
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const L = trail.length;

    const CLAY = [0.360, 0.230, 0.128];
    const TIMBER = [0.132, 0.110, 0.082];
    const ROOT = [0.098, 0.080, 0.058];

    const box = (cx, cy, cz, hw, h, hd, yaw, c) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const base = pos.length / 3;
      for (let i = 0; i < 8; i++) {
        const dx = (i & 1) ? hw : -hw, dy = (i & 2) ? h : 0, dz = (i & 4) ? hd : -hd;
        pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
        col.push(...c);
      }
      const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
      const SH = [0.80, 1.16, 0.90, 1.00, 1.02, 0.86];
      F.forEach((f, k) => {
        idx.push(base+f[0], base+f[1], base+f[2], base+f[0], base+f[2], base+f[3]);
        for (const vi of f) for (let j = 0; j < 3; j++) col[(base+vi)*3+j] *= SH[k] ** 0.4;
      });
    };

    const at = 0.35;
    trail.pointAt(at, P);
    trail.tangentAt(at, T);
    const yaw = Math.atan2(T.x, T.z);
    const ax = Math.cos(yaw), az = Math.sin(yaw);
    const nx = T.z, nz = -T.x;

    /* Which side falls away? The crib goes on the downhill edge and the scar
     * above it on the uphill — getting that backwards would put a retaining
     * wall on the side that needs no retaining. */
    const probe = (s) => terrain.height(P.x + nx * s * 6, P.z + nz * s * 6);
    const side = probe(1) < probe(-1) ? 1 : -1;
    const RUN = 13;

    /* ── the scar ─────────────────────────────────────────────────────────
     * A pale face on the uphill bank, built as a strip of quads following the
     * track and leaning back into the slope. */
    const SEG = 9;
    const upper = [], lower = [];
    for (let k = 0; k <= SEG; k++) {
      const u = (k / SEG - 0.5) * RUN;
      /* The scar is widest in the middle and tapers to nothing at both ends,
       * because a slip is a bite out of the bank, not a trench. */
      const bite = Math.sin((k / SEG) * Math.PI);
      const bx = P.x + ax * u, bz = P.z + az * u;
      /* A FACE, NOT A RAMP. The first cut reached 4.9 m out while rising only
       * 1.8, which on ground this flat — the trail's median gradient is 0.024
       * — produced a broad smooth apron of clay lying almost level. A slip
       * scar is the near-vertical surface left where the ground broke away;
       * the giveaway is the ratio, not the area. Half the reach and half again
       * the height. */
      /* THE TOE CLEARS THE TRACK. At 1.2 m from the centreline the foot of the
       * scar stood inside the walking corridor — the correction for the ramp
       * turned it into a wall directly in front of the walker, filling 36% of
       * the frame at head height. A bank rises BESIDE a benched track, not out
       * of it. 2.3 m is outside the tread and still close enough to loom. */
      const outLo = -side * 2.3;
      const outHi = -side * (2.3 + 1.8 * bite);
      const lx = bx + nx * outLo, lz = bz + nz * outLo;
      const hx = bx + nx * outHi, hz = bz + nz * outHi;
      lower.push([lx, terrain.height(lx, lz) + 0.05, lz]);
      upper.push([hx, terrain.height(hx, hz) + 0.30 + 1.9 * bite, hz]);
    }
    for (let k = 0; k <= SEG; k++) {
      for (const [pt, shade] of [[lower[k], 0.82], [upper[k], 1.12]]) {
        pos.push(pt[0], pt[1], pt[2]);
        const v = (0.86 + rng() * 0.28) * shade;
        col.push(CLAY[0] * v, CLAY[1] * v, CLAY[2] * v);
      }
    }
    for (let k = 0; k < SEG; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      idx.push(a + 2, a + 1, a, a + 2, a + 3, a + 1);
    }

    /* ── severed roots over the top edge ──────────────────────────────── */
    let roots = 0;
    for (let k = 1; k < SEG; k++) {
      if (rng() > 0.75) continue;
      const u = upper[k];
      const n = 1 + ((rng() * 3) | 0);
      for (let r = 0; r < n; r++) {
        const jx = (rng() - 0.5) * 0.5, jz = (rng() - 0.5) * 0.5;
        const drop = 0.35 + rng() * 0.75;
        box(u[0] + jx, u[1] - drop, u[2] + jz,
            0.028 + rng() * 0.022, drop, 0.028 + rng() * 0.022,
            rng() * 6.283, ROOT);
        roots++;
      }
    }

    /* ── the crib ─────────────────────────────────────────────────────────
     * Split timber laid horizontally along the downhill edge, stepped back a
     * little each course. Three courses is what holds a metre of track. */
    let logs = 0;
    const COURSES = 3;
    const cribOut = side * 1.35;
    for (let c = 0; c < COURSES; c++) {
      const back = c * 0.14;
      const nSeg = 5;
      for (let k = 0; k < nSeg; k++) {
        const u = ((k + 0.5) / nSeg - 0.5) * RUN;
        const bx = P.x + ax * u + nx * (cribOut - side * back);
        const bz = P.z + az * u + nz * (cribOut - side * back);
        const g = terrain.height(bx, bz);
        box(bx, g + c * 0.26 - 0.10, bz,
            RUN / nSeg * 0.52, 0.24, 0.11, yaw + (rng() - 0.5) * 0.04,
            TIMBER.map((v) => v * (0.85 + rng() * 0.3)));
        logs++;
      }
      /* Vertical pins holding each course. */
      for (let k = 0; k <= 3; k++) {
        const u = (k / 3 - 0.5) * RUN * 0.92;
        const bx = P.x + ax * u + nx * (cribOut - side * back);
        const bz = P.z + az * u + nz * (cribOut - side * back);
        if (c === 0) {
          box(bx, terrain.height(bx, bz) - 0.4, bz, 0.055, 1.25, 0.055, yaw, TIMBER);
        }
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
      name: 'slip', color: 0xffffff, vertexColors: true,
      roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide,
      envMapIntensity: 0.22,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'slip:bench';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    /* The crib is a wall on the downhill edge. It is what stops a walker
     * stepping off the bench, which is the same argument as the lookout rail,
     * and it goes in before the audit has to ask. */
    if (collision) {
      collision.addCapsule({
        ax: P.x + ax * (-RUN / 2) + nx * cribOut,
        az: P.z + az * (-RUN / 2) + nz * cribOut,
        bx: P.x + ax * (RUN / 2) + nx * cribOut,
        bz: P.z + az * (RUN / 2) + nz * cribOut,
        radius: 0.18,
        minY: terrain.height(P.x, P.z) - 1.2,
        maxY: terrain.height(P.x, P.z) + 1.1,
        kind: 'crib',
      });
    }

    this.counts = { runM: RUN, cribLogs: logs, severedRoots: roots,
                    triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
