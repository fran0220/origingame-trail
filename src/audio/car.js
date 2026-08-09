/* The car's voice, synthesised.
 *
 * Same split as the jungle's audio system, and for the same reason: everything
 * in here is pure — Float32Array in, Float32Array out, no Web Audio, no three,
 * no DOM — so it can be rendered and measured offline. The live graph that
 * plays these buffers is in levels/lake/carAudio.js.
 *
 * A car is not an ambience. The three beds in the lake's soundscape are loops
 * that fade against each other; an engine is a *pitched* source whose frequency
 * is the thing carrying the information, and it has to move continuously from
 * idle to the limiter without a seam. The standard way to do that, and the one
 * used here, is to synthesise one engine cycle at a reference speed and vary
 * the playback rate — which is exactly what a real engine does, since its note
 * is its firing frequency.
 */

/** Deterministic noise, so two runs of the offline renderer agree. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * One engine cycle, looped.
 *
 * A four-stroke four-cylinder fires twice per crank revolution, so its
 * fundamental is 2x crank frequency and the cycle repeats every two
 * revolutions. What makes an engine sound like an engine rather than like a
 * sawtooth at the same pitch is that the individual cylinder pulses are not
 * identical and not evenly spaced — real firing intervals scatter by a percent
 * or two, and that jitter is most of the "grain" a note has.
 *
 * Built as a sum of harmonics of the firing frequency with a decaying spectrum,
 * plus a per-pulse exhaust bark: a short noise burst through a resonant shape,
 * which is the part that gives the sound its edge under load.
 *
 * @param {number} rate       sample rate
 * @param {number} cycleHz    firing frequency of the reference cycle
 * @param {number} harmonics  how far up the series to build
 * @param {number} bark       0..1, how much per-pulse exhaust noise
 */
