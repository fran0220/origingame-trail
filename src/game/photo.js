/* The field camera.
 *
 * Raising it narrows the lens, slows the head and puts a frame on the world;
 * the shutter judges what is inside that frame. The judgement is deliberately
 * about *framing* rather than about standing in the right place: a subject is
 * accepted when it is in the frame, unobstructed, at a distance it reads at,
 * and filling a sensible part of the picture. That is the only rule the game
 * asks a player to learn, and it is the same rule for a fern and a waterfall
 * because both are measured against their own size.
 *
 * Occlusion is a march over the heightfield, not a scene raycast. The terrain
 * is the only thing here that can hide a landmark completely — leaves do not,
 * which is why a scene raycast would be wrong as well as expensive: a shot of
 * the falls through a gap in the canopy is a shot of the falls.
 */
import * as THREE from 'three';
import { SUBJECTS } from './content.js';
import { resolveAnchor } from './anchors.js';

/* The viewfinder's frame as a fraction of the canvas, matching the mask in
 * index.html: 11vw off each side, 12vh off the top and bottom. Keeping the
 * numbers here and in the stylesheet in step matters, because this is what
 * decides whether what the player sees inside the frame is what gets judged. */
export const FRAME_X = 0.78;
export const FRAME_Y = 0.76;

const OPEN_FOV = 58;
const LENS_FOV = 34;
const ZOOM_TIME = 0.16;

/** A shot below this is refused rather than kept. */
export const MIN_QUALITY = 0.28;
/**
 * Fraction of the frame's half-height a well-filled subject occupies, so a
 * perfectly framed subject spans about two thirds of the picture's height.
 */
const IDEAL_FILL = 0.85;

/**
 * The distance a subject of this radius is best photographed from.
 *
 * Content authoring needs this and so does any test that wants to stand in a
 * good spot, and both used to have to rederive it from the projection. It is
 * the inverse of the fill calculation in _evaluate(): fill is
 * `(radius/distance) / tan(fov/2) / FRAME_Y`, so the ideal distance falls out
 * by solving that for distance at `fill = IDEAL_FILL`.
 */
export function idealDistance(radius, fovDeg = LENS_FOV) {
  return radius / (IDEAL_FILL * FRAME_Y * Math.tan(THREE.MathUtils.degToRad(fovDeg * 0.5)));
}

const _v = new THREE.Vector3();
const _ndc = new THREE.Vector3();

