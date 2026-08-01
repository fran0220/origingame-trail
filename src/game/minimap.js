/* The minimap and the compass.
 *
 * Both are 2D canvases rather than DOM, because both are drawings that change
 * every frame — a rotating map made of divs is a layout thrash, and a compass
 * strip is a hundred ticks scrolling past. Everything else in the HUD is text
 * and stays in the document where it belongs.
 *
 * The map is baked once into an offscreen image of the whole world and then
 * blitted through a rotation each frame. Redrawing terrain shading per frame
 * would be a quarter of a million height samples sixty times a second to
 * produce an image that never changes.
 *
 * What the map does *not* show is the point: an unrecorded tablet appears only
 * once the player is close enough to sense it, and then as an anonymous ring
 * with no identity. A map that marked all twelve would turn a game about
 * looking into a game about walking between icons.
 */
import * as THREE from 'three';
import { BOUNDS } from '../world/terrain.js';
import { BROOK_T0, BROOK_T1, brookOffset, SWALLOW } from '../world/brook.js';
import { POOL, SPILL_Z0, SPILL_Z1, spillCentre, spillHalf } from '../world/spillway.js';

/** Pixels per metre in the baked image. */
const PPM = 2;
/** View radii the M key cycles through, in metres. */
export const ZOOMS = [40, 100];

