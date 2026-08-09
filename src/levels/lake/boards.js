/* Distance boards, and the marshalling a timed stage needs.
 *
 * The stage has a start, splits and a finish, and between them two kilometres
 * of road with nothing telling the driver where they are in it. Every real
 * special stage is marked: distance-to-finish boards on the approach, so a
 * crew knows whether to save the car or spend it.
 *
 * They are worth more here than the information they carry, because they are
 * the only object on this road with WRITING on it. A number is read rather
 * than seen, and the eye treats a legible sign completely differently from a
 * shape — it is the difference between scenery and a place that is being run.
 *
 * The numerals come from render/digits.js, which is the same GLSL the car's
 * door roundels use. Sharing it is not only economy: two sets of glyphs in one
 * scene read as two different typefaces and therefore as two unrelated
 * systems, which is exactly what a rally organiser's signage must not do.
 */
import * as THREE from 'three';
import { BOUNDS, LAKE_Y, ROAD_SHOULDER } from './basin.js';
import { clearsSegment } from '../../world/clearance.js';
import { DIGIT_GLSL } from '../../render/digits.js';

/* Board face. `aBoard` carries the panel's own 0..1 coordinates and the value
 * to print, so one geometry and one material serve every board. */
const BOARD_FRAG = /* glsl */ `
  {
    vec2 p = vBoardUv;
    vec3 GROUND = vec3(0.700, 0.690, 0.660);
    vec3 INK    = vec3(0.020, 0.022, 0.026);
    vec3 EDGE   = vec3(0.520, 0.090, 0.070);

    vec3 col = GROUND;
    /* A red border, which is what makes a white board read as a SIGN rather
     * than as a piece of board. */
    float inner = panel(p, vec2(0.5), vec2(0.44, 0.40), 0.05);
    col = mix(EDGE, col, inner);

    /* The number, right-aligned in the panel, and the unit under it. */
    vec2 np = vec2((p.x - 0.09) / 0.82, (p.y - 0.34) / 0.50);
    float n = number(np, vBoardValue, 0.30, 0.05);
    col = mix(col, INK, n);
    /* "KM" as two bars and a chevron — legible at the size this is read from
     * and cheaper than another glyph table. */
    float km = panel(p, vec2(0.34, 0.22), vec2(0.035, 0.09), 0.01);
    km = max(km, panel(p, vec2(0.46, 0.22), vec2(0.035, 0.09), 0.01));
    km = max(km, panel(p, vec2(0.60, 0.22), vec2(0.035, 0.09), 0.01));
    col = mix(col, INK, km * 0.85);

    diffuseColor.rgb = col;
  }
`;

export class LakeBoards {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-boards';
    this.materials = [];
    this.geometries = [];

    const trail = terrain.trail;
    const L = trail.length;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const dummy = new THREE.Object3D();

    /* ── the face ─────────────────────────────────────────────────────── */
    /* Bigger than the first cut. A real stage board is about a metre across
     * because it is read at speed, and at 0.80 x 0.62 these reached only
     * 0.06% of frame — under the 0.15% I set as the bar before writing any of
     * this. */
    const faceGeo = new THREE.PlaneGeometry(1.10, 0.84);
    const uv = [];
    for (const [u, v] of [[0, 1], [1, 1], [0, 0], [1, 0]]) uv.push(u, v);
    faceGeo.setAttribute('aBoardUv', new THREE.Float32BufferAttribute(uv, 2));
    this.geometries.push(faceGeo);

    const faceMat = new THREE.MeshStandardMaterial({
      name: 'board-face', color: 0xffffff, roughness: 0.66, metalness: 0.0,
      side: THREE.DoubleSide, envMapIntensity: 0.35,
    });
    faceMat.onBeforeCompile = (sh) => {
      sh.vertexShader =
        'attribute vec2 aBoardUv;\nattribute float aValue;\n' +
        'varying vec2 vBoardUv;\nvarying float vValueF;\n' +
        sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n  vBoardUv = aBoardUv;\n  vValueF = aValue;');
      sh.fragmentShader =
        'varying vec2 vBoardUv;\nvarying float vValueF;\n' + DIGIT_GLSL +
        sh.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n  int vBoardValue = int(vValueF + 0.5);\n' + BOARD_FRAG);
    };
    faceMat.customProgramCacheKey = () => 'lake-board-face-v1';
    this.materials.push(faceMat);

