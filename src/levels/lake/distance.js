/* The Southern Alps are terrain, not a skyline card.
 *
 * Each layer is a complete x/z heightfield with a front apron, mountain feet,
 * side ridges and valleys. The old implementation extruded one one-dimensional
 * ridge through five rows; no amount of subdivision could make that strip grow
 * tributary ridges, cirques or scree. These meshes carry the actual landform in
 * geometry, while the material only describes what collected on that form.
 */
import * as THREE from 'three';
import { Noise2D, clamp, smoothstep } from '../../world/noise.js';

const HAZE = new THREE.Color(0xb7cddd);
const RANGES = [
  {
    name: 'alps-foothills', seed: 0x4391, x0: -3000, x1: 2100, z0: -1150, z1: -3600,
    nx: 320, nz: 144, base: -18, height: 320, haze: .11, snowLine: 2.0, ridgeStrength: .16, gullyStrength: .046,
    peaks: [
      [-2460,-2440,180,1480,1380,1.26,.3], [-1530,-2830,270,1700,1600,1.18,1.8],
      [-420,-2660,195,1450,1500,1.24,2.6], [820,-2580,305,1780,1620,1.20,3.4],
      [1880,-3040,205,1480,1380,1.26,5.1],
    ],
    links: [[0,1],[1,2],[2,3],[3,4]],
    glaciers: [],
  },
  {
    name: 'alps-mid-range', seed: 0x715b, x0: -5200, x1: 3600, z0: -3420, z1: -7100,
    nx: 560, nz: 224, base: -42, height: 1120, haze: .19, snowLine: 1.28, ridgeStrength: .13, gullyStrength: .060,
    peaks: [
      [-4100,-5250,560,1450,1680,1.08,.8], [-2870,-5580,670,1320,1650,1.02,2.2],
      [-1650,-6030,580,1280,1580,1.08,4.7], [760,-5770,640,1420,1680,1.02,1.3],
      [2150,-6200,540,1380,1620,1.10,3.1], [3280,-5590,470,1220,1500,1.08,5.4],
    ],
    links: [[0,1],[1,2],[3,4],[4,5]],
    glaciers: [],
  },
  {
    name: 'Aoraki-complete-massif', seed: 0xa04a, x0: -6500, x1: 5100, z0: -6920, z1: -12100,
    nx: 1280, nz: 480, base: -62, height: 3300, haze: .13, snowLine: .41, ridgeStrength: 0, gullyStrength: .065,
    /* One continuous uplifted block. Each entry changes the height and bearing
     * of the same drainage divide; it is not a radial cone and it is not a
     * thin link between summit nodes. Wide overlapping shoulders carry Aoraki
     * into Tasman and the lower Southern Alps, while unequal left/right widths
     * keep the skyline geologically irregular rather than evenly serrated. */
    crestPeaks: [
      [-5200,  940, 1220,1050, 1.38, -120],
      [-4170, 1400, 1120, 980, 1.30,  -40],
      [-3220, 1920, 1100,1050, 1.22,  110],
      [-2240, 2180, 1150,1050, 1.22,   40],
      [-1280, 2540, 1080, 940, 1.22,  -90],
      /* Aoraki is the one decisive pyramidal rise in the divide. R18 still
       * fused three broad central highs into a flat white block, despite this
       * comment claiming otherwise. Narrow the principal summit and lower its
       * neighbours enough that the lake view reads one peak, two shoulders and
       * saddles rather than a single rectangular ice mass. */
      [ -420, 3280,  900, 780, 1.32, -180],
      [  420, 2420,  780, 920, 1.28, -110],
      [ 1260, 1940,  920,1080, 1.28,   80],
      [ 2360, 1900, 1220,1320, 1.30,  170],
      [ 3650, 1370, 1280,1440, 1.38,   40],
      [ 4820,  910, 1180,1050, 1.44,  -70],
    ],
    /* Only four broad secondary divides are needed in the visible face. They
     * are kilometre-scale shoulders between glacier troughs, not repeated
     * knife-edge decorations along the skyline. */
    massifSpurs: [
      [-3330,-9580,-4500,-7280,1810,420,520,980],
      [-1910,-9490,-2660,-7040,2160,340,520,920],
      [ -120,-9370,  870,-7010,2500,390,560,980],
      [ 1510,-9660, 2860,-7310,1850,340,610,1050],
    ],
    /* Headwalls open into broad U-shaped troughs on the lake-facing side.
     * Their unequal bearings and widths make the massif read as one eroded
     * mountain block rather than a row of extruded peaks. */
    cirques: [
      [-2850,-9190,620,460,250],[-1270,-9100,700,500,330],
      [  620,-9200,670,480,290],[ 2220,-9440,720,520,220],
      [ -360,-10140,540,390,190],
    ],
    valleys: [
      [-2860,-9250,-3520,-7040,430,900],
      [-1320,-9160, -760,-6950,510,980],
      [  570,-9260, 1600,-7050,470,930],
      [ 2260,-9500, 3900,-7600,430,840],
      [ -350,-10080,  120,-11800,320,520],
    ],
    peaks: [], links: [],
    glaciers: [
      [-2780,-9210,-3460,-7240,400], [-1270,-9150,-750,-7180,465],
      [  620,-9290, 1520,-7280,420], [ 2240,-9500,3700,-7750,350],
      [ -330,-10100,  90,-11720,290],
    ],
  },
];

function segmentDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return { d: Math.hypot(x - (ax + dx * t), z - (az + dz * t)), t };
}

function smoothMax(a, b, radius) {
  if (b <= 0) return a;
  const h = clamp(.5 + .5 * (a - b) / radius, 0, 1);
  return THREE.MathUtils.lerp(b, a, h) + radius * h * (1 - h);
}

function asymmetricPeak(x, center, leftWidth, rightWidth, power) {
  const width = x < center ? leftWidth : rightWidth;
  const t = clamp(Math.abs(x - center) / width, 0, 1);
  return Math.pow(Math.cos(t * Math.PI * .5), power);
}

function continuousMassif(spec, noise, x, z) {
  let crest = 0, bearing = 0, bearingWeight = 0;
  for (const [cx,height,left,right,power,zOffset] of spec.crestPeaks) {
    /* A summit rises from a shoulder that is considerably wider than the
     * final apex. Keeping both in the same continuous field prevents saddles
     * from collapsing to the range floor between authored high points — the
     * exact failure that made the first replacement look like four separate
     * Gothic spires. */
    const broad = asymmetricPeak(x, cx, left * 1.82, right * 1.82, power * .62);
    const apex = asymmetricPeak(x, cx, left * .76, right * .76, power * 1.18);
    const influence = broad * .82 + apex * .18;
    crest = smoothMax(crest, height * influence, spec.height * .05);
    bearing += zOffset * broad;
    bearingWeight += broad;
  }
  /* Tens-of-metres frost shattering belongs on the summit silhouette, but at
   * one restrained amplitude. It breaks the candle-smooth apex left by the
   * continuous uplift without reinstating the repeated teeth of the discarded
   * ridge graph. */
  crest *= 1 + noise.ridged(x*.0031+17.4,3.7,3,.52)*.026
    + noise.fbm(x*.0067-9.2,8.1,2,.48)*.012;

  /* The divide bends in plan by hundreds of metres, but only at a wavelength
   * broad enough to be tectonic. High-frequency centreline noise was the
   * source of the former comb silhouette and has no place here. */
  const crestZ = -9580 + bearing / Math.max(.2, bearingWeight)
    + noise.fbm(x * .00022 + 9.1, 2.7, 3, .52) * 115;
  const front = z > crestZ;
  const depth = front ? 2460 : 1830;
  const cross = Math.pow(Math.max(0, 1 - Math.abs(z - crestZ) / depth), front ? .72 : .88);
  const rangeFloor = spec.height * .27
    * Math.pow(smoothstep(1, .48, Math.abs(x / (spec.x1 * .92))), .78);
  crest = smoothMax(crest, rangeFloor, spec.height * .045);
  let mass = crest * cross;

  /* Secondary divides are broad convex shoulders. Glacier troughs carved
   * below own the negative space between them; no procedural fan of narrow
   * ridges is stamped around every summit. */
  for (const [ax,az,bx,bz,h0,h1,w0,w1] of spec.massifSpurs) {
    const q = segmentDistance(x,z,ax,az,bx,bz);
    const width = THREE.MathUtils.lerp(w0,w1,q.t);
    const height = THREE.MathUtils.lerp(h0,h1,q.t);
    const shoulder = height * Math.pow(Math.max(0,1-q.d/width), .92);
    mass = smoothMax(mass,shoulder,spec.height*.028);
  }

  /* Very low-frequency differential erosion breaks broad faces without
   * changing the authored skyline. Geometry at tens of metres comes later;
   * putting it into the divide itself produces kilometre-tall needles. */
  const weather = .94 + .06 * noise.fbm(x*.00078+31,z*.00072-17,4,.54);
  return mass * weather;
}

