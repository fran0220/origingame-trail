/* Fumaroles: the steam that says the mountain is still alive.
 *
 * The frame-share audit on this level came back with skyline 11.2%, lakes
 * 0.11%, poles 0.06% — and nothing else, because there is nothing else. Every
 * object in it is static rock. The lake level has water, wind in the tussock,
 * sheep and a car; the jungle has a canopy that moves and birds in it. This
 * had not one thing that changed between two frames.
 *
 * Steam fixes that and it is not decoration: Red Crater vents continuously and
 * the Ketetahi side of the mountain is one of the most active geothermal
 * fields in the country. It is also the only soft edge in a level made
 * entirely of hard ones, and white against red scoria is the strongest
 * contrast available here.
 *
 * HOW IT IS BUILT. Camera-facing quads on a fixed pool, rising and expanding
 * and fading, recycled from the bottom. Not a volumetric — the level already
 * has an atmosphere pass doing volumetrics for the sun, and a second one for
 * a dozen vents would cost far more than it returns at this scale.
 *
 * The behaviour that matters is not the rising. It is the LEAN: steam off a
 * vent goes straight up for a metre or two and then the wind takes it, and on
 * this saddle the wind never stops. A plume that rises vertically reads as a
 * smoke machine; one that stands up and then bends over reads as weather.
 */
import * as THREE from 'three';
import { Noise2D, clamp, smoothstep } from '../../world/noise.js';
import { STAGES } from './route.js';

/* Where the ground is venting. Two clusters, because that is how a fumarole
 * field works — they follow a fracture, they do not scatter. */
const VENTS = [
  { t: 0.700, off:  -6, n: 5, scale: 1.05 },   // the Red Crater rim
  { t: 0.742, off:   9, n: 4, scale: 0.90 },
  { t: 0.768, off:  -4, n: 4, scale: 1.20 },   // just below the high point
  { t: 0.905, off:  16, n: 3, scale: 0.75 },   // above the Blue Lake
];

const PER_VENT = 26;

export class Fumaroles {
  constructor(terrain, trail, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'tongariro-fumaroles';
    this.materials = [];
    this.time = 0;

    const dense = tier === 'low' ? 0.5 : 1;
    const n = new Noise2D(0x5eaa);
    const P = new THREE.Vector3(), T = new THREE.Vector3();

    /* Every puff is one quad; all of them live in one buffer and one draw. */
    this.puffs = [];
    const sites = [];
    for (const v of VENTS) {
      trail.pointAt(v.t, P); trail.tangentAt(v.t, T);
      const nx = T.z, nz = -T.x;
      for (let i = 0; i < Math.max(1, Math.round(v.n * dense)); i++) {
        const a = (i / v.n) * 6.283;
        const jx = Math.cos(a) * (1.4 + i * 0.9), jz = Math.sin(a) * (1.4 + i * 0.9);
        const x = P.x + nx * v.off + jx, z = P.z + nz * v.off + jz;
        sites.push({ x, y: terrain.height(x, z), z, scale: v.scale * (0.8 + 0.4 * (i % 3) / 2) });
      }
    }

    const N = sites.length * PER_VENT;
    const pos = new Float32Array(N * 4 * 3);
    const uv = new Float32Array(N * 4 * 2);
    const alpha = new Float32Array(N * 4);
    const idx = new Uint32Array(N * 6);
    for (let q = 0; q < N; q++) {
      const v = q * 4, i = q * 6;
      idx[i] = v; idx[i+1] = v+1; idx[i+2] = v+2;
      idx[i+3] = v; idx[i+4] = v+2; idx[i+5] = v+3;
      uv[v*2+0]=0; uv[v*2+1]=0; uv[v*2+2]=1; uv[v*2+3]=0;
      uv[v*2+4]=1; uv[v*2+5]=1; uv[v*2+6]=0; uv[v*2+7]=1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 200, -1200), 4000);
    this.geometry = geo;

    for (let s = 0; s < sites.length; s++) {
      for (let k = 0; k < PER_VENT; k++) {
        this.puffs.push({
          site: sites[s],
          /* Staggered so a vent is a continuous column from the first frame
           * rather than coughing all of its puffs out together. */
          age: (k / PER_VENT) * 6.0 + Math.random() * 0.4,
          life: 5.2 + (k % 5) * 0.5,
          drift: 0.7 + (k % 7) * 0.12,
          seed: k * 0.37 + s * 1.13,
        });
      }
    }

