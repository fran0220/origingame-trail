/* The trailhead, and the markers that make it a marked route.
 *
 * The walk begins in undifferentiated bush. There is nothing at the start
 * saying a track begins here, which means the player's first act is to guess
 * — and the level's answer to "where do I go" is currently a slightly worn
 * strip of litter.
 *
 * This is the jungle's equivalent of the lake's service park, and it is worth
 * building for the same reason: the camera starts pointed at it. Several
 * things added to this project were invisible in practice because nothing made
 * the player look at them. Here they cannot look anywhere else.
 *
 * TWO PARTS, and the second is the one that keeps working after the first is
 * behind you:
 *
 *   THE HEAD ITSELF — a track sign on two posts and a boot-cleaning station.
 *   The boot station is not decoration: every kauri-country track in this
 *   country has one, because the disease travels in soil on footwear, and it
 *   is the single most specific object that can be put at a New Zealand
 *   trailhead.
 *
 *   THE MARKERS. Orange triangles at eye height the whole way along. They are
 *   the only saturated colour in a forest of olive, they sit at exactly the
 *   height the eye is already scanning, and — the part that matters for a
 *   walking level — a line of them TELLS YOU WHERE THE TRACK GOES through
 *   ground where the track itself is barely readable.
 */
import * as THREE from 'three';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const TIMBER = [0.140, 0.120, 0.092];
const PANEL = [0.075, 0.098, 0.082];
const PLATE = [0.185, 0.180, 0.170];
/* DOC orange. Deliberately far brighter than anything else in this level:
 * a marker that blends in is a marker that has failed. */
const ORANGE = [0.780, 0.300, 0.045];

export class JungleTrailhead {
  constructor(terrain, trail, tier = 'high', collision = null) {
    this.root = new THREE.Group();
    this.root.name = 'jungle-trailhead';
    this.materials = [];

    const rng = random(0x71a1ead);
    const pos = [], col = [], idx = [];
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const L = trail.length;
    let markers = 0;

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

    /* A triangle plate, point up, standing in the XY plane of its own yaw. */
    const triangle = (cx, cy, cz, r, yaw, c) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const base = pos.length / 3;
      const pts = [[0, r], [-r * 0.88, -r * 0.62], [r * 0.88, -r * 0.62]];
      for (const [dx, dy] of pts) {
        pos.push(cx + dx * co, cy + dy, cz + dx * s);
        col.push(...c);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 1);
    };

    /* ── the head ─────────────────────────────────────────────────────────
     *
     * PUT IT IN THE FIELD OF VIEW, not merely near the start. The first
     * version sat at 2.5 m along and 1.9 m to the side of a camera standing at
     * 1.7 m — a bearing of 67 degrees, outside a 58-degree frustum. It
     * measured 0.23% of frame from the start position and was, quite simply,
     * not on screen: near the player and behind their shoulder is the same as
     * absent.
     *
     * Nine metres up the track puts the same offset at about 12 degrees, which
     * is the middle of the view and where a sign is read from anyway. */
    const headT = Math.min(0.5, 9 / L);
    trail.pointAt(headT, P);
    trail.tangentAt(headT, T);
    const yaw = Math.atan2(T.x, T.z);
    const nx = T.z, nz = -T.x;
    const hx = P.x + nx * 2.1, hz = P.z + nz * 2.1;
    const hy = terrain.height(hx, hz);

    /* Track sign: two posts and a board facing back down the track, so it is
     * read on arrival rather than from behind. */
    for (const s of [-1, 1]) {
      const px = hx + Math.cos(yaw) * 0.62 * s, pz = hz + Math.sin(yaw) * 0.62 * s;
      box(px, terrain.height(px, pz) - 0.1, pz, 0.055, 1.85, 0.055, yaw, TIMBER);
    }
    box(hx, hy + 1.18, hz, 0.72, 0.52, 0.035, yaw, PANEL);
    /* The sign is a solid object at head height. Walking through a signboard
     * is a small thing that reads as a large one: it is the first man-made
     * object in the level and the first chance to establish that things here
     * are real. */
    if (collision) {
      collision.addCapsule({
        ax: hx - Math.cos(yaw) * 0.66, az: hz - Math.sin(yaw) * 0.66,
        bx: hx + Math.cos(yaw) * 0.66, bz: hz + Math.sin(yaw) * 0.66,
        radius: 0.14, minY: hy - 0.4, maxY: hy + 2.0, kind: 'sign',
      });
    }
    /* A header band and the orange triangle that identifies the route. */
    box(hx, hy + 1.60, hz, 0.72, 0.11, 0.040, yaw, ORANGE);
    triangle(hx, hy + 1.42, hz + 0.05, 0.155, yaw, ORANGE);

    /* Boot-cleaning station: a low grated tray on legs, a brush and a hopper.
     * Squat and functional — it is a piece of plumbing, not furniture. */
    const bx = hx + nx * 2.0, bz = hz + nz * 2.0;
    const by = terrain.height(bx, bz);
    box(bx, by, bz, 0.62, 0.34, 0.44, yaw, PLATE);
    if (collision) {
      collision.addCircle({ x: bx, z: bz, radius: 0.60,
                            minY: by - 0.4, maxY: by + 1.2, kind: 'sign' });
    }
    for (let i = 0; i < 5; i++) {
      box(bx - 0.5 + i * 0.25, by + 0.34, bz, 0.055, 0.035, 0.42, yaw, [0.10, 0.105, 0.11]);
    }
    box(bx + 0.52, by + 0.34, bz - 0.30, 0.10, 0.70, 0.10, yaw, TIMBER);
    box(bx + 0.52, by + 1.02, bz - 0.30, 0.13, 0.16, 0.13, yaw, ORANGE);

    /* ── the markers ──────────────────────────────────────────────────────
     * Every 14 m, alternating sides, on a stake at eye height and turned to
     * face back along the track. A marker square to the trail is edge-on to
     * the walker and invisible, which is the failure mode of every sign in
     * this project so far. */
    const SPACING = tier === 'low' ? 22 : 14;
    for (let m = 16; m < L - 8; m += SPACING) {
      trail.pointAt(m / L, P);
      trail.tangentAt(m / L, T);
      const my = Math.atan2(T.x, T.z);
      const mnx = T.z, mnz = -T.x;
      const side = ((m / SPACING) | 0) % 2 ? 1 : -1;
      const off = 1.5 + rng() * 0.7;
      const px = P.x + mnx * side * off, pz = P.z + mnz * side * off;
      const py = terrain.height(px, pz);
      /* Stake, then the plate facing back down the track. */
      box(px, py - 0.1, pz, 0.035, 1.55, 0.035, my, TIMBER);
      triangle(px, py + 1.46, pz, 0.115, my + Math.PI, ORANGE);
      markers++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'trailhead', color: 0xffffff, vertexColors: true,
      roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide,
      envMapIntensity: 0.28,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'trailhead:signage';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    this.counts = { markers, triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
