/* The gates a timed stage is actually run on.
 *
 * race.js has kept six gates since it was written — a start, four splits and a
 * finish, each on a named piece of road — and the HUD counts the player
 * through them. Nothing in the WORLD marked any of them. The player was being
 * timed by an invisible tripwire, which is the difference between a stage and
 * a lap counter.
 *
 * The gate list is imported from race.js rather than restated here, so a split
 * cannot be moved in one file and left behind in the other. That has been the
 * shape of several bugs in this project already: two copies of one truth.
 *
 * WHAT EACH GATE HAS TO SAY, which is different for the three kinds:
 *
 *   THE START is an arch. It is the only structure on the road the player sees
 *   from a standstill, and it has to read as the beginning of something.
 *
 *   A SPLIT is a beam on two legs with a number on it. Deliberately lighter
 *   than the start: a split is passed at full speed and must not look like a
 *   finish, or every one of them reads as the end of the stage.
 *
 *   THE FINISH is chequered. That pattern does one job and there is no
 *   substitute for it — a differently-coloured banner would be another gate.
 */
import * as THREE from 'three';
import { LAKE_Y, ROAD_SHOULDER } from './basin.js';
import { GATES } from '../../game/race.js';
import { DIGIT_GLSL } from '../../render/digits.js';

/* Banner face. `aKind` picks what is printed: 0 start, 1..n split number,
 * 99 finish chequer. */
const BANNER_FRAG = /* glsl */ `
  {
    vec2 p = vBannerUv;
    vec3 col;
    if (vKindF > 50.0) {
      /* Chequered. Eight across is the proportion a real finish banner uses;
       * finer than that turns grey at any distance. */
      vec2 q = floor(p * vec2(10.0, 3.0));
      float c = mod(q.x + q.y, 2.0);
      col = mix(vec3(0.055, 0.055, 0.060), vec3(0.760, 0.760, 0.755), c);
    } else if (vKindF < 0.5) {
      /* Start: a plain strong ground. */
      col = vec3(0.090, 0.230, 0.520);
      float bar = step(0.86, p.y) + step(p.y, 0.14);
      col = mix(col, vec3(0.780, 0.180, 0.090), clamp(bar, 0.0, 1.0));
    } else {
      col = vec3(0.086, 0.096, 0.110);
      /* Split number, centred. */
      vec2 np = vec2((p.x - 0.42) / 0.16, (p.y - 0.22) / 0.56);
      float n = digit(np, int(vKindF + 0.5));
      col = mix(col, vec3(0.880, 0.840, 0.300), n);
      float edge = step(0.93, p.y) + step(p.y, 0.07);
      col = mix(col, vec3(0.640, 0.560, 0.120), clamp(edge, 0.0, 1.0));
    }
    diffuseColor.rgb = col;
  }
`;

export class LakeTiming {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-timing';
    this.materials = [];
    this.geometries = [];

    const trail = terrain.trail;
    const L = trail.length;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const dummy = new THREE.Object3D();

    const steelMat = new THREE.MeshStandardMaterial({
      name: 'timing-steel', color: 0x8f9298, roughness: 0.52, metalness: 0.55,
    });
    this.materials.push(steelMat);

