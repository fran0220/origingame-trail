/* Gameplay and interface sounds.
 *
 * These are synthesized live on the Web Audio graph rather than added to the
 * baked bank, and that split is deliberate. The bank exists because the
 * ambience is per-sample DSP that JS cannot run in real time — a cicada bed is
 * several filter evaluations per sample — and because the same buffers have to
 * be renderable offline in Node for measurement. A shutter click is neither: it
 * is a hundred milliseconds of envelope on two oscillators and a noise burst,
 * which the audio thread does for free, and nothing about the soundscape's
 * measured loop lengths depends on it.
 *
 * Everything routes into Ambience's master gain, so these sit under the same
 * compressor as the world and cannot clip it on their own.
 */

const NOISE_SECONDS = 1.5;

export class Cues {
  constructor(ambience) {
    this.ambience = ambience;
    this._noise = null;
    this._noiseCtx = null;
  }

  _bus() {
    const a = this.ambience;
    if (!a || !a.ready || !a.ctx || !a.master) return null;
    if (a.ctx.state !== 'running') return null;
    return { ctx: a.ctx, out: a.master };
  }

  /* One white-noise buffer, reused. Rebuilt if the context is ever replaced,
   * which a device change can do. */
  _noiseBuffer(ctx) {
    if (this._noise && this._noiseCtx === ctx) return this._noise;
    const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 0x2f6e2b1;
    for (let i = 0; i < n; i++) {
      // xorshift rather than Math.random: reproducible across runs, which
      // matters when a capture is compared frame to frame.
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      d[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
    }
    this._noise = buf;
    this._noiseCtx = ctx;
    return buf;
  }

  _noiseBurst(ctx, out, { at, dur, gain, type = 'bandpass', freq = 2000, q = 1 }) {
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + dur * 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(at, Math.random() * (NOISE_SECONDS - dur - 0.01));
    src.stop(at + dur + 0.02);
    return { filter: f, gain: g };
  }

  _tone(ctx, out, { at, dur, freq, gain, type = 'sine', detune = 0 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** A leaf-shutter camera: two mechanical clicks about 70 ms apart. */
  shutter() {
    const b = this._bus(); if (!b) return;
    const t = b.ctx.currentTime;
    this._noiseBurst(b.ctx, b.out, { at: t, dur: 0.035, gain: 0.30, freq: 3200, q: 0.9 });
    this._noiseBurst(b.ctx, b.out, { at: t + 0.004, dur: 0.09, gain: 0.10, freq: 700, q: 1.4 });
    this._noiseBurst(b.ctx, b.out, { at: t + 0.072, dur: 0.05, gain: 0.20, freq: 2400, q: 1.0 });
  }

  /** The camera coming up to the eye. Cloth and a small mechanism. */
  raise() {
    const b = this._bus(); if (!b) return;
    const t = b.ctx.currentTime;
    this._noiseBurst(b.ctx, b.out, { at: t, dur: 0.22, gain: 0.055, freq: 1400, q: 0.6 });
  }

  /** Graphite over paper over stone. Long, dry, and not musical. */
  rubbing(duration = 1.5) {
    const b = this._bus(); if (!b) return;
    const { ctx, out } = b;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.7;
    /* The sweep is the whole character of it: a hand moving across a tablet
     * changes the contact area, and a static filter reads as hiss instead. */
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(2600, t + duration * 0.45);
    f.frequency.linearRampToValueAtTime(1200, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.075, t + 0.12);
    g.gain.setValueAtTime(0.075, t + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  /** A record entering the notebook. A small struck bell, no attack transient. */
  record(high = false) {
    const b = this._bus(); if (!b) return;
    const { ctx, out } = b;
    const t = ctx.currentTime;
    const root = high ? 784 : 588;
    this._tone(ctx, out, { at: t, dur: 1.5, freq: root, gain: 0.052 });
    this._tone(ctx, out, { at: t + 0.02, dur: 1.1, freq: root * 1.5, gain: 0.026 });
    this._tone(ctx, out, { at: t + 0.05, dur: 0.7, freq: root * 2.99, gain: 0.010 });
  }

  /** Refused shot: no bell, just the mechanism refusing to trip. */
  deny() {
    const b = this._bus(); if (!b) return;
    const t = b.ctx.currentTime;
    this._noiseBurst(b.ctx, b.out, { at: t, dur: 0.06, gain: 0.06, freq: 420, q: 2.0 });
  }

  /** Time moving on. Low, wide and slow, under the ambience rather than over it. */
  sun() {
    const b = this._bus(); if (!b) return;
    const { ctx, out } = b;
    const t = ctx.currentTime;
    this._tone(ctx, out, { at: t, dur: 4.2, freq: 98, gain: 0.055, type: 'sine' });
    this._tone(ctx, out, { at: t + 0.1, dur: 3.6, freq: 147, gain: 0.030, type: 'sine' });
    this._tone(ctx, out, { at: t + 0.2, dur: 3.0, freq: 196, gain: 0.018, type: 'sine' });
  }

  page() {
    const b = this._bus(); if (!b) return;
    const t = b.ctx.currentTime;
    this._noiseBurst(b.ctx, b.out, { at: t, dur: 0.16, gain: 0.04, freq: 2800, q: 0.5 });
  }

  finale() {
    const b = this._bus(); if (!b) return;
    const { ctx, out } = b;
    const t = ctx.currentTime;
    [392, 588, 784, 1176].forEach((f, i) => {
      this._tone(ctx, out, { at: t + i * 0.28, dur: 3.4 - i * 0.4, freq: f, gain: 0.05 - i * 0.008 });
    });
  }
}
