/* The sound of hitting something, as a waveform.
 *
 * The car started colliding with the world last commit and did it in complete
 * silence — which is the same mistake, inverted, that the wheel dust fixed: a
 * significant event delivered through one channel only. Driving a rally car
 * into a power pole at 100 km/h is the loudest thing that can happen in this
 * level and it made no sound at all.
 *
 * Pure synthesis, like every other layer here: numbers in, Float32Array out,
 * no AudioContext and no node.
 *
 * WHAT A CAR CRASH ACTUALLY SOUNDS LIKE, and why one boom is not it.
 *
 * A body impact is not a single event. It is three, overlapping, and leaving
 * any of them out makes the other two sound like a door slamming:
 *
 *   THE STRIKE. Two to five milliseconds of broadband noise as the panel
 *   yields. This is almost the entire perceived loudness and almost none of
 *   the perceived character.
 *
 *   THE RING. Body panels are large thin steel plates, so they have real modes
 *   — a few hundred hertz, badly damped, inharmonic. This is what says
 *   "vehicle" rather than "impact", and it is the part a single noise burst
 *   has none of.
 *
 *   THE DEBRIS. A quarter to half a second of small scattered clatter as trim
 *   lets go and gravel is thrown. Without it the sound stops dead, and an
 *   impact that stops dead reads as a sample being cut off.
 *
 * The severity parameter moves all three, and NOT just the volume. A light
 * scrape is mostly ring with almost no strike; a heavy hit is mostly strike,
 * with the ring driven far enough to go nonlinear. Scaling one buffer by
 * amplitude gives a quiet crash rather than a light knock, and the difference
 * is obvious immediately.
 */

function rng(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = Math.imul(s, 0x846ca68b) >>> 0;
  s ^= s >>> 16; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A damped modal resonator, which is what a panel is. */
function ring(out, sampleRate, freq, q, gain, decay, seed) {
  const w = 2 * Math.PI * freq / sampleRate;
  const r = Math.exp(-w / (2 * q));
  const a1 = 2 * r * Math.cos(w), a2 = -r * r;
  const rand = rng(seed);
  let y1 = 0, y2 = 0;
  const damp = Math.exp(-1 / (decay * sampleRate));
  let env = 1;
  for (let i = 0; i < out.length; i++) {
    /* Excited by noise only during the strike; after that it rings down. */
    const drive = i < 0.004 * sampleRate ? (rand() * 2 - 1) : 0;
    const y = drive + a1 * y1 + a2 * y2;
    y2 = y1; y1 = y;
    env *= damp;
    out[i] += y * gain * env;
  }
}

/**
 * Render one impact.
 *
 * @param {object} opt
 * @param {number} opt.sampleRate
 * @param {number} opt.severity  0 = a scrape, 1 = a heavy hit
 * @param {number} opt.seed
 */
export function renderImpact({ sampleRate = 48000, severity = 0.5, seed = 1 } = {}) {
  const sev = Math.max(0, Math.min(1, severity));
  const seconds = 0.42 + sev * 0.55;
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(n);
  const rand = rng(seed);

  /* ── the strike ───────────────────────────────────────────────────────
   * Short, broadband, and steeply enveloped. Its length grows with severity
   * because a bigger deformation takes longer to happen. */
  const strikeLen = Math.round((0.0022 + sev * 0.0055) * sampleRate);
  let lp = 0;
  for (let i = 0; i < strikeLen; i++) {
    const t = i / strikeLen;
    /* A heavy hit is duller: more metal is moving, so the spectrum shifts
     * down. A scrape is bright because it is a small area of thin panel. */
    const cut = 0.72 - sev * 0.34;
    lp += ((rand() * 2 - 1) - lp) * cut;
    out[i] += lp * (1 - t) * (0.35 + sev * 0.65);
  }

  /* ── the ring ─────────────────────────────────────────────────────────
   * Four inharmonic modes. Inharmonic matters: harmonic ratios make a bell,
   * and a car that rings like a bell is comic rather than violent. */
  const base = 118 + rand() * 90;
  const modes = [
    [1.00, 0.55, 0.26], [1.73, 0.40, 0.19],
    [2.41, 0.28, 0.14], [4.07, 0.17, 0.08],
  ];
  modes.forEach(([mult, gain, dec], k) => {
    ring(out, sampleRate, base * mult, 26 + k * 9,
         gain * (0.30 + sev * 0.90) * 0.05,
         dec * (0.5 + sev * 0.9), (seed + k * 7919) >>> 0);
  });

  /* ── the debris ───────────────────────────────────────────────────────
   * Scattered grains, denser and longer with severity. Each is a tiny
   * filtered click, which is what a piece of trim landing on gravel is. */
  const grains = Math.round((6 + sev * 46));
  for (let gI = 0; gI < grains; gI++) {
    /* Clustered early and thinning out: debris does not arrive uniformly. */
    const at = Math.round(Math.pow(rand(), 1.9) * (n - 400)) + Math.round(0.02 * sampleRate);
    const len = 40 + Math.round(rand() * 260);
    const amp = (0.02 + rand() * 0.07) * (0.4 + sev * 0.9);
    const f = 900 + rand() * 4200;
    for (let i = 0; i < len && at + i < n; i++) {
      const t = i / len;
      out[at + i] += Math.sin(2 * Math.PI * f * i / sampleRate)
                   * Math.exp(-t * 7) * amp * (rand() * 0.5 + 0.5);
    }
  }

  /* Normalise, then re-apply severity as level. The SHAPE differs between a
   * scrape and a hit; the loudness is applied on top of that rather than
   * instead of it. */
  let peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  const level = 0.20 + sev * 0.78;
  if (peak > 0) { const k = level / peak; for (let i = 0; i < n; i++) out[i] *= k; }
  return { data: out, seconds };
}

/**
 * A small bank across the severity range.
 *
 * Rendered once. Picking the nearest by severity and detuning it with playback
 * rate gives variety without synthesising during a collision, which is exactly
 * the frame that cannot afford it.
 */
export function renderImpactBank(sampleRate = 48000, count = 5, seed = 0xC7A54) {
  const bank = [];
  for (let i = 0; i < count; i++) {
    const sev = count === 1 ? 0.5 : i / (count - 1);
    bank.push({ severity: sev, ...renderImpact({ sampleRate, severity: sev, seed: seed + i * 104729 }) });
  }
  return bank;
}