export class PhotoCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../player/controller.js').Walker} walker
   * @param {{trail:object, terrain:object, veg:object}} world
   */
  constructor(camera, walker, world) {
    this.camera = camera;
    this.walker = walker;
    this.terrain = world.terrain;
    this.raised = false;
    this.zoom = 0;              // 0 open, 1 fully at the lens
    this.target = null;         // the subject currently framed, or null
    this.quality = 0;
    /** Frame-relative box of the framed subject, for the viewfinder overlay. */
    this.box = null;
    /**
     * 'near' | 'far' | null — what is wrong with the framing, when something
     * is. Distance is the one framing mistake a player cannot see from inside
     * the viewfinder, because a badly filled frame and a well filled one both
     * look like a picture of the subject until the score appears.
     */
    this.advice = null;

    this.subjects = SUBJECTS.map((def) => {
      const ground = resolveAnchor(def.at, world);
      return {
        ...def,
        position: ground,
        /* The point the lens is judged against sits above the ground anchor by
         * the subject's own height, because a canopy and a pool are anchored
         * at the same z but photographed in completely different directions. */
        focus: new THREE.Vector3(ground.x, ground.y + (def.up ?? 0), ground.z),
      };
    });
  }

  byId(id) { return this.subjects.find((s) => s.id === id) ?? null; }

  /** Where this subject is best photographed from, in metres. */
  idealDistanceFor(subject) { return idealDistance(subject.radius, LENS_FOV); }

  setRaised(on) {
    if (this.raised === on) return false;
    this.raised = on;
    if (!on) { this.target = null; this.quality = 0; this.box = null; }
    return true;
  }

  update(dt) {
    const want = this.raised ? 1 : 0;
    if (this.zoom !== want) {
      const step = dt / ZOOM_TIME;
      this.zoom = want > this.zoom ? Math.min(want, this.zoom + step) : Math.max(want, this.zoom - step);
      const fov = OPEN_FOV + (LENS_FOV - OPEN_FOV) * ease(this.zoom);
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      // Slow the head in proportion to the lens, so a degree of wrist is a
      // constant amount of *frame* rather than a constant amount of world.
      this.walker.lookScale = fov / OPEN_FOV;
    }
    if (this.raised) this._evaluate();
  }

  /* ------------------------------------------------------------ judging */

  _evaluate() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    let best = null, bestQ = -1, bestBox = null, bestFill = 0, bestDist = 0;

    for (const s of this.subjects) {
      const dist = cam.position.distanceTo(s.focus);
      if (dist < s.range[0] || dist > s.range[1]) continue;

      _ndc.copy(s.focus).project(cam);
      if (_ndc.z > 1) continue;                       // behind the near plane
      const fx = _ndc.x / FRAME_X, fy = _ndc.y / FRAME_Y;
      if (Math.abs(fx) > 1 || Math.abs(fy) > 1) continue;

      /* Apparent half-size in NDC. The vertical axis is the honest one for a
       * perspective camera — the horizontal one has the aspect ratio baked
       * into it — so the subject's radius is measured against the frame's
       * half-height and the same number means the same thing in any window. */
      const halfNdc = (s.radius / dist) / Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
      const fill = halfNdc / FRAME_Y;

      if (!this._visible(cam.position, s.focus)) continue;

      const centred = 1 - Math.min(1, Math.hypot(fx, fy));
      /* Log-symmetric around the ideal so that half the right size and twice
       * the right size are penalised equally. A linear falloff would make
       * every distant subject "nearly perfect", which is the opposite of what
       * a photograph of it looks like. */
      const framed = 1 - Math.min(1, Math.abs(Math.log(Math.max(1e-3, fill) / IDEAL_FILL)) / Math.log(3.2));
      /* Clipped at the frame edge. A subject whose extent runs past the
       * border is a worse photograph than one that sits inside it, and this
       * is what stops "walk up and fill the screen" being the answer to
       * everything. */
      const fillX = fill * (FRAME_Y / FRAME_X);
      const spill = Math.max(0, Math.abs(fx) + fillX - 1) + Math.max(0, Math.abs(fy) + fill - 1);
      const q = Math.max(0, (centred * 0.42 + framed * 0.58) - spill * 0.45);

      if (q > bestQ) {
        bestQ = q;
        best = s;
        bestFill = fill;
        bestDist = dist;
        bestBox = {
          // Frame-relative percentages, ready for the overlay in index.html.
          left: (fx - fill * (FRAME_Y / FRAME_X) + 1) * 50,
          top: (1 - fy - fill) * 50,
          width: fill * (FRAME_Y / FRAME_X) * 100,
          height: fill * 100,
        };
      }
    }

    this.target = best;
    this.quality = best ? bestQ : 0;
    this.box = best ? bestBox : null;
    /** Metres to the framed subject — the one number a real viewfinder shows. */
    this.distance = best ? bestDist : 0;
    /* Only advise on shots that are actually worth improving. Nagging a player
     * who is already at 70% turns a hint into noise, and the number beside it
     * is telling them the same thing more precisely. */
    this.advice = !best || bestQ >= 0.62 ? null
      : bestFill < IDEAL_FILL ? 'far' : 'near';
  }

  /**
   * Is the ground between the eye and the subject?
   *
   * Marched rather than raycast: the heightfield answers a height query in
   * constant time, and forty of them is far cheaper than intersecting the
   * terrain mesh. The tolerance grows with distance because the heightfield is
   * sampled every half metre and a ridge line read exactly is a subject that
   * flickers in and out of view as the player breathes.
   */
  _visible(from, to) {
    _v.subVectors(to, from);
    const dist = _v.length();
    if (dist < 1e-3) return true;
    const steps = Math.min(48, Math.max(8, Math.round(dist / 1.5)));
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const x = from.x + _v.x * k;
      const z = from.z + _v.z * k;
      const y = from.y + _v.y * k;
      if (this.terrain.height(x, z) > y + 0.35 + dist * 0.01) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ shutter */

  /**
   * @returns {{subject:object, quality:number}|null} null when nothing in the
   *   frame is worth keeping, which the caller reports as a refused shot.
   */
  shoot() {
    if (!this.raised || !this.target || this.quality < MIN_QUALITY) return null;
    return { subject: this.target, quality: Math.min(1, this.quality) };
  }
}

function ease(x) { return x * x * (3 - 2 * x); }

/**
 * Crop the frame out of the drawing buffer and shrink it to a notebook plate.
 *
 * This has to be called in the same task as the render that produced the
 * frame. The renderer runs without `preserveDrawingBuffer`, so the buffer is
 * valid until the browser composites it, and reading it from a click handler
 * one task later reliably yields a blank image.
 */
export function captureThumbnail(canvas, width = 320) {
  const sx = Math.round(canvas.width * (1 - FRAME_X) * 0.5);
  const sy = Math.round(canvas.height * (1 - FRAME_Y) * 0.5);
  const sw = Math.round(canvas.width * FRAME_X);
  const sh = Math.round(canvas.height * FRAME_Y);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = Math.max(1, Math.round((width * sh) / sw));
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.6);
  } catch {
    // A tainted or lost context is not a reason to lose the record itself.
    return null;
  }
}