function mountainMass(spec, noise, x, z) {
  /* Warp only the plan of the mountain. Peaks stay on their authored bearing,
   * but drainage divides stop being mathematically radial. */
  const wx = x + noise.fbm(x * .00037, z * .00037, 3, .52) * 170;
  const wz = z + noise.fbm(x * .00041 + 19, z * .00041 - 7, 3, .52) * 145;
  let mass = 0;
  let gullies = 0;
  if (spec.crestPeaks) return { mass: continuousMassif(spec,noise,wx,wz), gullies };
  for (const [px,pz,ph,rx,rz,sharp,phase] of spec.peaks) {
    const dx = (wx - px) / rx, dz = (wz - pz) / rz;
    const r = Math.hypot(dx, dz);
    const cone = ph * Math.pow(Math.max(0, 1 - r), sharp);
    mass = smoothMax(mass, cone, spec.height * .018);

    /* Five unequal tributary ridges descend from each summit. They are narrow
     * near the peak, broaden downhill and terminate above the apron instead of
     * continuing as the parallel folds a sine function would make. */
    for (let k = 0; k < 5; k++) {
      const a = phase + k * 1.257 + .22 * Math.sin(phase * 2.3 + k * 3.7);
      const len = (k & 1 ? .92 : 1.24) * Math.min(rx, rz);
      const ex = px + Math.cos(a) * len;
      const ez = pz + Math.sin(a) * len * 1.25;
      const q = segmentDistance(wx, wz, px, pz, ex, ez);
      const width = 72 + q.t * 190;
      const ridge = ph * spec.ridgeStrength * (1 - q.t * .68)
        * Math.pow(Math.max(0, 1 - q.d / width), 1.7);
      mass = smoothMax(mass, ridge, spec.height * .014);
    }

    if (r > .16 && r < .98) {
      const angle = Math.atan2(dz, dx);
      const channel = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(angle * 7 + phase + r * 5.2)) / .34), 3.5);
      gullies = Math.max(gullies, channel * smoothstep(.18, .72, r) * (1 - smoothstep(.82, 1, r)) * ph);
    }
  }

  /* A range is one folded block, not a collection of volcanoes. Only authored
   * links receive a saddle: automatically linking every nearby peak produced
   * a straight wall across the central valley and was rejected in the fixed
   * wide view. Each linked group still owns tributary ridges above. */
  for (const [a,b] of spec.links) {
    const pa = spec.peaks[a], pb = spec.peaks[b];
    const q = segmentDistance(wx, wz, pa[0], pa[1], pb[0], pb[1]);
    if (q.t <= 0 || q.t >= 1) continue;
    const width = THREE.MathUtils.lerp(Math.min(pa[3],pa[4]), Math.min(pb[3],pb[4]), q.t) * .48;
    const saddle = THREE.MathUtils.lerp(pa[2], pb[2], q.t) * (.42 + .10 * Math.sin(q.t * Math.PI));
    const divide = saddle * Math.pow(Math.max(0, 1 - q.d / width), 1.42);
    mass = smoothMax(mass, divide, spec.height * .018);
  }
  return { mass, gullies };
}