const TAU = Math.PI * 2;

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{trail:object, terrain:object}} world
   */
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.trail = world.trail;
    this.terrain = world.terrain;
    this.zoom = 0;
    this.size = 0;
    this.dpr = 1;
    this.base = null;
    this._t = 0;
  }

  /**
   * Bake the world image.
   *
   * Heights are read once into a Float32Array and the hillshade is taken from
   * *that* rather than from four more terrain queries per pixel: the gradient
   * of the sampled image is the gradient of the terrain, and doing it this way
   * is five times less work for a picture 180 pixels across.
   */
  bake() {
    const { x0, x1, z0, z1 } = BOUNDS;
    const w = this.bw = Math.round((x1 - x0) * PPM);
    const h = this.bh = Math.round((z0 - z1) * PPM);
    this.x0 = x0; this.z1 = z1;

    const hs = new Float32Array(w * h);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < h; j++) {
      const z = z1 + j / PPM;
      for (let i = 0; i < w; i++) {
        const v = this.terrain.height(x0 + i / PPM, z);
        hs[j * w + i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }

    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    const bctx = base.getContext('2d');
    const img = bctx.createImageData(w, h);
    const px = img.data;
    const span = Math.max(1e-3, hi - lo);

    for (let j = 0; j < h; j++) {
      const z = z1 + j / PPM;
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const nh = (hs[k] - lo) / span;

        /* Light from the map's upper left, which is where a reader expects it
         * on any printed map and is nothing to do with where the sun is. */
        const dx = hs[k + (i < w - 1 ? 1 : 0)] - hs[k - (i > 0 ? 1 : 0)];
        const dz = hs[k + (j < h - 1 ? w : 0)] - hs[k - (j > 0 ? w : 0)];
        let shade = clamp(0.5 + (dx + dz) * 0.42, 0.2, 1.5);

        /* Contour lines every two metres. A hillshade alone tells you where
         * the slopes are; the bands tell you how steep, which on this level is
         * the difference between a bank you can walk up and the terrace wall
         * you cannot. */
        const band = hs[k] * 0.5;
        if (band - Math.floor(band) < 0.075) shade *= 0.78;

        // Low ground reads cool and dark, high ground warm and pale.
        let r = clamp((34 + nh * 128) * shade, 0, 255);
        let g = clamp((50 + nh * 132) * shade, 0, 255);
        let b = clamp((34 + nh * 84) * shade, 0, 255);

        const o = k * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    this._water(bctx);

    /* The trail on top, drawn at its real width. It is the one feature on this
     * map a player navigates by, so it is the one thing not left to shading. */
    bctx.lineCap = 'round';
    bctx.lineJoin = 'round';
    for (const pass of [{ w: 5.0, c: 'rgba(0,0,0,.5)' }, { w: 3.0, c: 'rgba(226,205,158,.92)' }]) {
      bctx.beginPath();
      const s0 = this.trail.samples[0];
      bctx.moveTo(this.mx(s0.x), this.my(s0.z));
      for (const s of this.trail.samples) bctx.lineTo(this.mx(s.x), this.my(s.z));
      bctx.strokeStyle = pass.c;
      bctx.lineWidth = pass.w;
      bctx.stroke();
    }

    this.base = base;
    return this;
  }

  /**
   * The water, drawn from the geometry that made it.
   *
   * Not from Terrain.wetAt(): that field is *moisture*, and it reaches forty
   * metres out from the falls as spray. Painting it as water put a lake over
   * the whole ruins clearing. The pool, the channel, the spillway and the
   * swallow hole each know their own plan, so the map asks them.
   */
  _water(ctx) {
    ctx.fillStyle = 'rgba(46,104,118,.92)';
    ctx.strokeStyle = 'rgba(46,104,118,.92)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(this.mx(POOL.x), this.my(POOL.z), POOL.r * PPM, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.mx(SWALLOW.x), this.my(SWALLOW.z), SWALLOW.r * PPM, 0, TAU);
    ctx.fill();

    // The run below the pool, which is where the falls actually land.
    ctx.beginPath();
    let first = true;
    for (let z = SPILL_Z0; z >= SPILL_Z1; z -= 1) {
      const cx = spillCentre(z);
      const px = this.mx(cx + spillHalf(z)), py = this.my(z);
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    for (let z = SPILL_Z1; z <= SPILL_Z0; z += 1) {
      ctx.lineTo(this.mx(spillCentre(z) - spillHalf(z)), this.my(z));
    }
    ctx.closePath();
    ctx.fill();

    /* The brook, on the trail's own offset curve. An authored polyline would
     * be a second copy of a shape that is retuned every time the channel is,
     * and a stream drawn ten metres from where it babbles is worse than none.
     */
    const p = new THREE.Vector3(), tan = new THREE.Vector3();
    ctx.beginPath();
    for (let t = BROOK_T0; t <= BROOK_T1 + 1e-6; t += 0.002) {
      this.trail.pointAt(t, p);
      this.trail.tangentAt(t, tan).normalize();
      // Right of the direction of travel, matching Trail.nearest().side.
      const off = brookOffset(t);
      const x = p.x + -tan.z * off, z = p.z + tan.x * off;
      if (t === BROOK_T0) ctx.moveTo(this.mx(x), this.my(z));
      else ctx.lineTo(this.mx(x), this.my(z));
    }
    ctx.lineWidth = 2.6 * PPM;
    ctx.stroke();
  }

  mx(x) { return (x - this.x0) * PPM; }
  /* -Z is the top of the map: it is the direction the trail runs and the one
   * bearing every player in this level already has a feel for. */
  my(z) { return (z - this.z1) * PPM; }

  /** @param {number} size CSS pixels of the square canvas. */
  resize(size, dpr = window.devicePixelRatio || 1) {
    if (this.size === size && this.dpr === dpr) return;
    this.size = size;
    this.dpr = dpr;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
  }

  cycleZoom() {
    this.zoom = (this.zoom + 1) % ZOOMS.length;
    return ZOOMS[this.zoom];
  }
  get radiusM() { return ZOOMS[this.zoom]; }

  /**
   * @param {object} v { x, z, yaw, dt, marks: [{x,z,kind}] } where kind is
   *   'glyph' | 'photo' | 'sense'.
   */
  draw(v) {
    if (!this.base) return;
    this._t += v.dt ?? 0;
    const ctx = this.ctx;
    const S = this.size, R = S / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);

    const scale = R / (this.radiusM * PPM);

    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#0a0e0b';
    ctx.fillRect(0, 0, S, S);

    ctx.translate(R, R);
    ctx.rotate(v.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-this.mx(v.x), -this.my(v.z));

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0);

    for (const m of v.marks ?? []) {
      const px = this.mx(m.x), py = this.my(m.z);
      ctx.save();
      ctx.translate(px, py);
      // Undo the map rotation so a marker is never drawn on its side.
      ctx.rotate(-v.yaw);
      ctx.scale(1 / scale, 1 / scale);
      drawMark(ctx, m.kind, this._t);
      ctx.restore();
    }
    ctx.restore();

    // The player, always at the centre, always pointing up.
    ctx.save();
    ctx.translate(R, R);
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.6, 5.2);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.6, 5.2);
    ctx.closePath();
    ctx.fillStyle = '#e8eede';
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Rim, and the one bearing mark worth having on a rotating map.
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, TAU);
    ctx.strokeStyle = 'rgba(232,198,122,.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const nAng = v.yaw - Math.PI / 2;
    const nx = R + Math.cos(nAng) * (R - 11);
    const ny = R + Math.sin(nAng) * (R - 11);
    ctx.fillStyle = 'rgba(232,198,122,.9)';
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
  }
}

