/* The car.
 *
 * A walker and a car are the same problem — decide where a body is, then put a
 * camera near it — and almost nothing carries over, because the two differ in
 * the one thing that decides how a vehicle feels. A person's velocity points
 * wherever they are facing. A car's does not, and the angle between the two is
 * the entire subject.
 *
 * Everything below follows from that. Slip angle is the difference between
 * where a tyre is pointed and where it is actually travelling; lateral force
 * is a function of slip angle; that function is linear at small angles and
 * saturates past a few degrees, which is what "the limit" means. Weight moves
 * forward under braking and outward through a corner, and since a tyre's grip
 * scales with the load on it, that transfer is what makes trail-braking work
 * and what makes a lifted rear step out. None of this needs a full multi-body
 * solver; it needs a bicycle model with load transfer and a saturating tyre,
 * which is what this is.
 *
 * The model is a simplification in three named places, and each is a
 * deliberate trade rather than an omission:
 *
 *   Two tyres, not four. Left and right are lumped into one contact patch per
 *   axle. This is the standard bicycle model and it is exact for everything
 *   except the effects that *depend* on the left/right difference. Lateral
 *   load transfer is therefore reintroduced by hand below, because that one is
 *   not optional — it is why a car understeers more as it corners harder.
 *
 *   No suspension travel. The shell's pitch and roll are computed directly
 *   from longitudinal and lateral acceleration through a spring rate, rather
 *   than integrated from spring and damper states. What a player reads is the
 *   attitude, and the attitude is what this produces; the intermediate state
 *   would cost a stiff integrator and change nothing visible.
 *
 *   The ground is a heightfield, not a collision mesh. Four wheels are sampled
 *   against it every frame for contact and for surface type, which is enough
 *   to hold the car on a crowned road, tilt it into a camber and know when a
 *   wheel has dropped onto the gravel shoulder.
 */
import * as THREE from 'three';
import { clamp, lerp, smoothstep, Noise2D } from '../world/noise.js';
import { WHEELBASE, TRACK, WHEEL_R } from './carMesh.js';

/* ── the car ───────────────────────────────────────────────────────────────
 * A front-wheel-drive turbocharged hatchback of about 1.3 tonnes, which is
 * both what a private car on this road would be and a forgiving thing to
 * drive fast on a public highway.
 */
const MASS = 1310;                 // kg
const CG_HEIGHT = 0.52;            // m above ground — low, this is a hatchback
/* Front/rear weight split. Nose-heavy, as a transverse-engined FWD car is,
 * and this single number is most of why the car understeers at the limit. */
const WEIGHT_FRONT = 0.61;
const A = WHEELBASE * (1 - WEIGHT_FRONT);   // CG to front axle
const B = WHEELBASE * WEIGHT_FRONT;         // CG to rear axle
/* Yaw inertia. For a passenger car this is close to m * (0.30 * L)^2 with L
 * the wheelbase; the coefficient is the radius of gyration as a fraction of
 * wheelbase and 0.30-0.34 covers almost every road car ever measured. */
const IZZ = MASS * (0.32 * WHEELBASE) ** 2;

/* Cornering stiffness per axle, in newtons per radian of slip, at the static
 * load. The rear is stiffer than the front — again, understeer by design. */
const CORNER_FRONT = 88_000;
const CORNER_REAR = 104_000;
/* Slip angle at which a tyre reaches peak lateral force. Around seven degrees
 * for a road tyre; past it the force falls away rather than holding, which is
 * what makes a slide something you have to catch. */
const PEAK_SLIP = 0.122;

const GRAVITY = 9.81;
/* Peak longitudinal and lateral friction on dry chipseal. Chipseal is coarse
 * and grips well — better than smooth hot-mix — so this is at the high end. */
const MU_ROAD = 1.08;
/* Loose gravel shoulder. A third less grip and, more importantly, it arrives
 * with far less warning. */
const MU_GRAVEL = 0.62;
/* Tussock and shingle. You are no longer racing; you are trying to get back. */
const MU_OFF = 0.44;