    const bannerMat = new THREE.MeshStandardMaterial({
      name: 'timing-banner', color: 0xffffff, roughness: 0.80, metalness: 0.0,
      side: THREE.DoubleSide, envMapIntensity: 0.4,
    });
    bannerMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec2 aBannerUv;\nattribute float aKind;\n' +
        'varying vec2 vBannerUv;\nvarying float vKindF;\n' +
        sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n  vBannerUv = aBannerUv;\n  vKindF = aKind;');
      sh.fragmentShader = 'varying vec2 vBannerUv;\nvarying float vKindF;\n' +
        DIGIT_GLSL + sh.fragmentShader.replace(
          '#include <color_fragment>', '#include <color_fragment>\n' + BANNER_FRAG);
    };
    bannerMat.customProgramCacheKey = () => 'lake-timing-banner-v1';
    this.materials.push(bannerMat);

    /* Banner face: one plane, instanced. */
    const bannerGeo = new THREE.PlaneGeometry(1, 1);
    const uv = [];
    for (const [u, v] of [[0, 1], [1, 1], [0, 0], [1, 0]]) uv.push(u, v);
    bannerGeo.setAttribute('aBannerUv', new THREE.Float32BufferAttribute(uv, 2));
    this.geometries.push(bannerGeo);

    /* Legs and beam as one merged steel geometry per gate size, placed by
     * instance. Two sizes: the start/finish arch and the lighter split. */
    const frame = (span, height, legR, beamR) => {
      const g = new THREE.BufferGeometry();
      const pos = [], idx = [];
      const tube = (x0, y0, x1, y1, r) => {
        const base = pos.length / 3;
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        for (let ring = 0; ring < 2; ring++) {
          for (let s = 0; s < 6; s++) {
            const a = (s / 6) * Math.PI * 2;
            /* Perpendicular in the plane, plus Z for the tube's round. */
            pos.push(x0 + dx * ring + (-uy) * Math.cos(a) * r,
                     y0 + dy * ring + (ux) * Math.cos(a) * r,
                     Math.sin(a) * r);
          }
        }
        for (let s = 0; s < 6; s++) {
          const n = (s + 1) % 6;
          idx.push(base + s, base + 6 + s, base + n);
          idx.push(base + n, base + 6 + s, base + 6 + n);
        }
      };
      tube(-span / 2, 0, -span / 2, height, legR);
      tube(span / 2, 0, span / 2, height, legR);
      tube(-span / 2, height, span / 2, height, beamR);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    };
    /* Clearance: legs outside the shoulder, beam well over a car with a roof
     * scoop and a light pod. */
    const SPAN = (ROAD_SHOULDER + 1.6) * 2;
    const archGeo = frame(SPAN, 5.6, 0.085, 0.070);
    const splitGeo = frame(SPAN, 5.2, 0.058, 0.048);
    this.geometries.push(archGeo, splitGeo);

    const arches = [], splits = [], banners = [];
    GATES.forEach((gate, gi) => {
      const t = Math.min(0.9995, Math.max(0.0005, gate.t));
      trail.pointAt(t, P);
      trail.tangentAt(t, T);
      const y = terrain.height(P.x, P.z);
      if (y < LAKE_Y + 0.5) return;
      const yaw = Math.atan2(T.x, T.z);
      const isStart = gi === 0;
      const isFinish = gi === GATES.length - 1;
      const big = isStart || isFinish;
      (big ? arches : splits).push({ x: P.x, y, z: P.z, yaw });
      banners.push({
        x: P.x, y: y + (big ? 4.85 : 4.55), z: P.z, yaw,
        w: SPAN * 0.92, h: big ? 1.05 : 0.75,
        kind: isFinish ? 99 : isStart ? 0 : gi,
      });
    });

    const addFrames = (geo, list, name) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, steelMat, list.length);
      m.name = name;
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y - 0.05, q.z);
        dummy.rotation.set(0, q.yaw, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = true; m.receiveShadow = true;
      m.computeBoundingSphere();
      this.root.add(m);
    };
    addFrames(archGeo, arches, 'timing:arch');
    addFrames(splitGeo, splits, 'timing:split');

    if (banners.length) {
      const bm = new THREE.InstancedMesh(bannerGeo, bannerMat, banners.length);
      bm.name = 'timing:banner';
      const kinds = new Float32Array(banners.length);
      banners.forEach((q, i) => {
        kinds[i] = q.kind;
        dummy.position.set(q.x, q.y, q.z);
        dummy.rotation.set(0, q.yaw + Math.PI, 0);
        dummy.scale.set(q.w, q.h, 1);
        dummy.updateMatrix();
        bm.setMatrixAt(i, dummy.matrix);
      });
      bannerGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
      bm.instanceMatrix.needsUpdate = true;
      bm.castShadow = false; bm.receiveShadow = true;
      bm.computeBoundingSphere();
      this.root.add(bm);
    }

    this.counts = { gates: GATES.length, arches: arches.length,
                    splits: splits.length, banners: banners.length };
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