    const postMat = new THREE.MeshStandardMaterial({
      name: 'board-post', color: 0x2a2c30, roughness: 0.8, metalness: 0.1,
    });
    this.materials.push(postMat);
    /* THE POST STOPS AT THE BOARD, and stands behind it.
     *
     * At 1.55 m it ran up through the middle of the face and split the
     * numerals in two — a post in front of the sign it carries, which is the
     * one thing a signpost cannot be. It ends at the board's lower edge now
     * and sits 60 mm back along the face normal. */
    const postGeo = new THREE.CylinderGeometry(0.038, 0.038, 1.20, 6);
    postGeo.translate(0, 0.60, 0);
    this.geometries.push(postGeo);

    /* ── where they go ────────────────────────────────────────────────── */
    const sites = [];
    /* EVERY 200 m, LABELLED IN HUNDREDS.
     *
     * Whole kilometres are the wrong unit for a stage this short: at 2,019 m
     * there are exactly two of them and one falls inside the start area, so
     * the first version of this built a single board in two kilometres. Short
     * stages are marked in hundreds of metres for the same reason, and it
     * gives nine boards spaced closely enough that the countdown is legible as
     * a countdown rather than as two isolated signs. */
    const STEP_M = 200;
    for (let d = STEP_M; d <= L - 60; d += STEP_M) {
      /* Distance TO the finish, so the numbers count down as the crew drives
       * — which is the direction the information is useful in. */
      const m = L - d;
      const km = Math.round(d / 100);
      if (m < 30 || m > L - 30) continue;
      trail.pointAt(m / L, P);
      trail.tangentAt(m / L, T);
      const nx = T.z, nz = -T.x;
      const yaw = Math.atan2(T.x, T.z);
      const ax = Math.cos(yaw), az = Math.sin(yaw);
      /* Inland side, clear of the seal along the board's whole width — the
       * lesson from the culvert headwalls, which reached into the road on a
       * bend because only their centre was tested. */
      let off = null;
      for (const cand of [1.2, 2.2, 3.4, 5.0]) {
        const o = -(ROAD_SHOULDER + cand);
        const cx = P.x + nx * o, cz = P.z + nz * o;
        if (clearsSegment(trail, cx - ax * 0.45, cz - az * 0.45,
                          cx + ax * 0.45, cz + az * 0.45,
                          ROAD_SHOULDER + 0.6, 0.4)) { off = o; break; }
      }
      if (off === null) continue;
      const x = P.x + nx * off, z = P.z + nz * off;
      if (x < BOUNDS.x0 + 6 || x > BOUNDS.x1 - 6) continue;
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 0.8) continue;
      sites.push({ x, y, z, yaw, value: km });
    }

    if (sites.length) {
      const faces = new THREE.InstancedMesh(faceGeo, faceMat, sites.length);
      const posts = new THREE.InstancedMesh(postGeo, postMat, sites.length);
      faces.name = 'boards:faces';
      posts.name = 'boards:posts';
      const values = new Float32Array(sites.length);
      sites.forEach((s, i) => {
        values[i] = s.value;
        /* The face turned to meet the oncoming car, not square to the road:
         * a board edge-on is unreadable, which is the entire failure mode of
         * roadside signage. */
        dummy.position.set(s.x, s.y + 1.28, s.z);
        dummy.rotation.set(0, s.yaw + Math.PI, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        faces.setMatrixAt(i, dummy.matrix);
        dummy.position.set(s.x - Math.sin(s.yaw) * 0.06, s.y - 0.05,
                           s.z - Math.cos(s.yaw) * 0.06);
        dummy.rotation.set(0, s.yaw, 0);
        dummy.updateMatrix();
        posts.setMatrixAt(i, dummy.matrix);
      });
      faceGeo.setAttribute('aValue', new THREE.InstancedBufferAttribute(values, 1));
      faces.instanceMatrix.needsUpdate = true;
      posts.instanceMatrix.needsUpdate = true;
      for (const m of [faces, posts]) {
        m.castShadow = true; m.receiveShadow = true;
        m.computeBoundingSphere();
        this.root.add(m);
      }
    }
    this.counts = { boards: sites.length };
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
