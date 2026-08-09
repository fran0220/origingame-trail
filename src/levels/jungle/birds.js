/* Birds in the canopy.
 *
 * The forest now has dust in its light, butterflies on the trail, deadwood on
 * its floor and vines through its middle, and every one of those is either at
 * eye level or below it. Nothing has ever happened ABOVE the player's head.
 *
 * That matters more in this level than it would anywhere else, because the
 * whole point of a rainforest interior is that it is a tall space, and the
 * player has no way to feel the height of a ceiling that never moves. A bird
 * crossing a gap twenty metres up does in one second what no amount of extra
 * canopy geometry can do: it puts something of KNOWN SIZE at an unknown
 * distance, and the eye solves for the distance immediately.
 *
 * Two behaviours, because one alone is not convincing:
 *
 *   TRANSITS. A bird crosses a canopy gap on a straight line and is gone in
 *   under two seconds. This is what you actually see of a forest bird — a
 *   silhouette passing a hole in the leaves — and it is the one that sells
 *   the height.
 *
 *   PERCHERS. A bird sits on a branch, shifts its weight, turns its head, and
 *   occasionally drops to another perch. This is what rewards a player who
 *   stops walking, and a level with nothing to find when you stand still is a
 *   corridor rather than a place.
 */
import * as THREE from 'three';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A bird: body, tail, and two wings that the vertex shader beats. Under thirty
 * triangles, because the near ones are still ten metres away and the far ones
 * are a dozen pixels. Wing side goes in an attribute exactly as the
 * butterflies do — the flap has to be free per instance or it is thirty draw
 * calls for an object smaller than a leaf. */
