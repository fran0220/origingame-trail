/* Wheel dust.
 *
 * The driver has known which surface each wheel is on since it was written,
 * and the audio has used it since the engine was written — drop a wheel onto
 * the shoulder and the tyre note changes immediately. Nothing showed it. A
 * racing level where leaving the seal is audible but invisible is telling the
 * player something important through the one channel they are most likely to
 * have turned off.
 *
 * It is also the only feedback in the level that is CAUSED BY THE PLAYER.
 * Everything else here — the sheep, the wind in the poplars, the birds —
 * happens whether or not anyone is driving. Dust happens because of what you
 * just did with the steering, which makes it worth more per pixel than any of
 * them.
 *
 * DESIGN NOTES, mostly about what not to do:
 *
 *   IT COMES OFF THE WHEELS THAT ARE ACTUALLY OFF THE SEAL, not off the car.
 *   Dropping the left pair onto the shoulder and straddling the centreline
 *   both average to half, and a plume from under the middle of the car in the
 *   first case reads as a smoke screen rather than as a mistake.
 *
 *   IT IS LEFT BEHIND, not carried. Once a puff is in the air it belongs to
 *   the world: it keeps the velocity it was thrown with and then only drifts
 *   with the wind. Particles parented to a moving car look like a costume.
 *
 *   IT GROWS AND THINS AT THE SAME TIME. A cloud that fades at constant size
 *   reads as a fading sprite; a cloud that expands while its opacity falls
 *   reads as dispersing, because that is what conservation of mass looks
 *   like.
 *
 *   THE RATE DEPENDS ON SPEED, NOT JUST ON BEING OFF-SEAL. A car creeping
 *   along a gravel shoulder raises almost nothing.
 */
import * as THREE from 'three';

const MAX = 320;

const VERT = `
  uniform float uPixelScale;
  attribute float aAge;      // 0 at birth, 1 at death
  attribute float aSize;     // metres at birth
  attribute float aSeed;
  varying float vAge;
  varying float vSeed;

  void main() {
    vAge = aAge;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    /* Expands to about three times its birth size. Dust does not stay the
     * size it was thrown. */
    float grow = aSize * (1.0 + aAge * 2.2);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(grow * uPixelScale / max(dist, 1.0), 2.0, 260.0);
  }
`;

const FRAG = `
  precision mediump float;
  uniform vec3 uColour;
  varying float vAge;
  varying float vSeed;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    /* A soft blob with a hard-ish core, and a per-particle asymmetry so a
     * plume is not a string of identical circles. */
    float soft = 1.0 - smoothstep(0.02, 0.25, r2);
    float lobe = 0.85 + 0.15 * sin(vSeed * 12.9 + atan(d.y, d.x) * 3.0);
    /* Fades in fast, out slow. A puff that appears at full opacity pops. */
    float a = smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.15, 1.0, vAge));
    gl_FragColor = vec4(uColour, soft * lobe * a * 0.42);
  }
`;

export class WheelDust {
  constructor({ tier = 'high' } = {}) {
    this.count = tier === 'low' ? 90 : tier === 'medium' ? 180 : MAX;
    this.root = new THREE.Group();
    this.root.name = 'wheel-dust';
    this.root.frustumCulled = false;
    this.materials = [];

    const n = this.count;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1);   // all dead
    this.life = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) this.seed[i] = Math.random();
    this._next = 0;
    this._emitDebt = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    /* Recentred every frame, so its own bounds are meaningless. */
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geo;

    this.uniforms = {
      uPixelScale: { value: 900 },
      /* Mackenzie shingle is pale grey-ochre, not brown. Brown dust belongs
       * to a country with topsoil. */
      uColour: { value: new THREE.Color(0.62, 0.58, 0.49) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.materials.push(mat);

    const pts = new THREE.Points(geo, mat);
    pts.name = 'dust:points';
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    this.root.add(pts);
    this.emitted = 0;
  }

  _spawn(x, y, z, vx, vy, vz, size, life) {
    const i = this._next;
    this._next = (this._next + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.emitted++;
  }

  /**
   * @param {number} dt
   * @param {object} car   the driver: needs wheels[], speed, yaw
   * @param {number} drawHeight  for resolution-independent particle size
   */
  update(dt, car, drawHeight) {
    if (drawHeight) this.uniforms.uPixelScale.value = 900 * (drawHeight / 720);

    if (car && car.wheels) {
      const speed = car.speed || 0;
      /* Below walking pace a tyre lifts nothing worth drawing. */
      const speedTerm = Math.max(0, Math.min(1, (speed - 2.5) / 16));
      for (const w of car.wheels) {
        if (w.off < 0.12 || speedTerm <= 0) continue;
        /* Rate per wheel per second. Deliberately modest: the failure mode of
         * every dust system is a car that looks like it is on fire. */
        const rate = 46 * w.off * speedTerm;
        this._emitDebt += rate * dt;
        while (this._emitDebt >= 1) {
          this._emitDebt -= 1;
          const j = (Math.random() - 0.5);
          /* Thrown backwards and outwards from the contact patch, with a
           * small upward component. The tyre flings material along its own
           * rearward tangent, which is why a plume trails rather than
           * mushrooms. */
          const back = -(car.yaw !== undefined ? 1 : 1);
          const dirx = Math.sin(car.yaw || 0), dirz = Math.cos(car.yaw || 0);
          const throwSpeed = 1.2 + speed * 0.16;
          this._spawn(
            w.x + j * 0.25, w.y + 0.14, w.z + j * 0.25,
            -dirx * throwSpeed * (0.5 + Math.random() * 0.6) + j * 1.4,
            0.9 + Math.random() * 1.5,
            -dirz * throwSpeed * (0.5 + Math.random() * 0.6) + j * 1.4,
            0.20 + Math.random() * 0.30,
            0.9 + Math.random() * 1.1);
        }
      }
    }

    /* Integrate. Dust is light: it decelerates hard, barely falls, and is
     * pushed by the same wind that moves the poplars. */
    const drag = Math.exp(-2.6 * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= 1) continue;
      this.age[i] += dt / this.life[i];
      if (this.age[i] > 1) { this.age[i] = 1; continue; }
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - 0.35 * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt + 0.55 * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt + 0.42 * dt;
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('aAge').needsUpdate = true;
    this.geometry.getAttribute('aSize').needsUpdate = true;
  }

  /** How many particles are currently alive — the instrument reads this. */
  alive() {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.age[i] < 1) n++;
    return n;
  }

  stats() { return { capacity: this.count, alive: this.alive(), emitted: this.emitted }; }
  setTier() {}
  cullAround() {}
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
