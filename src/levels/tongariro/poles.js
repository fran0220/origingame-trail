/* The poled route.
 *
 * Above the bushline there is no track to follow — the ground is ash and
 * scoria and a boot print is gone in a day — so the route is marked by orange-
 * topped poles at intervals you can see from one to the next. In cloud they
 * are the only thing between a walker and the crater, which is why they are
 * placed closer together on the ridge than anywhere else and why they are
 * that colour.
 *
 * WHY THIS IS THE SECOND THING BUILT, before steam or huts or signs:
 *
 *   IT IS THE ROUTE. Every other level in this project has a path the player
 *   can see — a road with white lines, a trail cut through litter. This one
 *   has neither by construction, so without poles the player is standing in a
 *   featureless ash pan with no idea which way the walk goes. That is not
 *   atmosphere, it is a missing interface.
 *
 *   IT IS ORANGE. The palette is grey ash, red scoria, black lava, white snow.
 *   Fluorescent orange appears nowhere in nature here and carries further than
 *   anything else on the mountain, which is exactly why DOC uses it.
 *
 *   IT IS A LINE OF THEM. One pole is a stick; a line of poles running away
 *   over a rise is a route, and it tells the player where they are going for
 *   the next two hundred metres without a word of UI.
 */
import * as THREE from 'three';
import { STAGES } from './route.js';

const ORANGE = [0.880, 0.300, 0.040];
const TIMBER = [0.300, 0.256, 0.196];

export class Poles {
  constructor(terrain, trail) {
    this.root = new THREE.Group();
    this.root.name = 'tongariro-poles';
    this.materials = [];

    const pos = [], col = [], idx = [];
    let count = 0;

    const box = (cx, cy, cz, hw, h, hd, yaw, c) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const base = pos.length / 3;
      for (let i = 0; i < 8; i++) {
        const dx = (i & 1) ? hw : -hw, dy = (i & 2) ? h : 0, dz = (i & 4) ? hd : -hd;
        pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
        col.push(...c);
      }
      const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
      const SH = [0.82, 1.18, 0.90, 1.00, 1.04, 0.86];
      F.forEach((f, k) => {
        idx.push(base+f[0], base+f[1], base+f[2], base+f[0], base+f[2], base+f[3]);
        for (const vi of f) for (let j = 0; j < 3; j++) col[(base+vi)*3+j] *= SH[k] ** 0.4;
      });
    };

    const P = new THREE.Vector3(), T = new THREE.Vector3();
    /* SPACING IS A FUNCTION OF HOW BAD IT GETS. On the open crater floor and
     * the ridge they go in closer, because those are the two places people get
     * lost when the cloud comes down — the floor has no features at all and
     * the ridge has a drop on both sides. */
    const spacingAt = (t) => {
      if (t >= STAGES.redRidge[0] && t < STAGES.redRidge[1]) return 22;
      if (t >= STAGES.southCrater[0] && t < STAGES.southCrater[1]) return 26;
      if (t >= STAGES.scree[0] && t < STAGES.scree[1]) return 24;
      return 38;
    };

    /* Walk the route in even ground distance so spacing is metres, not t. */
    let prev = null, acc = 1e9;
    for (let t = 0.005; t < 0.995; t += 0.0008) {
      trail.pointAt(t, P);
      if (prev) acc += Math.hypot(P.x - prev.x, P.z - prev.z);
      prev = { x: P.x, z: P.z };
      if (acc < spacingAt(t)) continue;
      acc = 0;
      trail.tangentAt(t, T);
      const yaw = Math.atan2(T.x, T.z);
      /* Just off the tread, on the uphill side where it will not be walked
       * into, which is where they actually stand. */
      const nx = T.z, nz = -T.x;
      const off = trail.widthAt(t) + 0.35;
      const x = P.x + nx * off, z = P.z + nz * off;
      const g = terrain.height(x, z);
      /* 1.5 m of pole, with the top 0.45 m orange. Two boxes, not one with a
       * texture: the band has to survive being seen from 200 m, and at that
       * range a texture is one pixel of mush while a separate box is still a
       * separate box. */
      box(x, g - 0.25, z, 0.045, 1.35, 0.045, yaw, TIMBER);
      box(x, g + 1.10, z, 0.055, 0.45, 0.055, yaw, ORANGE);
      count++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'route-poles', vertexColors: true,
      roughness: 0.82, metalness: 0.0, envMapIntensity: 0.35,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'poles:route';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    this.counts = { poles: count, triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