function drawMark(ctx, kind, t) {
  if (kind === 'sense') {
    /* Anonymous and pulsing: the map is allowed to say "something is here",
     * because the player can already hear that from the proximity sense. It is
     * not allowed to say what, or to show one they have not walked near. */
    const k = 0.5 + 0.5 * Math.sin(t * 3.4);
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 + k * 2.4, 0, TAU);
    ctx.strokeStyle = `rgba(232,198,122,${0.35 + k * 0.45})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = 'rgba(0,0,0,.7)';
  ctx.lineWidth = 1;
  if (kind === 'glyph') {
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fillStyle = '#e8c67a';
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, TAU);
    ctx.fillStyle = '#cfe0c0';
  }
  ctx.fill();
  ctx.stroke();
}

/* --------------------------------------------------------------- compass */

/**
 * The heading strip.
 *
 * Worth having even beside the map, because the two answer different
 * questions: the map says where things are, the strip says which way you are
 * facing while you look at the world rather than at the corner of the screen.
 * The trail marker is the one that earns its place — this level is built to be
 * walked off, and the way back is not always visible from where you wandered.
 */
export class Compass {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0; this.h = 0; this.dpr = 1;
  }

  resize(w, h, dpr = window.devicePixelRatio || 1) {
    if (this.w === w && this.h === h && this.dpr === dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /**
   * @param {number} yaw player heading
   * @param {number|null} trailBearing world bearing of the trail ahead, or null
   * @param {number} span visible arc in degrees
   */
  draw(yaw, trailBearing, span = 120) {
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pxPerDeg = w / span;
    /* Heading measured the way the map is drawn: 0 at -Z, growing clockwise,
     * so the letter at the centre of the strip is the letter at the top of the
     * minimap when the player turns to face it. */
    const headingDeg = norm360((-yaw * 180) / Math.PI);

    const at = (deg) => {
      let d = deg - headingDeg;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return w / 2 + d * pxPerDeg;
    };

    /* A band under the ticks. The strip sits over the middle of the sky, which
     * is the brightest thing in the frame; unbacked hairlines disappear into
     * it exactly when the player has walked out of the forest. */
    const bg = ctx.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, 'rgba(4,7,5,0)');
    bg.addColorStop(0.5, 'rgba(4,7,5,.66)');
    bg.addColorStop(1, 'rgba(4,7,5,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Ticks and letters are hairlines over whatever the player is looking at.
    ctx.shadowColor = 'rgba(0,0,0,.9)';
    ctx.shadowBlur = 3;

    for (let deg = 0; deg < 360; deg += 15) {
      const x = at(deg);
      if (x < -30 || x > w + 30) continue;
      const cardinal = deg % 90 === 0;
      const major = deg % 45 === 0;
      // Fade at the ends, so the strip reads as a band that continues rather
      // than a ruler that stops.
      const edge = Math.min(1, Math.min(x, w - x) / (w * 0.18));
      const a = Math.max(0, edge);
      ctx.strokeStyle = `rgba(232,238,222,${(cardinal ? 0.75 : major ? 0.5 : 0.28) * a})`;
      ctx.lineWidth = cardinal ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x, h - 1);
      ctx.lineTo(x, h - (cardinal ? 9 : major ? 7 : 4.5));
      ctx.stroke();
      if (cardinal) {
        ctx.fillStyle = `rgba(238,244,228,${0.96 * a})`;
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText('NESW'[deg / 90], x, 12);
      }
    }

    if (trailBearing !== null && trailBearing !== undefined) {
      const x = at(norm360((trailBearing * 180) / Math.PI));
      if (x > 4 && x < w - 4) {
        ctx.fillStyle = 'rgba(232,198,122,.95)';
        ctx.beginPath();
        ctx.moveTo(x, h - 2);
        ctx.lineTo(x - 5, h - 11);
        ctx.lineTo(x + 5, h - 11);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Where the player is actually looking, so the strip has a datum.
    ctx.shadowBlur = 4;
    ctx.fillStyle = 'rgba(238,244,228,.98)';
    ctx.beginPath();
    ctx.moveTo(w / 2, 6);
    ctx.lineTo(w / 2 - 4.5, 0);
    ctx.lineTo(w / 2 + 4.5, 0);
    ctx.closePath();
    ctx.fill();
  }
}

function norm360(d) { return ((d % 360) + 360) % 360; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

