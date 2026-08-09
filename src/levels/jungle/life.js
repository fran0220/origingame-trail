/* What lives in the forest, and what floats in its air.
 *
 * The jungle is the denser and better-looking of the two levels and it has one
 * thing badly wrong with it: NOTHING IN IT MOVES. Every leaf, every buttress
 * root, every stone of the ruins is exactly where it was when the level was
 * built, and a rainforest is the loudest, busiest place on earth. A still one
 * reads as a diorama no matter how good the geometry is, and no amount of
 * further detail fixes that — detail is not the same as life.
 *
 * Two systems, both anchored to the camera so their cost does not depend on
 * how big the level is.
 *
 *   MOTES. The level already throws god rays through the canopy gaps, and the
 *   reason a real shaft of light is visible at all is that there is dust and
 *   spore and insect in it. Rendering the shaft without the things that make
 *   it is the wrong way round. These are the single cheapest source of life in
 *   the frame: a few thousand points, drifting, brightest where the light is.
 *
 *   BUTTERFLIES. Motes give the air life but they have no intent. A butterfly
 *   has a destination and keeps failing to fly to it in a straight line, and
 *   that reads as an animal in a way that no amount of drift does. They are
 *   also the one legitimate excuse for saturated colour in a scene that is
 *   otherwise ninety percent olive.
 */
import * as THREE from 'three';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* The box the motes live in. They wrap around the camera inside it, so the
 * player is always in the middle of a populated volume and there is never a
 * far edge to the swarm.
 *
 * Its SIZE is the density control, and that is not obvious. The mote count is
 * fixed, so halving the cell edge puts eight times as many motes per cubic
 * metre in front of the camera for exactly the same cost. The first version
 * used a 34 m cell and put 0.023% of the frame's pixels on screen — about
 * fifty visible motes, each so bright it had to be near white to register at
 * all. A 20 m cell is worth a five-fold density increase for free, and lets
 * every mote be dimmer.
 *
 * The far fade must finish INSIDE the half-edge, or motes wrap in and out of
 * existence at full brightness at the cell boundary. */
const CELL = 20;

const MOTE_VERT = `
  uniform float uTime;
  uniform vec3  uCam;
  uniform float uPixelScale;
  attribute float aPhase;
  attribute float aSize;
  attribute float aRate;
  varying float vFade;
  varying float vSpark;

  void main() {
    vec3 p = position;

    /* Drift. Real dust in still forest air falls very slowly and is pushed
     * sideways far more than it is pushed down, because the only air movement
     * under a closed canopy is convection off the warm floor. */
    p.y -= mod(uTime * 0.09 * aRate, CELL_F);
    p.x += sin(uTime * 0.13 * aRate + aPhase) * 0.55;
    p.z += cos(uTime * 0.11 * aRate + aPhase * 1.7) * 0.55;

    /* Wrap into the cell centred on the camera. This is what makes the cost
     * fixed: the same 3000 points are reused everywhere in the level. */
    vec3 rel = p - uCam;
    rel = mod(rel + CELL_F * 0.5, CELL_F) - CELL_F * 0.5;
    vec3 world = uCam + rel;

    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    float dist = -mv.z;

    /* Fade at both ends, and the NEAR end matters far more. A mote one metre
     * from the eye covers a large solid angle, and at that size the eye reads
     * it as a smear on the lens rather than as something in the world. They
     * have to be fully gone before they are close enough to resolve. */
    vFade = smoothstep(0.35, 1.10, dist) * (1.0 - smoothstep(5.5, 9.2, dist));

    /* Brightest in the shafts. There is no way to sample the actual light here,
     * so this approximates it: motes catch the light in patches, and the patch
     * pattern drifts slowly so a mote twinkles as it crosses one. */
    float band = sin(world.x * 0.17 + world.z * 0.13 + uTime * 0.05) * 0.6 +
                 sin(world.y * 0.31 - uTime * 0.07) * 0.4;
    vSpark = 0.40 + 0.60 * smoothstep(-0.35, 0.75, band) *
             (0.55 + 0.45 * sin(uTime * 2.7 * aRate + aPhase * 3.1));

    gl_Position = projectionMatrix * mv;
    /* Sized as a real object, not as a screen decoration. A spore or a small
     * fly is a couple of millimetres across; at a 60-degree vertical field
     * that subtends about one pixel per metre of range on a 720-line frame.
     * The first version of this used a constant of 300 and put beach balls in
     * the forest; the correction to 3 was geometrically honest and made them
     * disappear entirely, because a mote is only visible at all when it is
     * ABOVE its true angular size — that is what "catching the light" means.
     * 15 is the measured value: the number at which motes occupy about a third
     * of a percent of the frame, which is where they read as air rather than
     * as either snow or nothing. The clamp keeps a distant one from collapsing
     * to a sub-pixel flicker, which reads as noise. */
    gl_PointSize = clamp(aSize * uPixelScale / max(dist, 1.0), 1.2, 4.5);
  }
`.replace(/CELL_F/g, CELL.toFixed(1));