function glacialCuts(spec, x, z) {
  let cut = 0;
  const scale = spec.crestPeaks ? .64 : 1;
  for (const [ax,az,bx,bz,w0,w1] of spec.valleys || []) {
    const q = segmentDistance(x,z,ax,az,bx,bz);
    const width = THREE.MathUtils.lerp(w0,w1,q.t);
    /* Flat-bottomed U section, steep walls, and increasing incision toward the
     * cirque. It ends softly at both ends instead of scoring the whole mesh. */
    const cross = 1 - smoothstep(.34, 1, q.d/width);
    cut = Math.max(cut, cross * smoothstep(0,.14,q.t) * (1-smoothstep(.93,1,q.t)) * (170 + 240*(1-q.t)) * scale);
  }
  for (const [cx,cz,rx,rz,depth] of spec.cirques || []) {
    const r = Math.hypot((x-cx)/rx,(z-cz)/rz);
    cut = Math.max(cut, depth * (1-smoothstep(.34,1,r)) * scale);
  }
  return cut;
}

function iceBody(spec, x, z) {
  let lift = 0;
  for (const [ax,az,bx,bz,width] of spec.glaciers) {
    const q = segmentDistance(x,z,ax,az,bx,bz);
    const core = Math.pow(Math.max(0,1-q.d/width), .55);
    const ends = smoothstep(.03,.13,q.t) * (1-smoothstep(.88,.98,q.t));
    /* Convex ice thickness and compressed transverse serac steps. The steps
     * become tighter through the middle icefall and are actual relief, so
     * directional light describes flow even before the blue-ice material. */
    const compression = Math.exp(-(((q.t-.43)/.22)**2));
    const seracs = Math.max(0, Math.sin(q.t*76 + q.d*.018)) * compression * 9;
    lift = Math.max(lift, (18 + 24*compression + seracs) * core * ends);
  }
  return lift;
}

function buildHeights(spec) {
  const noise = new Noise2D(spec.seed);
  const w = spec.nx + 1, h = spec.nz + 1;
  const smooth = new Float32Array(w * h);
  const final = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const v = j / spec.nz;
    const z = THREE.MathUtils.lerp(spec.z0, spec.z1, v);
    for (let i = 0; i < w; i++) {
      const u = i / spec.nx;
      const x = THREE.MathUtils.lerp(spec.x0, spec.x1, u);
      const edge = smoothstep(0, .055, u) * (1 - smoothstep(.945, 1, u))
        * smoothstep(0, .08, v) * (1 - smoothstep(.94, 1, v));
      const { mass, gullies } = mountainMass(spec, noise, x, z);
      const floor = spec.base + 34 * noise.fbm(x * .0007, z * .0007, 3, .48);
      const broad = noise.fbm(x * .00125, z * .00118, 4, .54) * spec.height * .037;
      /* A low continuous apron carries the range into its foreland. Without
       * this, every peak reached zero on its own ellipse and looked planted on
       * a plane even though the mesh itself was two-dimensional. */
      const apron = spec.height * .075 * edge
        * (0.55 + .45 * noise.ridged(x * .00062, z * .00058, 3, .5));
      const iceCut = glacialCuts(spec, x, z);
      const s = floor + (Math.max(0, mass + broad - iceCut) + apron) * edge;
      const rock = (
        noise.ridged(x * .0023, z * .0020, 5, .55) * .62
        + noise.fbm(x * .0048 + 31, z * .0041 - 17, 3, .5) * .38
      ) * spec.height * .055
        * Math.pow(clamp(mass / spec.height, 0, 1), .55);
      const channel = gullies * spec.gullyStrength * edge;
      const drainage = spec.crestPeaks
        ? Math.pow(Math.max(0,-noise.ridged(x*.0042+z*.00031,z*.00068-13,4,.55)),1.7)
          * spec.height*.055*Math.pow(clamp(mass/spec.height,0,1),.72)
        : 0;
      /* Rock breaks parallel to bedding on faces and at a second oblique scale;
       * amplitude tracks relief, so telephoto detail reads as slabs rather than
       * kilometre-sized triangles or uniform shader freckles. */
      const n = Math.max(floor, s + rock - channel - drainage + iceBody(spec,x,z));
      const at = j * w + i;
      smooth[at] = s;
      final[at] = n;
    }
  }

  /* Two light thermal-relaxation passes move only material above the talus
   * angle. This removes needle-like noise without blurring the authored
   * divides; the displaced material is what becomes the scree mask below. */
  const tmp = new Float32Array(final.length);
  for (let pass = 0; pass < 1; pass++) {
    tmp.set(final);
    for (let j = 1; j < spec.nz; j++) for (let i = 1; i < spec.nx; i++) {
      const at = j * w + i;
      const avg = (final[at-1] + final[at+1] + final[at-w] + final[at+w]) * .25;
      const delta = avg - final[at];
      if (Math.abs(delta) > spec.height * .008) tmp[at] += delta * .08;
    }
    final.set(tmp);
  }
  return { smooth, final };
}

