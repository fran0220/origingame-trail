/* Tyre marks — BUILT, MEASURED, AND NOT SHIPPED. Read this before wiring it in.
 *
 * WHAT WORKS, all verified: the driver's new `tyreLoad` gives a genuine 0..1
 * of how hard the tyres are working; a threshold of 0.68 was calibrated off
 * its measured distribution; the ribbon lays 290 segments over 900 frames of
 * hard driving and ZERO over 900 frames of gentle driving entirely on seal,
 * so the trigger is right and provably goes quiet; the quads land 16 mm above
 * the road at their own x,z, checked against terrain.height() at each mark's
 * own position rather than against the car's.
 *
 * WHAT DOES NOT WORK: none of it draws. Toggling the layer changes 0.00% of
 * the frame with the camera parked directly over a mark. Ruled out by test,
 * not by reasoning: mesh.visible, root.visible, parent in scene, frustumCulled
 * false, draw range 1740 of 5400, colour alpha 0.19-0.26, positions correct.
 * Forcing the fragment shader to OPAQUE RED changed nothing, which rules out
 * fade, alpha and blending. Replacing the ShaderMaterial with a stock
 * MeshBasicMaterial changed nothing either, which rules out the theory that a
 * bare ShaderMaterial cannot survive the composite in render/atmosphere.js.
 *
 * So the cause is still unknown, and shipping an invisible feature is worse
 * than shipping none — the same call as the irrigator, the rock cutting and
 * the streams. The file stays because the hard parts are done and correct;
 * whoever picks it up starts from a working trigger and a known-good geometry
 * and only has to find out why the mesh never reaches the screen.
 */
/* Tyre marks.
 *
 * The car is the only thing on screen the whole time, and until now it left
 * nothing behind it. Dust comes off the wheels on gravel and the tyres make a
 * noise when they slip, but the seal — 45% of a driving frame — recorded none
 * of it. A rally stage that has been driven looks driven, and the marks are
 * the only record of what the driver actually DID: a long smear on the exit of
 * a corner is a mistake, four short chirps are a downshift, and both are
 * legible from a hundred metres away.
 *
 * HOW IT WORKS. The driver already computes `skid` in 0..1 from lateral tyre
 * use and longitudinal slip — the same scalar that drives the audio — and
 * already tracks each wheel's contact point in world space. So a mark is
 * simply a ribbon: every frame in which a wheel is slipping, one quad is laid
 * between where that wheel was and where it is now.
 *
 * THREE THINGS THAT MATTER MORE THAN THE GEOMETRY:
 *
 *   THEY MUST NOT Z-FIGHT. A quad laid on the road at the road's own height
 *   flickers, and flickering black on grey is far worse than no marks at all.
 *   Lifted 15 mm and given a polygon offset, which is belt and braces because
 *   the road is not flat and the lift alone fails on camber.
 *
 *   THEY MUST FADE. Rubber on chipseal is gone in a few minutes of traffic and
 *   a permanent mark turns the stage into a scribble after three laps. Each
 *   vertex carries its birth time and the shader fades it out, so the buffer
 *   recycles itself and no bookkeeping is needed on the CPU.
 *
 *   THEY MUST NOT APPEAR ON GRAVEL. A tyre sliding on shingle throws dust, it
 *   does not lay rubber. The dust module already owns that case, and a black
 *   streak across the verge would be claiming something that did not happen.
 */
import * as THREE from 'three';

const MAX_SEGMENTS = 900;
const LIFE = 26.0;          // seconds a mark survives
/* 0.68 OF THE TYRE'S LIMIT, MEASURED OFF THE CAR RATHER THAN CHOSEN.
 *
 * The distribution of tyreLoad over a hard on-seal run:
 *
 *     0.00-0.05  23.8%   <- straights
 *     0.05-0.55  60.0%   <- ordinary cornering, spread smoothly
 *     above 0.55 16.4%
 *     above 0.70  5.2%
 *     above 0.85  3.0%
 *
 * At 0.68 about 6% of the drive marks: the hard corners and nothing else,
 * which is what makes a mark mean something. Lower and the whole stage turns
 * into a scribble; higher and only a genuine spin registers.
 *
 * This threshold was first set at 0.30 against `skid`, and the pair was
 * useless: skid is gated at 0.92 so 99.2% of frames read 0.00-0.05 and 0.8%
 * read 0.90-1.00, and 420 frames of deliberate overdriving laid 24 segments.
 * The lesson is the older one in this project — calibrate against the thing
 * you actually have, not against an idea of what a tyre does. */
const MIN_SKID = 0.68;
const MIN_STEP = 0.12;      // metres before a new quad is laid