export function engineCycle(rate, cycleHz = 60, harmonics = 26, bark = 0.5, seed = 0x51a7) {
  /* An integer number of samples per cycle, so the loop point is sample-exact
   * and there is no click — a discontinuity here is audible at every single
   * repetition, which is several times a second. */
  const n = Math.max(2, Math.round(rate / cycleHz));
  const out = new Float32Array(n);
  const r = rng(seed);

  /* Harmonic stack. The 1/k^1.35 rolloff is steeper than a sawtooth's 1/k and
   * is what keeps it from sounding like a synth: a real exhaust is dominated by
   * its first few orders. Half-order components are what a four-cylinder gets
   * from its uneven manifold and are the difference between "engine" and
   * "buzzer". */
  for (let k = 1; k <= harmonics; k++) {
    const amp = Math.pow(k, -1.35) * (k % 2 === 0 ? 0.72 : 1.0);
    const phase = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      out[i] += amp * Math.sin((2 * Math.PI * k * i) / n + phase);
    }
  }
  for (let k = 1; k <= 5; k++) {
    const amp = 0.16 * Math.pow(k, -1.6);
    const phase = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) out[i] += amp * Math.sin((Math.PI * k * i) / n + phase);
  }

  /* Four pulses per cycle, jittered. */
  if (bark > 0) {
    for (let c = 0; c < 4; c++) {
      const at = Math.floor((c / 4 + (r() - 0.5) * 0.018) * n + n) % n;
      const len = Math.floor(n * 0.10);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.exp(-i / (len * 0.30));
        lp += ((r() * 2 - 1) - lp) * 0.45;
        out[(at + i) % n] += lp * env * bark * 0.9;
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  return out;
}

/**
 * Tyre roar on a surface, as a loopable noise bed.
 *
 * Rolling noise is broadband and its character is the *surface*, not the tyre:
 * chipseal is a coarse aggregate and roars around 800-1200 Hz, and loose gravel
 * adds an irregular rattle on top of the same roar. Both are made here from one
 * pink-ish noise with a different resonance and, for gravel, a sparse impulse
 * train that is stones actually hitting the arch liners.
 */
export function tyreBed(rate, seconds = 2.0, surface = 'seal', seed = 0x7ea1) {
  const n = Math.floor(rate * seconds);
  const out = new Float32Array(n);
  const r = rng(seed);
  let lp = 0, bp = 0, prev = 0;
  const res = surface === 'gravel' ? 0.22 : 0.12;
  for (let i = 0; i < n; i++) {
    const white = r() * 2 - 1;
    lp += (white - lp) * 0.35;                 // pink-ish body
    bp += (lp - prev - bp * res) * 0.5;        // one resonant pole for the roar
    prev = lp;
    out[i] = bp * 1.6;
  }
  if (surface === 'gravel') {
    /* Stones off the underbody: sparse, short, and much brighter than the
     * roar, which is what makes gravel instantly recognisable. */
    const hits = Math.floor(seconds * 90);
    for (let h = 0; h < hits; h++) {
      const at = Math.floor(r() * (n - 64));
      const amp = 0.35 + r() * 0.65;
      for (let i = 0; i < 48; i++) {
        out[at + i] += (r() * 2 - 1) * amp * Math.exp(-i / 7);
      }
    }
  }
  /* Crossfade the tail into the head so the loop has no seam. */
  const x = Math.min(Math.floor(rate * 0.12), Math.floor(n / 4));
  for (let i = 0; i < x; i++) {
    const t = i / x;
    out[i] = out[i] * t + out[n - x + i] * (1 - t);
  }
  let peak = 0;
  for (let i = 0; i < n - x; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  return out.subarray(0, n - x);
}

/** Wind past the shell: brighter and thinner than tyre roar, and it is the one
 *  that keeps rising when the throttle is shut. */
export function windBed(rate, seconds = 2.0, seed = 0x3c11) {
  const n = Math.floor(rate * seconds);
  const out = new Float32Array(n);
  const r = rng(seed);
  let hp = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const white = r() * 2 - 1;
    hp = 0.86 * (hp + white - last);
    last = white;
    out[i] = hp;
  }
  const x = Math.min(Math.floor(rate * 0.15), Math.floor(n / 4));
  for (let i = 0; i < x; i++) {
    const t = i / x;
    out[i] = out[i] * t + out[n - x + i] * (1 - t);
  }
  let peak = 0;
  for (let i = 0; i < n - x; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  return out.subarray(0, n - x);
}

/* ── the gearbox ────────────────────────────────────────────────────────────
 *
 * The engine note is the *only* thing that tells a player how hard the car is
 * working, and a note that rises monotonically with road speed tells them
 * nothing — it is a siren, not a car. Gears are what make the sound
 * informative: the note climbs, drops on the shift, and climbs again, and that
 * shape is how anyone judges acceleration by ear.
 */
export const GEARS = [3.55, 2.10, 1.42, 1.05, 0.84, 0.69];
const FINAL_DRIVE = 4.05;
const IDLE_RPM = 820;
const LIMIT_RPM = 6800;
const SHIFT_UP = 6350;
const SHIFT_DOWN = 2600;

/**
 * Which gear the box should be in, and the engine speed that follows.
 *
 * Hysteresis on purpose: shifting up at 6350 and down at 2600 leaves a wide
 * band where neither happens, which is what stops the box hunting between two
 * ratios at a constant road speed — audible as a stutter and the most common
 * fault in a naive implementation.
 *
 * @param {object} state  {gear, wheelRadius}
 * @returns {{gear:number, rpm:number, shifted:boolean}}
 */
export function gearFor(state, speedMs, throttle, reverse) {
  const wheelHz = Math.abs(speedMs) / (2 * Math.PI * (state.wheelRadius || 0.34));
  const at = (g) => wheelHz * GEARS[g] * FINAL_DRIVE * 60;
  let gear = Math.min(GEARS.length - 1, Math.max(0, state.gear | 0));
  let shifted = false;
  if (reverse) {
    gear = 0;
  } else {
    if (at(gear) > SHIFT_UP && gear < GEARS.length - 1) { gear++; shifted = true; }
    else if (at(gear) < SHIFT_DOWN && gear > 0) { gear--; shifted = true; }
  }
  /* Idle is a floor, not a separate state: below it the clutch is slipping and
   * the engine is simply turning at idle. */
  const rpm = Math.min(LIMIT_RPM, Math.max(IDLE_RPM + throttle * 260, at(gear)));
  return { gear, rpm, shifted };
}

export const RPM_RANGE = { idle: IDLE_RPM, limit: LIMIT_RPM };