function gridNormals(heights, spec) {
  const w = spec.nx + 1, h = spec.nz + 1;
  const dx = (spec.x1 - spec.x0) / spec.nx;
  const dz = (spec.z1 - spec.z0) / spec.nz;
  const out = new Float32Array(w * h * 3);
  const n = new THREE.Vector3();
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const il = Math.max(0, i - 1), ir = Math.min(spec.nx, i + 1);
    const jd = Math.max(0, j - 1), ju = Math.min(spec.nz, j + 1);
    const dhx = (heights[j*w+ir] - heights[j*w+il]) / ((ir - il) * dx);
    const dhz = (heights[ju*w+i] - heights[jd*w+i]) / ((ju - jd) * dz);
    n.set(-dhx, 1, -dhz).normalize().toArray(out, (j*w+i)*3);
  }
  return out;
}

function glacierAt(spec, x, z, altitude, ny) {
  let value = 0;
  for (const [ax,az,bx,bz,width] of spec.glaciers) {
    const q = segmentDistance(x, z, ax, az, bx, bz);
    const trough = Math.exp(-((q.d / width) ** 2) * 3.2) * smoothstep(.08, .92, q.t);
    value = Math.max(value, trough);
  }
  return value * smoothstep(spec.height * .28, spec.height * .62, altitude) * smoothstep(.16, .72, ny);
}

function blurField(field, nx, nz, passes = 2) {
  const w = nx + 1;
  const tmp = new Float32Array(field.length);
  for (let pass = 0; pass < passes; pass++) {
    tmp.set(field);
    for (let j = 1; j < nz; j++) for (let i = 1; i < nx; i++) {
      const at = j * w + i;
      tmp[at] = (field[at] * 4 + field[at-1] + field[at+1] + field[at-w] + field[at+w]) / 8;
    }
    field.set(tmp);
  }
}

