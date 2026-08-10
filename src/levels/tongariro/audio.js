/* The sound of a saddle above the bushline.
 *
 * Every other level in this project is loud in a way this one cannot be. The
 * lake has sheep, a two-litre engine and water on shingle; the jungle has
 * birds, insects and a stream. Above 1600 m on an andesite volcano there are
 * no birds, no insects, no trees and no running water — there is wind, there
 * is steam coming out of the ground, and there is the noise your own boots
 * make on loose scoria. That is the entire palette, and the emptiness of it is
 * as much the place as the red rock is.
 *
 * THREE BEDS, and the balance between them IS the level:
 *
 *   WIND is not a background here, it is the loudest thing on the mountain and
 *   it never stops. It gets its own gust envelope built from incommensurate
 *   sines so it never repeats, and it gets LOUDER with altitude, because that
 *   is what actually happens as you come out of the valley onto the saddle.
 *
 *   STEAM is a narrow hiss, and it is the only sound in the level that has a
 *   PLACE. It comes up as you approach Red Crater and falls away behind you,
 *   which is what makes the vents feel like objects rather than an effect.
 *
 *   SCORIA underfoot. Loose volcanic gravel is unmistakable — a hard bright
 *   crunch with no soil in it at all, nothing like the soft litter of the
 *   jungle or the seal of the lake road.
 */
import { STAGES, trackElevation, DATUM, VERT } from './route.js';

const MASTER = 0.52;
const smooth = (p, v, now, tau = 0.25) => {
  if (p.setTargetAtTime) p.setTargetAtTime(v, now, tau);
  else p.value = v;
};

export class TongariroAmbience {
  constructor({ camera, walker, terrain, contextFactory, doc }) {
    this.camera = camera;
    this.walker = walker;
    this.terrain = terrain;
    this._makeCtx = contextFactory
      || (() => new (globalThis.AudioContext || globalThis.webkitAudioContext)());
    this.ready = false;
    this._disposed = false;
    this._unlocking = false;
    this._time = 0;
    this._sources = [];
    this._nextGrit = 0.4;

    /* Vent positions in trail parameter, matching steam.js. Held as t rather
     * than as world points because the only question asked of them is "how
     * far along am I from the nearest one", which is a 1-D question and does
     * not need a distance field. */
    this.vents = [0.700, 0.742, 0.768, 0.905];

    const prevStep = walker.onStep;
    walker.onStep = (...args) => { prevStep?.(...args); this._step(); };
    this._detachWalker = () => { walker.onStep = prevStep; };

    const d = doc !== undefined ? doc : (typeof document === 'undefined' ? null : document);
    if (d) {
      const attempt = () => {
        this.unlock().catch((e) => console.warn('[tongariro ambience] unavailable:', e?.message || e));
      };
      d.addEventListener('pointerdown', attempt, { once: true });
      d.addEventListener('pointerlockchange', attempt);
      this._detachDoc = () => {
        d.removeEventListener('pointerdown', attempt);
        d.removeEventListener('pointerlockchange', attempt);
      };
    }
  }

  async unlock() {
    if (this.ready || this._unlocking || this._disposed) return;
    this._unlocking = true;
    try {
      this.ctx = this._makeCtx();
      if (this.ctx.state === 'suspended') await this.ctx.resume?.();
      if (this._disposed) return;
      this._build();
      this.ready = true;
    } catch (err) {
      if (this.ctx?.close) { try { this.ctx.close(); } catch (_) { /* already dead */ } }
      this.ctx = null;
      throw err;
    } finally {
      this._unlocking = false;
    }
  }

  /* Pink-ish noise. `tilt` is how much low end survives: wind is nearly all
   * low, steam is nearly all high, and one generator with a knob is cheaper
   * than two beds of different noise. */
  _noise(seconds, tilt) {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(seconds * sr);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.074;
      b2 = 0.900 * b2 + w * 0.310;
      d[i] = (b0 + b1 + b2) * tilt + w * (1 - tilt) * 0.28;
    }
    return buf;
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(ctx.destination);

