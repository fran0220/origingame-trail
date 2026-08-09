/* The viewing platform at the falls.
 *
 * The track ends 8.9 m short of the waterfall's impact pool, facing it. That
 * is not an accident of routing — it is where a track like this is BUILT to
 * end, and in this country the end of such a track is always a platform with a
 * rail on it: the ground beside a plunge pool is undercut, slippery and
 * eroding, and the platform exists to keep three hundred pairs of boots a day
 * off it.
 *
 * It is worth building for the reason the trailhead and the service park were:
 * the player is guaranteed to look at it. This is the destination — the thing
 * the whole walk has been toward — and until now arriving consisted of the
 * track simply stopping.
 *
 * WHAT MAKES A PLATFORM READ, in order:
 *
 *   THE RAIL. A deck alone is a patch of different-coloured ground. A rail is
 *   a horizontal line at waist height across the whole view, and it is the
 *   single element that says "you have arrived somewhere built" — it also
 *   frames the falls behind it, which is what a lookout is for.
 *
 *   THE OVERHANG. The deck ends in mid-air over the bank rather than sitting
 *   on it. A platform flush with the ground is a paved area; one that
 *   cantilevers is a structure, and the gap under its lip is what shows the
 *   difference.
 */
import * as THREE from 'three';
import { IMPACT } from './water.js';

const TIMBER = [0.150, 0.128, 0.098];
const RAIL = [0.128, 0.108, 0.082];

export class JungleLookout {
  constructor(terrain, trail, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'jungle-lookout';
    this.materials = [];

    const pos = [], col = [], idx = [];
    const box = (cx, cy, cz, hw, h, hd, yaw, c) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const base = pos.length / 3;
      for (let i = 0; i < 8; i++) {
        const dx = (i & 1) ? hw : -hw, dy = (i & 2) ? h : 0, dz = (i & 4) ? hd : -hd;
        pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
        col.push(...c);
      }
      const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
      const SH = [0.82, 1.15, 0.90, 1.00, 1.02, 0.86];
      F.forEach((f, k) => {
        idx.push(base+f[0], base+f[1], base+f[2], base+f[0], base+f[2], base+f[3]);
        for (const vi of f) for (let j = 0; j < 3; j++) col[(base+vi)*3+j] *= SH[k] ** 0.4;
      });
    };

    const P = new THREE.Vector3();
    trail.pointAt(0.995, P);
    /* Face the falls, not the track's last tangent — the deck is square to
     * what it is for. */
    const yaw = Math.atan2(IMPACT.x - P.x, IMPACT.z - P.z);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);

    /* Pushed a little toward the water so the deck's far edge is over the
     * bank rather than short of it. */
    const cx = P.x + fx * 1.3, cz = P.z + fz * 1.3;
    const ground = terrain.height(cx, cz);
    const deckY = ground + 0.42;
    const HW = 2.0, HD = 1.5;

    /* Piles. The far pair are longer because the bank falls away — which is
     * the whole reason the deck is raised at all. */
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        const px = cx + Math.cos(yaw) * HW * 0.86 * dx + fx * HD * 0.86 * dz;
        const pz = cz + Math.sin(yaw) * HW * 0.86 * dx + fz * HD * 0.86 * dz;
        const g = terrain.height(px, pz);
        box(px, g - 0.35, pz, 0.075, (deckY - g) + 0.35, 0.075, yaw, TIMBER);
      }
    }

    /* Deck, as planks so it matches the boardwalk that leads here. */
    const NP = 11;
    for (let i = 0; i < NP; i++) {
      const u = (i / (NP - 1) - 0.5) * 2 * HD;
      const px = cx + fx * u, pz = cz + fz * u;
      const v = 0.84 + ((i * 37) % 11) / 26;
      box(px, deckY, pz, HW, 0.05, HD / NP * 0.86, yaw, TIMBER.map((c) => c * v));
    }

    /* Rail on the three open sides. Top rail at 1.05 m, a mid rail, and posts
     * — a single top rail with nothing under it reads as a washing line. */
    const railAt = (ax, az, halfLen, ryaw) => {
      for (const h of [1.05, 0.62]) {
        box(ax, deckY + h, az, halfLen, 0.055, 0.045, ryaw, RAIL);
      }
      const N = Math.max(2, Math.round(halfLen * 1.4));
      for (let i = 0; i <= N; i++) {
        const u = (i / N - 0.5) * 2 * halfLen;
        box(ax + Math.cos(ryaw) * u, deckY, az + Math.sin(ryaw) * u,
            0.045, 1.10, 0.045, ryaw, RAIL);
      }
    };
    /* Far edge, over the water. */
    railAt(cx + fx * HD, cz + fz * HD, HW, yaw);
    /* Two sides. */
    for (const s of [-1, 1]) {
      railAt(cx + Math.cos(yaw) * HW * s, cz + Math.sin(yaw) * HW * s,
             HD, yaw + Math.PI / 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'lookout', color: 0xffffff, vertexColors: true,
      roughness: 0.93, metalness: 0.0, envMapIntensity: 0.22,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'lookout:platform';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.counts = { triangles: idx.length / 3, deckY: +deckY.toFixed(2) };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
