/* The live graph for the car's voice.
 *
 * Pure synthesis lives in audio/car.js; this is the only part that touches Web
 * Audio, which is the same split the jungle's soundscape uses. Nothing is
 * created until the ambience has unlocked a context on a user gesture — a
 * browser will not start audio before one, and constructing an AudioContext
 * early just produces a suspended object that has to be resumed anyway.
 *
 * Five voices, and each one is answering a different question the player has:
 *
 *   Engine — how hard is it working. Two layers an octave apart so the note
 *   has body at idle and edge at the limiter, pitched by playback rate off one
 *   synthesised cycle.
 *   Induction — is the throttle open. Filtered noise that only exists on load,
 *   and the fastest way to hear a lift.
 *   Tyre — how fast, and on what. Two beds, seal and gravel, crossfaded by the
 *   same surface term the physics uses for grip.
 *   Wind — how fast, when nothing else is happening. The one that keeps rising
 *   with the throttle shut.
 *   Squeal — am I past the limit. Gated on the tyre model's own slip.
 */
import { engineCycle, tyreBed, windBed, gearFor, RPM_RANGE } from '../../audio/car.js';

/* Reference firing frequency of the synthesised cycle. The playback rate is
 * (firing frequency now) / this, so keeping it near the middle of the range
 * keeps the resampling ratio close to 1 where the ear is most critical. */
const REF_HZ = 60;
const set = (p, v, now, tau = 0.05) => {
  if (p.setTargetAtTime) p.setTargetAtTime(v, now, tau); else p.value = v;
};

export class CarAudio {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {object} driver  the Driver — read, never written
   */
  constructor(ctx, destination, driver) {
    this.ctx = ctx;
    this.driver = driver;
    this.gearState = { gear: 0, wheelRadius: 0.34 };
    this.rpm = RPM_RANGE.idle;

    const rate = ctx.sampleRate;
    const buf = (data) => {
      const b = ctx.createBuffer(1, data.length, rate);
      b.getChannelData(0).set(data);
      return b;
    };
    const loop = (data, dest, gain = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = buf(data); src.loop = true;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(g); g.connect(dest); src.start();
      return { src, gain: g };
    };

    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(destination);

    /* ── engine ─────────────────────────────────────────────────────────── */
    /* Two cycles rather than one: a fat, low-harmonic layer that carries the
     * body, and a bright, barky layer for load. Crossfading between them with
     * throttle is what makes the difference between cruising and pulling
     * audible without changing the pitch. */
    this.engBody = loop(engineCycle(rate, REF_HZ, 18, 0.22, 0x51a7), this.out, 0);
    this.engEdge = loop(engineCycle(rate, REF_HZ, 34, 0.95, 0x2b19), this.out, 0);
    /* A gentle low-pass on the whole engine, opened by load. A closed throttle
     * is not just quieter, it is duller. */
    this.engTone = ctx.createBiquadFilter();
    this.engTone.type = 'lowpass'; this.engTone.frequency.value = 900; this.engTone.Q.value = 0.7;
    this.engBody.gain.disconnect(); this.engEdge.gain.disconnect();
    this.engBody.gain.connect(this.engTone); this.engEdge.gain.connect(this.engTone);
    this.engTone.connect(this.out);

    /* ── induction ──────────────────────────────────────────────────────── */
    this.ind = loop(windBed(rate, 1.7, 0x8f21), this.out, 0);
    this.indFilter = ctx.createBiquadFilter();
    this.indFilter.type = 'bandpass'; this.indFilter.frequency.value = 620; this.indFilter.Q.value = 1.1;
    this.ind.gain.disconnect(); this.ind.gain.connect(this.indFilter); this.indFilter.connect(this.out);

    /* ── tyres and wind ─────────────────────────────────────────────────── */
    this.seal = loop(tyreBed(rate, 2.2, 'seal', 0x7ea1), this.out, 0);
    this.gravel = loop(tyreBed(rate, 2.2, 'gravel', 0x4d02), this.out, 0);
    this.tyreTone = ctx.createBiquadFilter();
    this.tyreTone.type = 'lowpass'; this.tyreTone.frequency.value = 1400; this.tyreTone.Q.value = 0.6;
    this.seal.gain.disconnect(); this.gravel.gain.disconnect();
    this.seal.gain.connect(this.tyreTone); this.gravel.gain.connect(this.tyreTone);
    this.tyreTone.connect(this.out);

    this.wind = loop(windBed(rate, 2.0, 0x3c11), this.out, 0);

    /* ── squeal ─────────────────────────────────────────────────────────── */
    /* A tyre at the limit sings at a fairly definite pitch because it is a
     * structure resonating, not a surface roaring — so this is a narrow
     * resonant band rather than more noise. */
    this.squeal = loop(tyreBed(rate, 1.3, 'seal', 0x9911), this.out, 0);
    this.squealF = ctx.createBiquadFilter();
    this.squealF.type = 'bandpass'; this.squealF.frequency.value = 1180; this.squealF.Q.value = 7.5;
    this.squeal.gain.disconnect(); this.squeal.gain.connect(this.squealF); this.squealF.connect(this.out);

    this._shiftAt = -9;
    this._t = 0;
  }