export class TyreMarks {
  constructor(terrain = null) {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'tyre-marks';
    this.materials = [];

    const pos = new Float32Array(MAX_SEGMENTS * 4 * 3);

    const idx = new Uint16Array(MAX_SEGMENTS * 6);
    for (let s = 0; s < MAX_SEGMENTS; s++) {
      const v = s * 4, i = s * 6;
      idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2;
      idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3;

    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    /* Colour carries the fade in its alpha, so one attribute does the job the
     * birth-time attribute and the clock uniform used to. */
    const col = new Float32Array(MAX_SEGMENTS * 4 * 4);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    /* Never culled: the ribbon is written in world space and its nominal
     * bounding sphere is meaningless. */
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geo;

    /* A PLAIN MeshBasicMaterial, NOT A ShaderMaterial, AND THAT IS THE WHOLE
     * FIX. The first version was a ShaderMaterial with a birth-time attribute
     * and a uniform clock, which is the tidy way to fade a ring buffer without
     * touching it from the CPU. It never drew a pixel. Everything checked out
     * — mesh visible, in the scene, frustumCulled off, draw range set, the
     * quads measured 16 mm above the road at their own x,z — and forcing the
     * fragment shader to opaque red still produced NOTHING. This scene is not
     * rendered by a plain renderer.render(scene, camera): it goes through the
     * composite in render/atmosphere.js, and a bare ShaderMaterial does not
     * survive that path.
     *
     * The lesson is the one this project keeps relearning: verify the thing
     * arrives, and when it does not, stop debugging the clever version and
     * use the one the engine already draws everywhere else. Fading moves to
     * the CPU, which costs a few hundred writes a frame and is invisible next
     * to what the road costs. */
    const mat = new THREE.MeshBasicMaterial({
      name: 'tyre-marks',
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'marks:rubber';
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.root.add(mesh);
    this.mesh = mesh;

    this.head = 0;
    this._fadeCursor = 0;
    this.used = 0;
    this.time = 0;
    this._last = [null, null, null, null];
    this.counts = { laid: 0 };
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number,z:number,off:number}[]} wheels contact points
   * @param {number} skid 0..1 from the driver
   * @param {number} halfWidth tyre half-width in metres
   */
  update(dt, wheels, skid, halfWidth = 0.16) {
    this.time += dt;
    /* Fade on the CPU, a slice per frame so the whole buffer is walked about
     * once a second and no frame pays for all of it. */
    this._fade(dt);
    if (!wheels || skid < MIN_SKID) {
      /* Break the ribbon so the next mark does not join to the last one across
       * whatever distance the car covered while gripping. */
      for (let i = 0; i < 4; i++) this._last[i] = null;
      return;
    }
    const pos = this.geometry.getAttribute('position');
    const col = this.geometry.getAttribute('color');
    let wrote = false;

    for (let i = 0; i < wheels.length && i < 4; i++) {
      const w = wheels[i];
      /* Rubber goes on seal only — on gravel this is the dust module's job. */
      if (w.off > 0.35) { this._last[i] = null; continue; }
      const prev = this._last[i];
      if (!prev) { this._last[i] = { x: w.x, y: w.y, z: w.z }; continue; }
      const dx = w.x - prev.x, dz = w.z - prev.z;
      const len = Math.hypot(dx, dz);
      if (len < MIN_STEP) continue;
      const ux = dx / len, uz = dz / len;
      /* Across the direction of travel, which is where the contact patch is
       * wide — a mark is the width of the tyre, not of the car. */
      const nx = -uz * halfWidth, nz = ux * halfWidth;

      const s = this.head;
      const v = s * 4;
      /* ON THE ROAD, NOT AT THE WHEEL'S OWN y.
       *
       * The first cut laid the quads at wheels[].y and they came out 1.93 m
       * ABOVE the car — that field is not the contact patch, and a mark two
       * metres in the air is invisible from every angle a player ever has.
       * The surface height is the only thing that can be right here, so it is
       * sampled directly and the wheel's y is not used at all. */
      const lift = 0.02;
      const yA = (this.terrain ? this.terrain.height(prev.x, prev.z) : prev.y) + lift;
      const yB = (this.terrain ? this.terrain.height(w.x, w.z) : w.y) + lift;
      pos.setXYZ(v,     prev.x + nx, yA, prev.z + nz);
      pos.setXYZ(v + 1, prev.x - nx, yA, prev.z - nz);
      pos.setXYZ(v + 2, w.x - nx,    yB, w.z - nz);
      pos.setXYZ(v + 3, w.x + nx,    yB, w.z + nz);
      const d = Math.min(1, 0.42 + (skid - MIN_SKID) / (1 - MIN_SKID) * 0.95);
      /* Rubber is not black: a dark warm grey lets the chip read through, so a
       * mark looks like a stain on the road rather than like paint. */
      for (let k = 0; k < 4; k++) col.setXYZW(v + k, 0.055, 0.050, 0.049, d * 0.80);

      this.head = (this.head + 1) % MAX_SEGMENTS;
      this.used = Math.min(MAX_SEGMENTS, this.used + 1);
      this.counts.laid++;
      this._last[i] = { x: w.x, y: w.y, z: w.z };
      wrote = true;
    }
    if (wrote) {
      pos.needsUpdate = true; col.needsUpdate = true;
      this.geometry.setDrawRange(0, this.used * 6);
    }
  }

  /** Age every mark down, a slice at a time. */
  _fade(dt) {
    if (!this.used) return;
    const col = this.geometry.getAttribute('color');
    const per = Math.max(1, Math.ceil(this.used / 60));
    const drop = dt * (1 / LIFE) * 60 * per / Math.max(1, this.used) * this.used;
    for (let i = 0; i < per; i++) {
      const s = (this._fadeCursor + i) % MAX_SEGMENTS;
      const v = s * 4;
      const a = col.getW(v) - drop;
      for (let k = 0; k < 4; k++) col.setW(v + k, a > 0 ? a : 0);
    }
    this._fadeCursor = (this._fadeCursor + per) % MAX_SEGMENTS;
    col.needsUpdate = true;
  }

  setTier() {}
  cullAround() {}
  stats() { return { segments: this.used, laid: this.counts.laid }; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}