const MOTE_FRAG = `
  precision mediump float;
  uniform vec3 uColor;
  varying float vFade;
  varying float vSpark;
  void main() {
    /* A round, soft point. A square mote is instantly readable as a bug in the
     * renderer rather than a bug in the air. */
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float a = (1.0 - r * 4.0);
    gl_FragColor = vec4(uColor * vSpark, a * a * vFade * vSpark * 0.20);
  }
`;

/* Wings, as four triangles, with the side written into an attribute so the
 * vertex shader can flap them without any per-frame geometry work. */
function butterflyGeometry() {
  const pos = [], col = [], wing = [], idx = [];
  const push = (x, y, z, c, w) => {
    const n = pos.length / 3; pos.push(x, y, z); col.push(...c); wing.push(w); return n;
  };
  /* Body: a dark sliver. It is three pixels long and exists only so the two
   * wings are not joined to nothing. */
  const dark = [0.030, 0.026, 0.022];
  const b0 = push(0, 0, -0.035, dark, 0), b1 = push(0, 0, 0.045, dark, 0);
  const b2 = push(0, 0.012, 0, dark, 0);
  idx.push(b0, b1, b2, b0, b2, b1);
  for (const s of [-1, 1]) {
    /* Morpho blue on top. The upper surface is the one that flashes. */
    const up = [0.085, 0.220, 0.640];
    const fore = [
      push(0, 0, 0.028, up, s), push(0.075 * s, 0, 0.050, up, s),
      push(0.098 * s, 0, -0.010, up, s), push(0, 0, -0.014, up, s),
    ];
    idx.push(fore[0], fore[1], fore[2], fore[0], fore[2], fore[3]);
    idx.push(fore[0], fore[2], fore[1], fore[0], fore[3], fore[2]);
    const hind = [
      push(0, 0, -0.014, up, s), push(0.076 * s, 0, -0.014, up, s),
      push(0.052 * s, 0, -0.062, up, s), push(0, 0, -0.048, up, s),
    ];
    idx.push(hind[0], hind[1], hind[2], hind[0], hind[2], hind[3]);
    idx.push(hind[0], hind[2], hind[1], hind[0], hind[3], hind[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class JungleLife {
  constructor(terrain, trail, tier = 'high') {
    this.terrain = terrain;
    this.trail = trail;
    this.root = new THREE.Group();
    this.root.name = 'jungle-life';
    this.root.frustumCulled = false;
    this.materials = [];
    this._t = 0;

    const rng = random(0x11fe01);
    const N_MOTE = tier === 'low' ? 7000 : tier === 'medium' ? 16000 : 30000;

    /* ── motes ──────────────────────────────────────────────────────────── */
    const mp = new Float32Array(N_MOTE * 3);
    const ph = new Float32Array(N_MOTE);
    const sz = new Float32Array(N_MOTE);
    const rt = new Float32Array(N_MOTE);
    for (let i = 0; i < N_MOTE; i++) {
      mp[i * 3] = rng() * CELL;
      /* Weighted low. Most of what hangs in forest air is within a few metres
       * of the floor, because that is where it comes from. */
      mp[i * 3 + 1] = Math.pow(rng(), 1.7) * CELL;
      mp[i * 3 + 2] = rng() * CELL;
      ph[i] = rng() * 6.283;
      sz[i] = 0.7 + Math.pow(rng(), 2.2) * 1.8;
      rt[i] = 0.55 + rng() * 0.95;
    }
    const mgeo = new THREE.BufferGeometry();
    mgeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mgeo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    mgeo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    mgeo.setAttribute('aRate', new THREE.BufferAttribute(rt, 1));
    /* The swarm is re-centred on the camera in the shader, so its bounds are
     * meaningless and frustum culling on it would pop the whole thing out. */
    mgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this._moteGeo = mgeo;

    this.moteMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        /* Set from the drawing buffer height so the motes are the same
         * physical size at every resolution. */
        uPixelScale: { value: 15.0 },
        uColor: { value: new THREE.Color(0.90, 0.88, 0.72) },
      },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.materials.push(this.moteMat);
    const motes = new THREE.Points(mgeo, this.moteMat);
    motes.name = 'life:motes';
    motes.frustumCulled = false;
    motes.renderOrder = 8;
    this.root.add(motes);
    this._motes = motes;

    /* ── butterflies ────────────────────────────────────────────────────── */
    const N_FLY = tier === 'low' ? 22 : tier === 'medium' ? 46 : 80;
    const bgeo = butterflyGeometry();
    this._flyGeo = bgeo;
    const flyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.52, metalness: 0.0,
      side: THREE.DoubleSide,
    });
    /* Flap in the vertex shader. Doing it on the CPU would mean thirty
     * separate meshes and thirty draw calls for an object that is nine
     * triangles. */
    flyMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.moteMat.uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\nattribute float aWing;\nattribute float aFly;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          /* Rotate each wing about the body's long axis. Real flight is not a
           * sine — the downstroke is fast and the recovery is slow — so the
           * angle is biased with a power curve. */
          float w = abs(aWing);
          if (w > 0.5) {
            float s = sin(uTime * 11.0 + aFly * 6.283);
            float ang = sign(s) * pow(abs(s), 0.55) * 1.15;
            float c = cos(ang), sn = sin(ang);
            float side = sign(aWing);
            float y = transformed.y * c - abs(transformed.x) * sn;
            float x = (abs(transformed.x) * c + transformed.y * sn) * side;
            transformed.x = x;
            transformed.y = y;
          }
        `);
      this._flySh = sh;
    };
    flyMat.customProgramCacheKey = () => 'jungle-butterfly';
    this.materials.push(flyMat);

    const flies = new THREE.InstancedMesh(bgeo, flyMat, N_FLY);
    flies.name = 'life:butterflies';
    flies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flies.frustumCulled = false;
    const flyPhase = new Float32Array(N_FLY);
    for (let i = 0; i < N_FLY; i++) flyPhase[i] = rng();
    bgeo.setAttribute('aFly', new THREE.InstancedBufferAttribute(flyPhase, 1));
    this.root.add(flies);
    this._flies = flies;

    /* Each butterfly has a home it never gets far from, and a wander it never
     * quite completes. Homes are placed along the trail so they are where the
     * player is, rather than evenly through a level the player walks a line
     * through. */
    this._fly = [];
    const P = new THREE.Vector3();
    for (let i = 0; i < N_FLY; i++) {
      const t = (i + 0.5) / N_FLY;
      trail.pointAt(t, P);
      const a = rng() * 6.283, r = 1.5 + rng() * 5.5;
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      this._fly.push({
        x, z, base: terrain.height(x, z),
        h: 0.7 + rng() * 2.2, r: 1.4 + rng() * 3.2,
        rate: 0.30 + rng() * 0.45, ph: rng() * 6.283,
        s: 1.05 + rng() * 0.75, phase: flyPhase[i],
      });
    }
    this._dummy = new THREE.Object3D();
    this.counts = { motes: N_MOTE, butterflies: N_FLY };
  }

  /**
   * Move the air and the animals.
   *
   * The motes are one uniform write — all their motion is in the shader,
   * because three thousand points re-uploaded every frame would cost more than
   * everything else this class does put together.
   *
   * The butterflies are integrated on the CPU, which is fine at thirty. Their
   * path is two circles of different periods added together: that never closes,
   * so a butterfly never visibly repeats, and the speed varies around the loop
   * the way a real one's does. They bank into the turn, because a butterfly
   * that stays level looks like it is on a wire.
   */
  update(dt, camera, drawHeight) {
    this._t += dt;
    if (drawHeight) this.moteMat.uniforms.uPixelScale.value = 15.0 * (drawHeight / 720);
    const T = this._t;
    this.moteMat.uniforms.uTime.value = T;
    if (camera) this.moteMat.uniforms.uCam.value.copy(camera.position);

    const d = this._dummy;
    for (let i = 0; i < this._fly.length; i++) {
      const f = this._fly[i];
      const a = T * f.rate + f.ph;
      const x = f.x + Math.cos(a) * f.r + Math.cos(a * 2.37 + f.ph) * f.r * 0.42;
      const z = f.z + Math.sin(a) * f.r + Math.sin(a * 1.91 + f.ph) * f.r * 0.42;
      /* Stay a fixed height above whatever is under it, so a butterfly never
       * flies into a bank or hangs three metres up over a dip. */
      const y = this.terrain.height(x, z) + f.h + Math.sin(a * 3.1) * 0.28;
      const dx = -Math.sin(a) * f.r - Math.sin(a * 2.37 + f.ph) * f.r * 0.42 * 2.37;
      const dz = Math.cos(a) * f.r + Math.cos(a * 1.91 + f.ph) * f.r * 0.42 * 1.91;
      d.position.set(x, y, z);
      d.rotation.set(Math.sin(a * 2.1) * 0.22, Math.atan2(dx, dz), Math.sin(a * 1.3) * 0.45);
      d.scale.setScalar(f.s);
      d.updateMatrix();
      this._flies.setMatrixAt(i, d.matrix);
    }
    this._flies.instanceMatrix.needsUpdate = true;
  }

  setTier() {}
  stats() { return this.counts; }
  dispose() {
    this._moteGeo.dispose();
    this._flyGeo.dispose();
    this.materials.forEach((m) => m.dispose());
  }
}