  update(dt) {
    const d = this.driver, ctx = this.ctx, now = ctx.currentTime;
    this._t += dt;
    const speed = Math.abs(d.speed || 0);
    const throttle = Math.min(1, Math.max(0, d.throttle || 0));
    const reverse = d.gear === 'reverse';

    /* Read the driver's gearbox rather than running a second one.
     *
     * This used to call gearFor with its own state object, which meant the car
     * had two gearboxes: one here and, once the instruments needed to know
     * what gear it was in, one there. Two copies of a hysteretic state machine
     * fed the same inputs still diverge, because they latch on different
     * frames — the tachometer would show fourth while the engine sang third.
     * driver.js owns it now and both of us read the same numbers. */
    const g = { gear: d.gearIndex, rpm: d.rpm, shifted: d.shifted };
    /* The engine has inertia: it does not jump to a new speed on a shift, it
     * is dragged there by the clutch over a tenth of a second or so. Without
     * this the note steps and the shift sounds like an edit rather than a
     * mechanism. */
    const k = 1 - Math.exp(-dt * (g.shifted ? 9 : 16));
    this.rpm += (g.rpm - this.rpm) * k;
    if (g.shifted) this._shiftAt = this._t;

    /* Firing frequency of a four-stroke four: two firings per revolution. */
    const firing = (this.rpm / 60) * 2;
    const rateRatio = Math.max(0.25, Math.min(4, firing / REF_HZ));
    set(this.engBody.src.playbackRate, rateRatio, now, 0.03);
    set(this.engEdge.src.playbackRate, rateRatio, now, 0.03);

    const load = Math.min(1, throttle * 0.85 + (speed > 1 ? 0.15 : 0));
    const rev = (this.rpm - RPM_RANGE.idle) / (RPM_RANGE.limit - RPM_RANGE.idle);
    /* A brief cut on the shift, which is what an upshift actually sounds like
     * and what makes the gearbox legible. */
    const cut = Math.min(1, (this._t - this._shiftAt) / 0.11);
    const engLevel = (0.16 + 0.30 * load + 0.10 * rev) * cut;
    set(this.engBody.gain.gain, engLevel * (1 - 0.55 * load), now, 0.05);
    set(this.engEdge.gain.gain, engLevel * (0.25 + 0.85 * load) * (0.35 + 0.65 * rev), now, 0.05);
    set(this.engTone.frequency, 520 + 2600 * load + 1800 * rev, now, 0.06);

    set(this.ind.gain.gain, 0.10 * load * (0.3 + 0.7 * rev), now, 0.06);
    set(this.indFilter.frequency, 380 + 900 * rev, now, 0.08);

    /* Tyres. Level rises with speed and the two surfaces crossfade on the same
     * `offRoad` term the tyre model uses for grip, so what you hear and what
     * you can do agree. */
    const v = Math.min(1, speed / 45);
    const off = Math.min(1, Math.max(0, d.offRoad || 0));
    const roll = speed > 0.6 ? (0.05 + 0.42 * Math.pow(v, 1.25)) : 0;
    set(this.seal.gain.gain, roll * (1 - off), now, 0.08);
    set(this.gravel.gain.gain, roll * off * 1.35, now, 0.08);
    set(this.tyreTone.frequency, 420 + 2200 * v, now, 0.10);

    set(this.wind.gain.gain, 0.030 + 0.28 * Math.pow(v, 2.0), now, 0.10);

    const skid = Math.min(1, Math.max(0, d.skid || 0));
    set(this.squeal.gain.gain, skid > 0.55 ? (skid - 0.55) / 0.45 * 0.20 * (1 - off) : 0, now, 0.05);
    set(this.squealF.frequency, 950 + 420 * skid, now, 0.05);
  }

  stats() {
    /* gearState is vestigial now that driver.js owns the box; reporting it
     * here made this tool print gear 1 flat out while the engine was audibly
     * in fourth, because nothing has written to it since. */
    return { rpm: Math.round(this.rpm), gear: this.driver.gearIndex + 1 };
  }

  dispose() {
    for (const v of [this.engBody, this.engEdge, this.ind, this.seal, this.gravel, this.wind, this.squeal]) {
      try { v.src.stop(); } catch { /* already stopped */ }
      try { v.src.disconnect(); v.gain.disconnect(); } catch { /* gone */ }
    }
    try { this.out.disconnect(); } catch { /* gone */ }
  }
}