    const mat = new THREE.ShaderMaterial({
      name: 'fumarole',
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColour: { value: new THREE.Color(0xe8eef2) },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: `
        attribute float aAlpha;
        varying vec2 vUv;
        varying float vA;
        void main(){
          vUv = uv; vA = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColour;
        varying vec2 vUv;
        varying float vA;
        void main(){
          /* A soft round puff, not a square. The falloff is squared so the
           * edge is genuinely soft — a linear one still shows a disc. */
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          float a = 1.0 - clamp(r, 0.0, 1.0);
          a *= a;
          if (a * vA < 0.004) discard;
          gl_FragColor = vec4(uColour, a * vA);
        }`,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'fumarole:steam';
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.castShadow = false; mesh.receiveShadow = false;
    this.root.add(mesh);
    this.mesh = mesh;
    this.noise = n;
    this.counts = { vents: sites.length, puffs: this.puffs.length };
  }

  update(dt, camera) {
    if (!camera) return;
    this.time += dt;
    const pos = this.geometry.getAttribute('position');
    const al = this.geometry.getAttribute('aAlpha');

    /* Billboard basis from the camera, computed once for all of them. */
    const e = camera.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2];
    const ux = e[4], uy = e[5], uz = e[6];

    for (let i = 0; i < this.puffs.length; i++) {
      const pf = this.puffs[i];
      pf.age += dt;
      if (pf.age > pf.life) pf.age -= pf.life;
      const u = pf.age / pf.life;

      /* Rise, and slow as it goes: a plume decelerates because it is mixing
       * with air that is not going anywhere. */
      /* TALLER, SO IT CLEARS THE RIDGE. At 13 m the columns only appeared once
       * the walker was on top of the vent — every station approaching the
       * crest measured zero, because the crest was in front of them. A plume
       * that cannot be seen before you arrive is not a landmark, and on the
       * mountain the Red Crater steam is visible from the far side of South
       * Crater. 26 m is still modest for a fumarole. */
      const rise = (1 - Math.exp(-u * 2.6)) * 26.0 * pf.site.scale;
      /* THE LEAN. Vertical for the first metre or so, then the wind has it.
       * This is the whole difference between steam and a smoke machine. */
      const bend = smoothstep(0.06, 0.85, u);
      const wob = this.noise.n(pf.seed + this.time * 0.28, u * 2.4) * 2.2;
      const dx = (pf.drift * 9.0 * bend + wob) * pf.site.scale;
      const dz = (pf.drift * 3.2 * bend + wob * 0.4) * pf.site.scale;

      const cx = pf.site.x + dx;
      const cy = pf.site.y + 0.3 + rise;
      const cz = pf.site.z + dz;
      /* Expands as it rises — a puff entrains air and grows, and a plume of
       * constant-size sprites reads as a string of beads. */
      /* A COLUMN, NOT A CLOUD. At 0.9 growing to 7.1 m the puffs from sixteen
       * vents merged into one bank filling the sky, which is a fog machine
       * rather than a fumarole. A real vent is a thin column for its first ten
       * metres and only spreads once the wind has pulled it apart, so growth
       * is slow at the base and only opens up near the top. */
      /* Between the two failures. At 0.9 + 6.2u sixteen vents merged into a
       * bank across the sky (26% of frame, and wrong); at 0.55 + 3.1u^2 it
       * came to a wisp (0.8%, and invisible). A vent is a tight column at the
       * base that opens out downwind, so the growth stays quadratic — that is
       * what keeps the base narrow — and the coefficient goes back up. */
      const size = (0.75 + u * u * 5.0) * pf.site.scale;
      /* Fade in fast, out slow. */
      const a = smoothstep(0, 0.10, u) * (1 - smoothstep(0.42, 1.0, u)) * 0.40;

      const v = i * 4;
      const sxr = rx * size, syr = ry * size, szr = rz * size;
      const sxu = ux * size, syu = uy * size, szu = uz * size;
      pos.setXYZ(v,     cx - sxr - sxu, cy - syr - syu, cz - szr - szu);
      pos.setXYZ(v + 1, cx + sxr - sxu, cy + syr - syu, cz + szr - szu);
      pos.setXYZ(v + 2, cx + sxr + sxu, cy + syr + syu, cz + szr + szu);
      pos.setXYZ(v + 3, cx - sxr + sxu, cy - syr + syu, cz - szr + szu);
      for (let k = 0; k < 4; k++) al.setX(v + k, a);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
  }

  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