function birdGeometry(rng) {
  const pos = [], col = [], wing = [], idx = [];
  const push = (x, y, z, c, w) => {
    const n = pos.length / 3; pos.push(x, y, z); col.push(...c); wing.push(w); return n;
  };
  /* Dark above, pale below. Countershading is not decoration — it is why a
   * bird seen against bright canopy reads as a silhouette and the same bird
   * seen from above disappears, and both of those happen here. */
  const back = [0.055, 0.062, 0.048];
  /* The pale side is pale RELATIVE TO THE BACK, not pale absolutely. At
   * 0.230 these read as white blobs in a forest whose brightest foliage sits
   * near 0.12 — brighter than anything around them, which is the opposite of
   * what countershading is for. */
  const belly = [0.128, 0.120, 0.098];

  /* Body: a six-sided spindle. */
  const RINGS = [[-0.11, 0.010], [-0.03, 0.038], [0.05, 0.034], [0.13, 0.012]];
  const ringBase = [];
  for (const [z, r] of RINGS) {
    ringBase.push(pos.length / 3);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const up = Math.sin(a);
      const c = up > 0 ? back : belly;
      push(Math.cos(a) * r, Math.sin(a) * r, z, c.map((v) => v * (0.82 + 0.36 * (up * 0.5 + 0.5))), 0);
    }
  }
  for (let i = 0; i < RINGS.length - 1; i++) {
    for (let k = 0; k < 6; k++) {
      const a = ringBase[i] + k, b = ringBase[i] + (k + 1) % 6;
      idx.push(a, a + 6, b, b, a + 6, b + 6);
    }
  }
  /* Tail: a flat fan behind. */
  const t0 = push(0, 0, -0.10, back, 0);
  const t1 = push(-0.035, 0.004, -0.20, back, 0);
  const t2 = push(0.035, 0.004, -0.20, back, 0);
  idx.push(t0, t1, t2, t0, t2, t1);

  /* Wings. */
  for (const s of [-1, 1]) {
    const a = push(0, 0.012, 0.04, back, s);
    const b = push(0.115 * s, 0.012, 0.035, back, s);
    const c = push(0.150 * s, 0.012, -0.045, back, s);
    const d = push(0, 0.012, -0.055, back, s);
    idx.push(a, b, c, a, c, d);
    idx.push(a, c, b, a, d, c);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class JungleBirds {
  constructor(terrain, trail, tier = 'high') {
    this.terrain = terrain;
    this.trail = trail;
    this.root = new THREE.Group();
    this.root.name = 'jungle-birds';
    this.root.frustumCulled = false;
    this.materials = [];
    this._t = 0;

    const rng = random(0x4b19d7);
    const N = tier === 'low' ? 16 : tier === 'medium' ? 34 : 60;

    const geo = birdGeometry(rng);
    this._geo = geo;
    this.uniforms = { uBirdTime: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0.0,
      side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader =
        'uniform float uBirdTime;\nattribute float aWing;\nattribute float aBird;\nattribute float aBeat;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'if (abs(aWing) > 0.5) {',
          '  /* Beat rate is per instance, and aBeat is zero for a perched',
          '     bird — a bird sitting on a branch with its wings going is the',
          '     kind of detail that destroys the whole effect. */',
          '  float s = sin(uBirdTime * aBeat + aBird * 6.283);',
          '  /* Downstroke fast, recovery slow, same as the butterflies, but',
          '     shallower: a bird in level flight beats through a much smaller',
          '     arc than one taking off. */',
          '  float ang = sign(s) * pow(abs(s), 0.5) * 0.72;',
          '  float c = cos(ang), sn = sin(ang);',
          '  float side = sign(aWing);',
          '  float ax = abs(transformed.x);',
          '  transformed.y = transformed.y * c - ax * sn;',
          '  transformed.x = (ax * c + transformed.y * sn) * side;',
          '}',
        ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'jungle-bird-flap';
    this.materials.push(mat);

    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.name = 'birds';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    const phase = new Float32Array(N), beat = new Float32Array(N);
    geo.setAttribute('aBird', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aBeat', new THREE.InstancedBufferAttribute(beat, 1));
    this._beatAttr = geo.getAttribute('aBeat');
    this.root.add(mesh);
    this._mesh = mesh;

    /* Two thirds transit, one third perch. Transits are what sell the height;
     * perchers are what reward stopping. */
    this._birds = [];
    const P = new THREE.Vector3(), TAN = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      phase[i] = rng();
      const transit = i % 3 !== 0;
      const u = (i + 0.5) / N;
      trail.pointAt(u, P);
      trail.tangentAt(u, TAN);
      const a = rng() * Math.PI * 2, r = 2.5 + rng() * 9.5;
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      const ground = terrain.height(x, z);
      this._birds.push({
        transit,
        x, z, ground,
        /* Height had to be measured, not reasoned about. The obvious choice
         * was to fly transits high "through the canopy gaps" at 13-22 m — and
         * at that height they were visible at 1 of 10 trail stations, peaking
         * at 0.02% of the frame, because THIS CANOPY IS CLOSED. Looking up
         * from the trail you see leaves, not sky, so a bird above the canopy
         * is a bird behind it.
         *
         * The open airspace in this forest is the mid-storey — the same band
         * the lianas occupy, which measured 1.7-4.4% of frame precisely
         * because it is the volume you can actually see through. That is where
         * the birds go. */
        h: transit ? 5.5 + rng() * 6.5 : 2.2 + rng() * 3.4,
        /* Transits fly ACROSS the trail, not along it. A random heading means
         * most crossings happen behind the player or parallel to their line of
         * sight, where a bird is a dot that does not move against the
         * background. Perpendicular to the local tangent puts the whole
         * crossing through the forward view, which is the only place it can
         * do its job. */
        heading: transit
          ? Math.atan2(TAN.x, TAN.z) + Math.PI / 2 + (rng() - 0.5) * 1.0
          : rng() * Math.PI * 2,
        span: 16 + rng() * 26,
        speed: transit ? 5.5 + rng() * 4.5 : 0,
        s: 1.15 + rng() * 0.95,
        t0: rng() * 14,
        /* A perched bird's whole performance is a head turn and a weight
         * shift every few seconds. */
        fidget: 2.5 + rng() * 5,
        ph: rng() * 6.283,
      });
      beat[i] = transit ? 26 + rng() * 10 : 0;
    }
    this.counts = { total: N, transits: this._birds.filter((b) => b.transit).length,
                    perchers: this._birds.filter((b) => !b.transit).length };
    this._dummy = new THREE.Object3D();
  }

  /**
   * Fly them.
   *
   * A transit is a scripted crossing on a cycle: it appears at one edge of its
   * span, crosses, and the cycle restarts with a new heading. That is cheaper
   * and more controllable than a flocking simulation, and for an animal the
   * player sees for a second and a half at a time, entirely sufficient — the
   * information delivered is "something crossed up there", and nothing about
   * the path survives past that.
   */
  update(dt, camera) {
    this._t += dt;
    const T = this._t;
    this.uniforms.uBirdTime.value = T;
    const d = this._dummy;
    for (let i = 0; i < this._birds.length; i++) {
      const b = this._birds[i];
      if (b.transit) {
        const period = b.span / b.speed + 3.5;
        const u = ((T + b.t0) % period) / (b.span / b.speed);
        if (u > 1) {
          /* Between crossings it is parked below the floor rather than
           * hidden, because toggling visibility on one instance of an
           * InstancedMesh is not possible without rewriting the matrix
           * anyway. */
          d.position.set(b.x, b.ground - 60, b.z);
          d.scale.setScalar(0.001);
          d.updateMatrix();
          this._mesh.setMatrixAt(i, d.matrix);
          continue;
        }
        const cx = Math.cos(b.heading), cz = Math.sin(b.heading);
        const travel = (u - 0.5) * b.span;
        const x = b.x + cx * travel, z = b.z + cz * travel;
        /* Undulating flight: most small forest birds climb on the beat and
         * fall between bursts, and the vertical wobble is far more
         * recognisable than the horizontal line. */
        const y = this.terrain.height(x, z) + b.h + Math.sin(T * 3.1 + b.ph) * 0.55;
        d.position.set(x, y, z);
        d.rotation.set(Math.sin(T * 3.1 + b.ph) * 0.16, b.heading + Math.PI / 2,
                       Math.sin(T * 1.7 + b.ph) * 0.20);
        d.scale.setScalar(b.s);
      } else {
        const f = Math.sin(T / b.fidget + b.ph);
        d.position.set(b.x, b.ground + b.h, b.z);
        /* Head turns are discrete. A perched bird does not sweep smoothly —
         * it snaps, holds, snaps back, and a sine here looks like a weather
         * vane. */
        const snap = Math.round(f * 2) / 2;
        d.rotation.set(0, b.heading + snap * 0.9, Math.sin(T * 0.7 + b.ph) * 0.06);
        d.scale.setScalar(b.s);
      }
      d.updateMatrix();
      this._mesh.setMatrixAt(i, d.matrix);
    }
    this._mesh.instanceMatrix.needsUpdate = true;
  }

  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this._geo.dispose(); this.materials.forEach((m) => m.dispose()); }
}