function mountainGeometry(spec) {
  const { smooth, final } = buildHeights(spec);
  const smoothN = gridNormals(smooth, spec);
  const finalN = gridNormals(final, spec);
  const w = spec.nx + 1, h = spec.nz + 1;
  const pos = new Float32Array(w * h * 3);
  const snow = new Float32Array(w * h);
  const talus = new Float32Array(w * h);
  const glacier = new Float32Array(w * h);
  const cavity = new Float32Array(w * h);
  const index = [];
  const noise = new Noise2D(spec.seed ^ 0x5ac31);
  for (let j = 0; j < h; j++) {
    const z = THREE.MathUtils.lerp(spec.z0, spec.z1, j / spec.nz);
    for (let i = 0; i < w; i++) {
      const x = THREE.MathUtils.lerp(spec.x0, spec.x1, i / spec.nx);
      const at = j * w + i, y = final[at], altitude = y - spec.base;
      pos[at*3] = x; pos[at*3+1] = y; pos[at*3+2] = z;
      const nx = finalN[at*3], ny = finalN[at*3+1], nz = finalN[at*3+2];
      const concavity = clamp(((final[Math.max(0,j-1)*w+i] + final[Math.min(spec.nz,j+1)*w+i]
        + final[j*w+Math.max(0,i-1)] + final[j*w+Math.min(spec.nx,i+1)]) * .25 - y) / (spec.height * .012), -1, 1);
      const exposure = nx * .22 - nz * .18;
      const breakup = (noise.fbm(x * .0031, z * .0031, 4, .56) * .62
        + noise.ridged(x * .0074, z * .0068, 3, .53) * .38) * spec.height * .085;
      const snowHeight = altitude + breakup + Math.max(0, concavity) * spec.height * .09 + exposure * spec.height * .045;
      const accumulation = .18 + .82 * smoothstep(.10, .64, ny);
      snow[at] = clamp(smoothstep(spec.height * spec.snowLine, spec.height * (spec.snowLine + .17), snowHeight) * accumulation, 0, 1);
      talus[at] = clamp(smoothstep(.18, .68, 1 - ny) * (1 - smoothstep(spec.height * .64, spec.height * .88, altitude)) * (.62 + .38 * noise.ridged(x*.006,z*.006,3,.5)), 0, 1);
      glacier[at] = glacierAt(spec, x, z, altitude, ny);
      cavity[at] = smoothstep(.03, .62, concavity);
    }
  }
  /* These are material fields, not geometry. A one-vertex snow or talus value
   * interpolates as a bright triangle at kilometre distance; smoothing the
   * classification over roughly one hundred metres gives an accumulation band
   * while leaving the real geometric ridge underneath sharp. */
  blurField(snow, spec.nx, spec.nz, 2);
  blurField(talus, spec.nx, spec.nz, 2);
  blurField(glacier, spec.nx, spec.nz, 2);
  blurField(cavity, spec.nx, spec.nz, 1);
  for (let j = 0; j < spec.nz; j++) for (let i = 0; i < spec.nx; i++) {
    const a = j*w+i, b = a+w;
    if ((i + j) & 1) index.push(a,b,a+1,a+1,b,b+1);
    else index.push(a,b,b+1,a,b+1,a+1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(finalN, 3));
  g.setAttribute('aSmoothY', new THREE.BufferAttribute(smooth, 1));
  g.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smoothN, 3));
  g.setAttribute('aSnow', new THREE.BufferAttribute(snow, 1));
  g.setAttribute('aTalus', new THREE.BufferAttribute(talus, 1));
  g.setAttribute('aGlacier', new THREE.BufferAttribute(glacier, 1));
  g.setAttribute('aCavity', new THREE.BufferAttribute(cavity, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

function mountainMaterial(spec, layer) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .96, metalness: 0, fog: false,
  });
  const U = {
    uSnow: { value: 1 }, uErosion: { value: 1 }, uHazeEnabled: { value: 1 },
    uHaze: { value: spec.haze }, uHazeColor: { value: HAZE.clone() },
    uLayer: { value: layer },
  };
  mat.userData.uniforms = U;
  mat.customProgramCacheKey = () => 'lake-mountain-terrain-v3';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    mat.userData.shader = sh;
    sh.vertexShader = `
      attribute float aSmoothY, aSnow, aTalus, aGlacier, aCavity;
      attribute vec3 aSmoothNormal;
      uniform float uErosion;
      varying vec3 vMPos, vMNrm;
      varying float vSnow, vTalus, vGlacier, vCavity;
    ` + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       objectNormal = normalize(mix(aSmoothNormal, objectNormal, uErosion));`
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.y = mix(aSmoothY, transformed.y, uErosion);
       vMPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vMNrm = normalize(mat3(modelMatrix) * objectNormal);
       vSnow = aSnow; vTalus = aTalus; vGlacier = aGlacier; vCavity = aCavity;`
    );
    sh.fragmentShader = `
      uniform float uSnow, uHazeEnabled, uHaze, uLayer;
      uniform vec3 uHazeColor;
      varying vec3 vMPos, vMNrm;
      varying float vSnow, vTalus, vGlacier, vCavity;
      float mh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float mn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(mh(i),mh(i+vec2(1,0)),f.x),mix(mh(i+vec2(0,1)),mh(i+vec2(1,1)),f.x),f.y); }
      float mf(vec2 p){ float s=0.0,a=.5; for(int i=0;i<4;i++){s+=mn(p)*a;p=p*2.03+17.1;a*=.5;}return s;}
    ` + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `
       vec3 triW = pow(abs(normalize(vMNrm)), vec3(4.0));
       triW /= max(.001, triW.x + triW.y + triW.z);
       float coarse = mf(vMPos.yz * .0021 + uLayer * 11.7) * triW.x
         + mf(vMPos.xz * .0021 + uLayer * 11.7) * triW.y
         + mf(vMPos.xy * .0021 + uLayer * 11.7) * triW.z;
       float fine = mf(vMPos.yz * .0083 - uLayer * 7.3) * triW.x
         + mf(vMPos.xz * .0083 - uLayer * 7.3) * triW.y
         + mf(vMPos.xy * .0083 - uLayer * 7.3) * triW.z;
       float fractureNoise = mn(vMPos.yz*.011 + coarse*3.0) * triW.x
         + mn(vMPos.xz*.011 + coarse*3.0) * triW.y
         + mn(vMPos.xy*.011 + coarse*3.0) * triW.z;
       float fracture = smoothstep(.67, .91, abs(fractureNoise*2.0-1.0));
       /* Green foreland and cold alpine face are two parts of one depth stack.
        * The first two ranges are rounded, rain-fed foothills; exposed greywacke
        * takes over only with altitude, slope and distance toward Aoraki. */
       vec3 alpineRock = mix(vec3(.13,.14,.16), vec3(.48,.48,.46), coarse);
       /* Lower ranges. Greywacke under a thin dry skin of tussock and lichen,
        * so the warm cast is the grass, not the stone. The previous pair was
        * green-dominant on both ends, which put a fertilised-pasture hue on
        * every foothill in the frame. */
       vec3 lowerRock = mix(vec3(.072,.082,.058), vec3(.26,.27,.19), coarse);
       vec3 rock = mix(lowerRock, alpineRock, smoothstep(1.25,1.85,uLayer));
       rock *= mix(.68, 1.22, coarse * .55 + fine * .45);
       float fractureDepth=mix(.18,.45,smoothstep(.75,1.85,uLayer));
       rock = mix(rock, vec3(.07,.08,.10), fracture * fractureDepth);
       vec3 scree = mix(vec3(.20,.21,.20), vec3(.50,.46,.38), coarse);
       vec3 surf = mix(rock, scree, vTalus * .62);
       surf *= 1.0 - vCavity * .27;
       float meadowLayer=1.0-smoothstep(.18,1.72,uLayer);
       float meadowSlope=smoothstep(.18,.70,vMNrm.y);
       float meadowHeight=1.0-smoothstep(380.0,1080.0,vMPos.y);
       float meadowMask=clamp(meadowLayer*meadowSlope*mix(.58,1.0,meadowHeight),0.0,1.0);
       /* The foreland cover, and it has to be the same biome as the ground the
        * player is standing on or the level has a colour horizon in it.
        *
        * These hills were authored green — (.040,.105,.028) to (.135,.235,.055)
        * — on the same assumption the ground scan made, that a temperate
        * mountain valley is pasture. The Mackenzie is a rain shadow: the
        * ranges on this side of the divide carry dry short tussock over
        * greywacke and read tawny-olive at distance, going greyer as aerial
        * perspective takes the saturation out of them.
        *
        * Matching the basin's own tussock chromaticity matters more here than
        * getting either one exactly right in isolation. A viewer cannot judge
        * the absolute colour of a hill eight kilometres away, and will
        * instantly see a seam where a tawny foreground meets a green
        * middle distance. */
       vec3 meadow=mix(vec3(.036,.058,.024),vec3(.128,.186,.078),coarse*.62+fine*.38);
       meadow*=mix(.82,1.08,coarse);
       /* Damp gullies and shaded faces keep some green even here — it is what
        * stops the range reading as a single flat wash of ochre. */
       /* Dry crowns keep the gold, so the range is not one flat green either. */
       meadow=mix(meadow, meadow*vec3(1.28,1.02,.62), smoothstep(.58,.96,coarse)*.40);
       surf=mix(surf,meadow,meadowMask);
       /* Accumulation follows gullies and protected faces, while exposed ribs
        * stay dark. R18's .34 minimum coverage made every summit face white and
        * turned the five authored glaciers into ruler-straight vertical paint.
        * Two oblique fields break that height mask into snowfields without
        * changing the geometric ridges underneath. */
       float snowFlow=mf(vec2((vMPos.x+vMPos.z*.27)*.0037,vMPos.y*.00072)+fine*1.7);
       float snowCross=mf(vec2((vMPos.x-vMPos.z*.41)*.0022,vMPos.y*.00115)-coarse*1.3);
       float snowBreak = smoothstep(.36, .62, snowFlow*.62+snowCross*.38+vCavity*.28);
       float outcrop = smoothstep(.30, .67, 1.0-vMNrm.y + fracture*.42);
       float snowCover = smoothstep(.36,.58,vSnow);
       float windScour=smoothstep(-.35,.48,dot(normalize(vMNrm.xz+vec2(.001)),normalize(vec2(.84,.54))));
       float snowMask = clamp(snowCover * mix(.52,1.0,snowBreak)
         * (1.0-outcrop*.38) * mix(.58,1.0,windScour) * uSnow, 0.0, 1.0);
       vec3 snowColor = mix(vec3(.68,.79,.88), vec3(.96,.97,.95), .56 + fine*.38);
       surf = mix(surf, snowColor, snowMask);
       vec3 ice = mix(vec3(.55,.70,.78), vec3(.90,.94,.95), fine);
       float glacierMask=vGlacier*uSnow*mix(.32,.62,snowBreak)*(1.0-outcrop*.42)*smoothstep(.04,.30,vCavity);
       surf = mix(surf, ice, glacierMask);
       diffuseColor.rgb *= surf;
      `
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = mix(roughness, .76, clamp(vSnow*uSnow + vGlacier*uSnow, 0.0, 1.0));`
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
       vec3 dpdx=dFdx(vMPos),dpdy=dFdy(vMPos),nW=normalize(vMNrm);
       float relief=coarse*.74+fine*.26-fracture*.18;
       float dhdx=dFdx(relief),dhdy=dFdy(relief);
       vec3 r1=cross(dpdy,nW),r2=cross(nW,dpdx);
       float det=dot(dpdx,r1);
       vec3 grad=(det<0.0?-1.0:1.0)*(dhdx*r1+dhdy*r2);
       float bumpStrength=mix(14.0,38.0,smoothstep(.55,1.8,uLayer));
       nW=normalize(abs(det)*nW-grad*bumpStrength);
       normal=normalize(mat3(viewMatrix)*nW);
      `
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      `/* Preserve summit contrast: full flat haze was washing Aoraki into the
          * sky and removing the only long-distance modelling cue. */
       float h = uHaze * uHazeEnabled * mix(.55,1.0,smoothstep(.0,1.8,uLayer));
       gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, h);
       #include <tonemapping_fragment>`
    );
  };
  return mat;
}

