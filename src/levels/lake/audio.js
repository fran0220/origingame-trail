/* Procedural alpine soundscape. No context or sample is created until the
 * first gesture; the three beds deliberately use incommensurate durations. */
import { shoreX } from './basin.js';
import { CarAudio } from './carAudio.js';
import { renderFlockBank } from '../../audio/sheep.js';

const MASTER = 0.58;
const smooth = (p, value, now, tau = 0.18) => {
  if (p.setTargetAtTime) p.setTargetAtTime(value, now, tau);
  else p.value = value;
};

export class LakeAmbience {
  constructor({ camera, walker, contextFactory, doc }) {
    this.camera = camera;
    this.walker = walker;
    this._makeCtx = contextFactory || (() => new (globalThis.AudioContext || globalThis.webkitAudioContext)());
    this.ready = false;
    this._disposed = false;
    this._unlocking = false;
    this._time = 0;
    this._nextBird = 13;
    this._nextBleat = 6;
    this._flocks = [];
    this._bleatBank = null;
    this._bleatBuffers = null;
    this._sources = [];

    const prevStep = walker.onStep, prevLand = walker.onLand;
    walker.onStep = (...args) => { prevStep?.(...args); };
    walker.onLand = (...args) => { prevLand?.(...args); };
    this._detachWalker = () => { walker.onStep = prevStep; walker.onLand = prevLand; };

    const d = doc !== undefined ? doc : (typeof document === 'undefined' ? null : document);
    if (d) {
      const attempt = () => { this.unlock().catch((e) => console.warn('[lake ambience] unavailable:', e?.message || e)); };
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
      /* The car is built on the same unlocked context as the beds, and only
       * once there is one — a browser will not start audio before a gesture,
       * so there is nothing to construct until the ambience has been let in. */
      if (this.walker && this.walker.gear !== undefined) {
        this.car = new CarAudio(this.ctx, this.master, this.walker);
      }
      this.ready = true;
    } catch (e) {
      try { await this.ctx?.close?.(); } catch { /* already closed */ }
      this.ctx = null;
      throw e;
    } finally { this._unlocking = false; }
  }