    this.beds = {};
    const bed = (name, seconds, tilt, type, freq, q, gain, pan = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = this._noise(seconds, tilt);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      if (q != null) f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g);
      if (ctx.createStereoPanner) {
        const pn = ctx.createStereoPanner(); pn.pan.value = pan;
        g.connect(pn); pn.connect(this.master);
      } else g.connect(this.master);
      /* Started at an offset that is not a simple fraction of the loop, so two
       * beds of different length never line up on a beat. */
      src.start(0, (seconds * 0.37) % seconds);
      this._sources.push(src);
      this.beds[name] = { source: src, gain: g, filter: f };
    };

    /* Durations deliberately incommensurate: 13.7, 9.1 and 6.3 share no
     * common multiple short enough to hear, so the bed never audibly loops. */
    bed('wind', 13.7, 0.92, 'lowpass', 620, 0.7, 0.20, -0.10);
    bed('gust', 9.1, 0.72, 'bandpass', 1450, 0.9, 0.00, 0.14);
    bed('steam', 6.3, 0.10, 'highpass', 2600, 0.6, 0.00, 0.0);
  }

  /** A boot on loose scoria: short, bright, no body. */
  _step() {
    if (!this.ready || this._disposed) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * 0.075);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      /* Two decays: a very fast one for the crush of the top layer and a
       * slower one for the grains still rolling after the foot has stopped.
       * The roll is what makes it scoria and not gravel on a path. */
      const env = Math.exp(-u * 46) * 0.8 + Math.exp(-u * 11) * 0.2;
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 900 + Math.random() * 500;
    const g = ctx.createGain(); g.gain.value = 0.16 + Math.random() * 0.07;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(now);
    src.stop(now + 0.12);
  }

  update(dt) {
    if (!this.ready || this._disposed) return;
    this._time += dt;
    const ctx = this.ctx, now = ctx.currentTime;
    const t = this.walker?.trailT ?? 0;

    /* WIND RISES WITH ALTITUDE. Real, and it is the single cue that tells a
     * player they have gained height without a number on screen: the valley is
     * sheltered, the saddle is not. Driven off the route's own elevation so it
     * cannot drift out of step with the terrain. */
    const alt = (trackElevation(t) - DATUM) / (1886 - DATUM);
    const exposure = 0.35 + 0.65 * Math.min(1, Math.max(0, alt));

    /* The gust envelope, from incommensurate sines so it never repeats. A
     * looped gust is the one thing that gives a wind bed away. */
    const g1 = Math.sin(this._time * 0.21) * 0.5 + 0.5;
    const g2 = Math.sin(this._time * 0.083 + 1.7) * 0.5 + 0.5;
    const g3 = Math.sin(this._time * 0.041 + 4.1) * 0.5 + 0.5;
    const gust = Math.pow(g1 * 0.45 + g2 * 0.35 + g3 * 0.20, 1.8);

    smooth(this.beds.wind.gain.gain, (0.10 + 0.16 * gust) * exposure, now, 0.4);
    smooth(this.beds.wind.filter.frequency, 480 + 520 * gust, now, 0.6);
    smooth(this.beds.gust.gain.gain, 0.14 * gust * exposure, now, 0.3);

    /* STEAM HAS A PLACE. Nearest vent in trail parameter, converted to a rough
     * distance so it comes up as you climb toward Red Crater and falls away
     * behind you — which is what makes the vents objects rather than a layer. */
    let near = 1;
    for (const v of this.vents) near = Math.min(near, Math.abs(t - v));
    /* 0.03 of the route is about 80 m; past that a fumarole is inaudible under
     * this much wind, which is true and also stops the hiss being everywhere. */
    const steam = Math.max(0, 1 - near / 0.03);
    smooth(this.beds.steam.gain.gain, 0.115 * steam * steam, now, 0.25);
    smooth(this.beds.steam.filter.frequency, 2200 + 1400 * steam, now, 0.4);
  }

  setPaused(paused) {
    if (!this.ready) return;
    smooth(this.master.gain, paused ? 0 : MASTER, this.ctx.currentTime, 0.08);
  }

  stats() {
    return { ready: this.ready, beds: this.beds ? Object.keys(this.beds).length : 0 };
  }

  dispose() {
    this._disposed = true;
    this._detachWalker?.();
    this._detachDoc?.();
    for (const s of this._sources) { try { s.stop(); } catch (_) { /* already stopped */ } }
    this._sources.length = 0;
    if (this.ctx?.close) { try { this.ctx.close(); } catch (_) { /* already closed */ } }
    this.ctx = null;
    this.ready = false;
  }
}