const DRIVE_FORCE = 7_600;         // N at the contact patch, first-gear equivalent
const BRAKE_FORCE = 13_800;        // N, all four wheels, near enough to lock
const ENGINE_BRAKE = 1_400;        // N with the throttle shut
const TOP_SPEED = 61;              // m/s, ~220 km/h — where drag balances drive
/* Aerodynamic drag, 0.5 * rho * Cd * A. A hatchback is about Cd 0.32 over
 * 2.2 m^2, and air is 1.20 kg/m^3 at this altitude on a spring morning. */
const DRAG = 0.5 * 1.20 * 0.32 * 2.2;
/* Rolling resistance, as a fraction of vertical load. */
const ROLL_RESIST = 0.014;

const MAX_STEER = 0.52;            // rad at the roadwheel, ~30 degrees
/* How fast the driver can turn the wheel, and how much less lock they get at
 * speed. Both are the *player's* limits rather than the car's: without them a
 * keyboard applies a step input, and a step input to full lock at 50 m/s is
 * not a car, it is a spin. */
const STEER_RATE = 3.4;
const STEER_RETURN = 5.2;

const UP = new THREE.Vector3(0, 1, 0);

export class Driver {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../levels/lake/basin.js').Basin} terrain
   * @param {import('../world/path.js').Trail} trail
   */
  constructor(camera, terrain, trail, collision = null) {
    this.camera = camera;
    this.terrain = terrain;
    this.trail = trail;
    this.collision = collision;

    /* ── state ──────────────────────────────────────────────────────────
     * Position is the centre of mass projected to the ground; `yaw` is the
     * direction the car points; `vx`/`vy` are velocity in the *car's* frame,
     * longitudinal and lateral, which is the frame the tyre model works in
     * and the reason the whole thing stays readable. */
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();   // world frame, for everything outside
    this.yaw = 0;
    this.pitch = 0;
    this.vx = 0;                      // m/s forward
    this.vy = 0;                      // m/s to the right — this is the slide
    this.yawRate = 0;

    this.steer = 0;                   // current roadwheel angle, rad
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = 0;

    this.speed = 0;                   // m/s, magnitude — HUD and audio read this
    this.grounded = true;
    this.airTime = 0;
    this.wheelSpin = 0;               // rad, for the mesh
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.slipAngle = 0;
    this.surface = 'seal';
    this.offRoad = 0;                 // 0 sealed, 1 fully off the formation
    this.skid = 0;                    // 0..1, how hard the tyres are complaining

    /* Camera. A chase camera is not a position, it is a filter: it lags the
     * car in translation and leads it in rotation, and getting those two
     * backwards is what makes a chase camera feel like a tow rope. */
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camMode = 'chase';           // 'chase' | 'hood'
    this._camInit = false;
    this._baseFov = camera.fov;

    this.keys = Object.create(null);
    this.enabled = true;
    this.auto = null;
    this.noise = new Noise2D(0x0caa11);
    this._time = 0;

    /* Kept so a level host written against the Walker can drive this without
     * knowing which one it has. */
    this.height = 1.35;
    this.radius = 0.9;
    this.onStep = null;
    this.onLand = null;

    this._tmp = new THREE.Vector3();
    this._q = {};
    this._wheelY = [0, 0, 0, 0];

    this.placeAt(0.02);
  }

  /* ── placement ─────────────────────────────────────────────────────────── */

  /** Drop the car on the road at normalised arc length `t`, facing along it. */
  placeAt(t) {
    const p = this.trail.pointAt(t, new THREE.Vector3());
    const tan = this.trail.tangentAt(t, new THREE.Vector3());
    return this.placeAtPoint(p.x, p.z, Math.atan2(tan.x, tan.z));
  }

  /**
   * Put the car at a world position, facing `yaw`.
   *
   * `yaw` is measured the way the car's own forward vector is: 0 points along
   * +Z, increasing toward +X. Note this is *not* the walker's convention,
   * which faces -Z, because the car's mesh, its velocity frame and its
   * heading all have to agree and +Z forward is what the mesh is built to.
   */
  placeAtPoint(x, z, yaw) {
    this.pos.set(x, this.terrain.height(x, z), z);
    this.yaw = yaw;
    this.vx = this.vy = this.yawRate = 0;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.steer = 0;
    this._camInit = false;
    return this;
  }