  _noise(seconds, colour) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), data = b.getChannelData(0);
    let seed = (seconds * 100003) | 0, last = 0;
    for (let i = 0; i < n; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const white = (seed >>> 0) / 0x7fffffff - 1;
      last += (white - last) * colour;
      data[i] = last;
    }
    return b;
  }

  /**
   * Hand the soundscape the real flock positions.
   *
   * Called by the level once LakeFarm exists. Without this the bleats would
   * have to be scattered at random, and a sheep heard where there is visibly
   * no sheep is worse than silence — the ear is very good at noticing that a
   * sound has no source, and it undermines every other sound in the mix.
   */
  setFlocks(flocks) { this._flocks = flocks || []; }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = MASTER; this.master.connect(ctx.destination);
    this.beds = {};
    const bed = (name, seconds, filter, freq, gain, pan = 0) => {
      const src = ctx.createBufferSource(); src.buffer = this._noise(seconds, name === 'wind' ? .008 : .08); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master); }
      else g.connect(this.master);
      src.start(0, (seconds * .37) % seconds); this._sources.push(src); this.beds[name] = { source: src, gain: g, filter: f };
    };
    /* The flock bank is rendered once, here, at the device's real sample
     * rate. Synthesising a bleat costs about a millisecond, which is fine
     * once and an audible hitch if done per call. */
    this._bleatBank = renderFlockBank(ctx.sampleRate, 12);
    this._bleatBuffers = this._bleatBank.map(({ data }) => {
      const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
      return b;
    });

    bed('wind', 11.3, 'lowpass', 1050, .16, -.12);
    bed('tussock', 7.7, 'bandpass', 3100, .055, .28);
    bed('shore', 13.9, 'lowpass', 720, .08, -.38);
    this._t0 = ctx.currentTime;
  }

  update(dt) {
    if (!this.ready || this._disposed) return;
    this._time += dt;
    this.car?.update(dt);
    const now = this.ctx.currentTime;
    const e = this.camera.matrixWorld?.elements;
    const x = e?.[12] ?? this.camera.position?.x ?? 0, z = e?.[14] ?? this.camera.position?.z ?? 0;
    // Deterministic, aperiodic-looking two-frequency control signal.
    const gust = .5 + .28 * Math.sin(this._time * .113) + .18 * Math.sin(this._time * .037 + 1.7);
    smooth(this.beds.wind.gain.gain, .10 + .14 * gust, now);
    smooth(this.beds.tussock.gain.gain, .025 + .075 * Math.max(0, gust), now, .3);
    const shoreDistance = Math.abs(x - shoreX(z));
    smooth(this.beds.shore.gain.gain, .025 + .18 / (1 + shoreDistance * .12), now, .35);
    if (this._time >= this._nextBird) { this._bird(now); this._nextBird += 19 + ((this._nextBird * 1.618) % 23); }
    if (this._time >= this._nextBleat) {
      this._bleat(now, x, z);
      /* Irregular. Stock call in bursts with long gaps, and anything close to
       * a fixed interval is heard as a machine within about three repeats. */
      this._nextBleat += 4.5 + ((this._nextBleat * 2.399) % 11);
    }
  }

  /**
   * One bleat, from the nearest flock that is actually within earshot.
   *
   * Distance does two things, and only doing the first is the usual mistake:
   * it makes the sound quieter, AND it takes the top off it. Air absorbs high
   * frequencies far faster than low ones, so a sheep at three hundred metres
   * is not a quiet sheep — it is a dull one. A distant call that keeps its
   * formants sounds like it is being played through a speaker beside you at
   * low volume, which is exactly what it is.
   */
  _bleat(now, x, z) {
    const ctx = this.ctx;
    if (!ctx.createBufferSource || !this._bleatBuffers || !this._flocks.length) return;
    let best = null, bestD = Infinity;
    for (const f of this._flocks) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bestD) { bestD = d; best = f; }
    }
    /* Out of earshot: stay silent rather than move the sheep to the listener.
     * A flock that is always audible no matter where you are is a flock that
     * is nowhere. */
    if (!best || bestD > 340) return;

    const i = (Math.abs(Math.round(this._time * 37)) % this._bleatBuffers.length);
    const src = ctx.createBufferSource();
    src.buffer = this._bleatBuffers[i];
    /* Bigger animals sound lower AND slower. Detuning by playback rate alone
     * is the cheap way and it is the right one here, because it moves the
     * formants with the pitch exactly as a larger vocal tract does. */
    src.playbackRate.value = 0.86 + ((i * 0.137) % 0.30);

    const g = ctx.createGain();
    g.gain.value = 0.30 / (1 + bestD * 0.055);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    /* 9 kHz next to you, down to about 700 Hz at the far edge of earshot. */
    lp.frequency.value = Math.max(650, 9000 * Math.exp(-bestD / 120));

    src.connect(lp); lp.connect(g);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      /* Which side of the road the flock is on. Not a true HRTF, but the only
       * cue that matters at this distance in a car doing 130. */
      pan.pan.value = Math.max(-0.85, Math.min(0.85, (best.x - x) / 70));
      g.connect(pan); pan.connect(this.master);
    } else g.connect(this.master);
    src.start(now);
  }

  _bird(now) {
    const ctx = this.ctx;
    if (!ctx.createOscillator) return;
    [0, .19].forEach((delay, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(1350 + i * 170, now + delay); o.frequency.exponentialRampToValueAtTime(1760 + i * 120, now + delay + .14);
      g.gain.setValueAtTime(.0001, now + delay); g.gain.exponentialRampToValueAtTime(.018, now + delay + .035); g.gain.exponentialRampToValueAtTime(.0001, now + delay + .32);
      o.connect(g); g.connect(this.master); o.start(now + delay); o.stop(now + delay + .34);
    });
  }

  setPaused(on) { if (this.master && this.ctx) smooth(this.master.gain, on ? 0 : MASTER, this.ctx.currentTime, .12); }

  dispose() {
    this.car?.dispose();
    this.car = null;
    if (this._disposed) return;
    this._disposed = true; this._detachDoc?.(); this._detachWalker?.();
    for (const s of this._sources) { try { s.stop(); } catch { /* stopped */ } }
    try { this.master?.disconnect(); } catch { /* absent */ }
    try { this.ctx?.close?.(); } catch { /* already closed */ }
    this.ready = false;
  }
}