/* How far up the valley the ranges have to be pushed.
 *
 * The RANGES table below is authored in absolute metres and its nearest layer,
 * the foothills, starts at z = -1150. That was comfortably beyond the head of a
 * basin that ended at -660. The valley now runs to -1990, so the road drives
 * 840 m *inside* the first range: the frames from the top of the stage came
 * back with the sky replaced by a wall of olive, which is the underside of a
 * mountain seen from within it.
 *
 * The whole backdrop is translated rather than re-authoring forty peak
 * positions. It is a backdrop — its internal arrangement is the composition and
 * its absolute position is not, so long as it stays beyond the ground the
 * player can reach and keeps the same bearing from the road.
 */
const BACKDROP_Z = -780;

export class LakeDistance {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'lake-distance-southern-alps';
    this.root.position.z = BACKDROP_Z;
    this.materials = [];
    this.meshes = RANGES.map((spec, i) => {
      const material = mountainMaterial(spec, i);
      const mesh = new THREE.Mesh(mountainGeometry(spec), material);
      mesh.name = spec.name;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = -3 + i;
      this.materials.push(material);
      this.root.add(mesh);
      return mesh;
    });
  }

  setDebug(mode = 'none') {
    for (const mat of this.materials) {
      const u = mat.userData.uniforms;
      u.uSnow.value = mode === 'snow' ? 0 : 1;
      u.uErosion.value = mode === 'erosion' ? 0 : 1;
      u.uHazeEnabled.value = mode === 'haze' ? 0 : 1;
    }
  }

  setTier(tier) { this.meshes[0].visible = tier !== 'low'; }

  stats() {
    return {
      ridges: this.meshes.filter(x => x.visible).length,
      aoraki: true,
      representation: 'three complete eroded heightfields',
      triangles: this.meshes.reduce((n, m) => n + (m.geometry.index?.count || 0) / 3, 0),
    };
  }

  dispose() {
    this.meshes.forEach(m => m.geometry.dispose());
    this.materials.forEach(m => m.dispose());
  }
}