  /** Face the car back down the road it is nearest to. Used by a reset key. */
  recover() {
    const q = this.trail.nearest(this.pos.x, this.pos.z, {});
    const p = this.trail.pointAt(q.t, new THREE.Vector3());
    const tan = this.trail.tangentAt(q.t, new THREE.Vector3());
    return this.placeAtPoint(p.x, p.z, Math.atan2(tan.x, tan.z));
  }

  /* ── input ─────────────────────────────────────────────────────────────── */

  attach(dom) {
    this.dom = dom;
    const down = (e) => {
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyR') this.recover();
      if (e.code === 'KeyC') this.camMode = this.camMode === 'chase' ? 'hood' : 'chase';
    };
    const up = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    /* Losing focus mid-corner leaves a key latched down and the car drives
     * itself into the lake. */
    const blur = () => { for (const k in this.keys) this.keys[k] = false; };
    window.addEventListener('blur', blur);
    this._detach = () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };

    /* The mouse only looks around; it does not steer. A mouse-steered car
     * cannot be driven smoothly because the input has no centre. */
    const move = (e) => {
      if (document.pointerLockElement !== dom) return;
      this.lookYaw = clamp((this.lookYaw ?? 0) + e.movementX * 0.0022, -2.4, 2.4);
      this.lookPitch = clamp((this.lookPitch ?? 0) - e.movementY * 0.0022, -0.5, 0.6);
    };
    window.addEventListener('mousemove', move);
    const _d = this._detach;
    this._detach = () => { _d(); window.removeEventListener('mousemove', move); };
    return this;
  }

  /* Returns `this`, because Walker.setAuto does and half the capture tools
   * chain straight off it — `walker.setAuto(null).placeAt(t)`. A method that
   * differs from the one it stands in for only in its return value is the kind
   * of substitution failure that shows up as a null dereference in a tool
   * rather than as anything a player could see. */
  setAuto(t, pace = 'drive') {
    this.auto = t === null ? null : { t, pace };
    return this;
  }

  _readInput(dt) {
    const K = this.keys;
    const on = (...c) => c.some((k) => K[k]);

    const wantThrottle = on('KeyW', 'ArrowUp') ? 1 : 0;
    const wantBrake = on('KeyS', 'ArrowDown') ? 1 : 0;
    let wantSteer = 0;
    if (on('KeyA', 'ArrowLeft')) wantSteer -= 1;
    if (on('KeyD', 'ArrowRight')) wantSteer += 1;

    /* Throttle and brake are ramped rather than switched. A real pedal takes
     * a tenth of a second to travel and the ramp is most of what stops a
     * keyboard car feeling like it is being driven by a relay. */
    this.throttle = lerp(this.throttle, wantThrottle, 1 - Math.exp(-9 * dt));
    this.brake = lerp(this.brake, wantBrake, 1 - Math.exp(-16 * dt));
    this.handbrake = on('Space') ? 1 : 0;

    /* Speed-sensitive lock. At a standstill the driver has all of it; at
     * 50 m/s a full-lock input would ask for about 3 g and the car would
     * simply spin, so the *available* lock falls with speed. This is what a
     * real driver does with their hands and it is the single largest thing
     * separating a drivable keyboard car from an undrivable one. */
    const v = Math.abs(this.vx);
    const authority = lerp(1.0, 0.20, smoothstep(6, 46, v));
    const target = wantSteer * MAX_STEER * authority;

    if (wantSteer === 0) {
      /* Self-centring, and it is faster than the driver could turn the wheel
       * because the caster angle is doing it for them. */
      this.steer = lerp(this.steer, 0, 1 - Math.exp(-STEER_RETURN * dt));
    } else {
      const rate = STEER_RATE * MAX_STEER * dt;
      this.steer += clamp(target - this.steer, -rate, rate);
    }
    this.steer = clamp(this.steer, -MAX_STEER * authority - 0.02, MAX_STEER * authority + 0.02);
  }

  /* ── surface ───────────────────────────────────────────────────────────── */

  /**
   * What each wheel is standing on, and therefore how much grip there is.
   *
   * Read from the trail's distance field rather than from a material id,
   * because the road's own geometry is defined in exactly those terms — see
   * the ROAD_* constants in basin.js. The two blend over half a metre so that
   * putting a wheel down onto the shoulder is a gradual loss rather than a
   * switch, which is both true and much easier to catch.
   */
  _surfaceAt(x, z) {
    const q = this.trail.nearest(x, z, this._q);
    const d = q.dist;
    // ROAD_HALF 4.1, ROAD_SHOULDER 5.9 — see basin.js.
    const onSeal = 1 - smoothstep(3.9, 4.5, d);
    const onGravel = (1 - smoothstep(5.6, 6.4, d)) * (1 - onSeal);
    const off = 1 - onSeal - onGravel;
    return {
      mu: onSeal * MU_ROAD + onGravel * MU_GRAVEL + off * MU_OFF,
      off: clamp(off + onGravel * 0.45, 0, 1),
      name: onSeal > 0.5 ? 'seal' : onGravel > 0.5 ? 'gravel' : 'off',
    };
  }

  /* ── the step ──────────────────────────────────────────────────────────── */

  update(dt) {
    /* A physics step this stiff must not be handed a long frame. One dropped
     * frame at 30 m/s is six metres of travel integrated in one go, which
     * puts the car through the scenery; a garbage-collection pause is worse.
     * Sub-stepping is cheaper than the alternative, which is an implicit
     * integrator. */
    dt = Math.min(dt, 0.1);
    const steps = Math.min(4, Math.max(1, Math.ceil(dt / 0.0125)));
    const h = dt / steps;
    this._time += dt;
    if (this.enabled && !this.auto) this._readInput(dt);
    for (let i = 0; i < steps; i++) this._step(h);
    this._updateCamera(dt);
  }

  _step(dt) {
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);

    /* ── where the wheels are, and what they are on ────────────────────── */
    const fx = sinY * B, fz = cosY * B;          // CG to front axle, world
    const rx = -sinY * A, rz = -cosY * A;
    const tx = cosY * (TRACK / 2), tz = -sinY * (TRACK / 2);

    const corners = [
      [this.pos.x + fx + tx, this.pos.z + fz + tz],
      [this.pos.x + fx - tx, this.pos.z + fz - tz],
      [this.pos.x + rx + tx, this.pos.z + rz + tz],
      [this.pos.x + rx - tx, this.pos.z + rz - tz],
    ];
    let mu = 0;
    let off = 0;
    for (let i = 0; i < 4; i++) {
      const s = this._surfaceAt(corners[i][0], corners[i][1]);
      mu += s.mu * 0.25;
      off += s.off * 0.25;
      this._wheelY[i] = this.terrain.height(corners[i][0], corners[i][1]);
    }
    this.offRoad = off;
    this.surface = off < 0.2 ? 'seal' : off < 0.7 ? 'gravel' : 'off';

    /* Grip falls away while a wheel is unloaded in the air. */
    const contact = this.grounded ? 1 : 0;
    mu *= contact;

    /* ── load transfer ──────────────────────────────────────────────────── */
    const W = MASS * GRAVITY;
    /* Longitudinal, from the previous step's acceleration. Using last step's
     * value rather than solving simultaneously is a one-frame lag at 80 Hz,
     * which is 12 ms and invisible, and it avoids an implicit solve. */
    const dLong = (this._ax || 0) * MASS * CG_HEIGHT / WHEELBASE;
    let loadF = W * (1 - WEIGHT_FRONT) - dLong;
    let loadR = W * WEIGHT_FRONT + dLong;
    loadF = Math.max(0, loadF); loadR = Math.max(0, loadR);

    /* Lateral, which the bicycle model threw away and which has to come back
     * because it is why a car understeers more the harder it corners. A tyre's
     * grip is sub-linear in load, so unloading the inside wheel costs more
     * than loading the outside one gains, and the axle that transfers the
     * most load loses the most grip. */
    const ay = (this._ay || 0);
    const transfer = clamp(Math.abs(ay) * MASS * CG_HEIGHT / (TRACK * W), 0, 0.95);
    /* A front-biased roll couple is exactly how a manufacturer dials in safe
     * understeer, and it is why this car will push its nose before it snaps. */
    const lossF = transfer * 0.62, lossR = transfer * 0.38;

    /* ── slip angles ────────────────────────────────────────────────────── */
    const vx = this.vx, vy = this.vy, r = this.yawRate;
    /* Guarded, because slip angle is undefined at rest and the naive
     * expression goes to infinity there — which at a standstill applies a
     * lateral force to a stationary car and makes it shuffle sideways. */
    const vxs = Math.max(Math.abs(vx), 1.2) * Math.sign(vx || 1);
    const slipF = Math.atan2(vy + A * r, Math.abs(vxs)) - this.steer * Math.sign(vxs);
    const slipR = Math.atan2(vy - B * r, Math.abs(vxs));
    this.slipAngle = slipR;

    /* ── the tyre ───────────────────────────────────────────────────────── */
    /* A saturating curve rather than a straight line. Linear up to the peak
     * slip angle, then falling back toward about 80% of peak — that fall is
     * what makes the limit a place you can go past, and a model without it
     * gives a car that simply refuses to slide. */
    const lat = (slip, stiff, load, loss) => {
      const grip = load * mu * (1 - loss);
      const linear = -stiff * slip;
      const peak = grip;
      const s = Math.abs(slip);
      let f = linear;
      if (s > PEAK_SLIP) {
        const overshoot = smoothstep(PEAK_SLIP, PEAK_SLIP * 3.4, s);
        f = -Math.sign(slip) * peak * lerp(1.0, 0.80, overshoot);
      }
      return clamp(f, -peak, peak);
    };

    let fyF = lat(slipF, CORNER_FRONT, loadF, lossF);
    let fyR = lat(slipR, CORNER_REAR, loadR, lossR);

    /* The handbrake locks the rear wheels, and a locked tyre has almost no
     * lateral force left — which is the whole point of pulling it. */
    if (this.handbrake > 0) fyR *= 0.24;

    /* ── longitudinal ───────────────────────────────────────────────────── */
    let fx_ = 0;
    /* Drive falls off with speed the way a geared engine does: a flat force
     * to the ground would accelerate as hard at 200 km/h as at 50. */
    const drivePower = lerp(1.0, 0.16, smoothstep(8, TOP_SPEED, Math.abs(vx)));
    fx_ += this.throttle * DRIVE_FORCE * drivePower * contact;
    fx_ -= this.brake * BRAKE_FORCE * Math.sign(vx || 1) * contact;
    fx_ -= this.handbrake * BRAKE_FORCE * 0.42 * Math.sign(vx || 1) * contact;
    if (this.throttle < 0.05 && this.brake < 0.05) {
      fx_ -= ENGINE_BRAKE * Math.sign(vx) * contact;
    }
    fx_ -= DRAG * vx * Math.abs(vx);
    fx_ -= ROLL_RESIST * W * Math.sign(vx) * contact * (1 + off * 2.6);

    /* The friction circle. A tyre has one budget of grip and it is spent on
     * turning and stopping together — this is why you cannot brake at full
     * force in a corner, and leaving it out is what makes an arcade car feel
     * like it is on rails. */
    const gripTotal = (loadF + loadR) * mu;
    const used = Math.hypot(fx_, fyF + fyR);
    if (used > gripTotal && used > 1) {
      const scale = gripTotal / used;
      fx_ *= scale; fyF *= scale; fyR *= scale;
    }

    /* ── integrate, in the car's frame ──────────────────────────────────── */
    const ax = fx_ / MASS + vy * r;
    const ay_ = (fyF * Math.cos(this.steer) + fyR) / MASS - vx * r;
    const torque = fyF * Math.cos(this.steer) * A - fyR * B;

    this.vx += ax * dt;
    this.vy += ay_ * dt;
    this.yawRate += (torque / IZZ) * dt;
    /* Yaw damping. Real cars have it from tyre relaxation and from the
     * aligning torque of the rear axle; without a little of it here the yaw
     * oscillates at the model's own natural frequency. */
    this.yawRate *= Math.exp(-1.6 * dt);

    this._ax = ax; this._ay = ay_;

    /* Stop cleanly. Without this the car creeps for ever on residual force
     * and the HUD reads 0.4 km/h at a standstill. */
    if (Math.abs(this.vx) < 0.35 && this.throttle < 0.05) {
      this.vx *= Math.exp(-8 * dt);
      this.vy *= Math.exp(-8 * dt);
      this.yawRate *= Math.exp(-8 * dt);
    }

    this.yaw += this.yawRate * dt;

    /* ── to the world ───────────────────────────────────────────────────── */
    const s2 = Math.sin(this.yaw), c2 = Math.cos(this.yaw);
    const wx = this.vx * s2 + this.vy * c2;
    const wz = this.vx * c2 - this.vy * s2;
    this.pos.x += wx * dt;
    this.pos.z += wz * dt;
    this.vel.set(wx, 0, wz);
    this.speed = Math.hypot(wx, wz);

    /* ── contact with the ground ────────────────────────────────────────── */
    /* The car rides on the average of its four wheels, which is what lets a
     * crowned road tilt it and a fan crossing pitch it without any suspension
     * state existing. */
    const groundY = (this._wheelY[0] + this._wheelY[1] + this._wheelY[2] + this._wheelY[3]) * 0.25;
    if (!this._vy) this._vy = 0;
    this._vy -= GRAVITY * dt;
    let y = this.pos.y + this._vy * dt;
    if (y <= groundY + 0.001) {
      if (!this.grounded && this._vy < -3.5) this.onLand?.(Math.abs(this._vy));
      y = groundY;
      this._vy = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      /* Only genuinely airborne once clear of the surface by more than the
       * heightfield's own sampling error, or a crowned road makes the car
       * flicker between grounded and flying. */
      this.grounded = (y - groundY) < 0.06;
      if (!this.grounded) this.airTime += dt;
    }
    this.pos.y = y;

    /* ── attitude ───────────────────────────────────────────────────────── */
    /* Pitch under braking and squat under power; roll into the corner. Both
     * from acceleration through a spring rate, in radians per g, and both
     * critically damped by a first-order filter rather than by a real damper. */
    const g = GRAVITY;
    const wantPitch = clamp(-this._ax / g, -1, 1) * 0.055;
    const wantRoll = clamp(this._ay / g, -1, 1) * 0.075;
    /* Plus the road itself: the difference between the front and rear wheel
     * pairs is a real gradient, and between left and right is a real camber. */
    const roadPitch = Math.atan2(
      (this._wheelY[0] + this._wheelY[1]) - (this._wheelY[2] + this._wheelY[3]),
      2 * WHEELBASE);
    const roadRoll = Math.atan2(
      (this._wheelY[0] + this._wheelY[2]) - (this._wheelY[1] + this._wheelY[3]),
      2 * TRACK);
    const k = 1 - Math.exp(-11 * dt);
    this.bodyPitch = lerp(this.bodyPitch, wantPitch + roadPitch, k);
    this.bodyRoll = lerp(this.bodyRoll, wantRoll - roadRoll, k);
    this.pitch = roadPitch;

    /* Wheel rotation, from the distance actually travelled — so the wheels
     * lock under braking and the tyres visibly stop. */
    const rolling = this.brake > 0.85 || this.handbrake > 0.5 ? 0 : this.vx;
    this.wheelSpin += (rolling / WHEEL_R) * dt;

    /* How hard the tyres are working, 0..1, for the skid sound and the smoke.
     * Peak lateral force means the tyre is at its limit by definition. */
    const latUse = Math.abs(fyF + fyR) / Math.max(1, gripTotal);
    const slipUse = smoothstep(PEAK_SLIP * 0.9, PEAK_SLIP * 2.6, Math.abs(slipR));
    this.skid = clamp(Math.max(latUse > 0.92 ? latUse : 0, slipUse)
      + (this.handbrake > 0 && Math.abs(vx) > 4 ? 0.6 : 0), 0, 1);
  }

  /* ── camera ────────────────────────────────────────────────────────────── */

  _updateCamera(dt) {
    const cam = this.camera;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);

    if (this.camMode === 'hood') {
      /* Driver's eye, right-hand drive because this is New Zealand. */
      const ex = this.pos.x + sinY * 0.10 + cosY * 0.36;
      const ez = this.pos.z + cosY * 0.10 - sinY * 0.36;
      cam.position.set(ex, this.pos.y + 1.14, ez);
      cam.rotation.set(0, 0, 0);
      cam.rotateY(this.yaw + (this.lookYaw ?? 0) + Math.PI);
      cam.rotateX(this.bodyPitch * 0.6 + (this.lookPitch ?? 0));
      cam.rotateZ(-this.bodyRoll * 0.8);
      cam.fov = lerp(this._baseFov, this._baseFov + 12,
                     smoothstep(0, TOP_SPEED, this.speed));
      cam.updateProjectionMatrix();
      return;
    }

    /* Chase. The rig sits behind and above, and both distances open up with
     * speed — a fixed chase camera makes 30 m/s look like 10 m/s because the
     * car occupies the same fraction of frame at both. */
    const fast = smoothstep(0, 48, this.speed);
    const back = lerp(5.6, 7.4, fast);
    const high = lerp(2.05, 2.45, fast);

    /* The rig follows the car's *heading*, not its velocity, and it lags.
     * Following velocity points the camera where the car is sliding, which
     * hides the slide — the one thing the player most needs to see. */
    const lookYaw = this.lookYaw ?? 0;
    const ry = this.yaw + lookYaw;
    const want = this._tmp.set(
      this.pos.x - Math.sin(ry) * back,
      this.pos.y + high,
      this.pos.z - Math.cos(ry) * back,
    );
    /* Never underground. A crest or a batter will otherwise put the rig
     * inside the hill and the frame goes to black. */
    const floor = this.terrain.height(want.x, want.z) + 0.85;
    if (want.y < floor) want.y = floor;

    if (!this._camInit) { this.camPos.copy(want); this._camInit = true; }
    /* Lag, and the rate is speed-dependent: a slack camera at low speed is
     * relaxed, and the same slack at 50 m/s loses the car entirely. */
    const follow = 1 - Math.exp(-lerp(4.5, 11.0, fast) * dt);
    this.camPos.lerp(want, follow);

    /* Aim ahead of the car rather than at it, and further ahead the faster it
     * goes. This is the part that makes a chase camera read as driving: the
     * player is looking where they are going, not at their own boot lid. */
    const lead = lerp(3.0, 15.0, fast);
    const target = this._tmp.set(
      this.pos.x + Math.sin(this.yaw) * lead,
      this.pos.y + 1.15 + (this.lookPitch ?? 0) * 6,
      this.pos.z + Math.cos(this.yaw) * lead,
    );
    if (!this._camLookInit) { this.camLook.copy(target); this._camLookInit = true; }
    this.camLook.lerp(target, 1 - Math.exp(-9 * dt));

    cam.position.copy(this.camPos);
    cam.up.copy(UP);
    cam.lookAt(this.camLook);
    /* Roll the frame slightly into the corner. Small — a few degrees — and it
     * is doing the job a camera operator's shoulder does. */
    cam.rotateZ(-this.bodyRoll * 0.35);

    /* Speed FOV. The single cheapest sensation of speed there is, and the
     * reason it works is that it is also true: a wider lens moves more of the
     * world past the frame edge per metre travelled. */
    cam.fov = lerp(this._baseFov, this._baseFov + 14, fast);
    cam.updateProjectionMatrix();
  }

  dispose() { this._detach?.(); }
}
