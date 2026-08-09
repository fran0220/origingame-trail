/* Sheep, as a waveform.
 *
 * Pure synthesis: this file takes numbers and returns a Float32Array. It
 * creates no AudioContext, no node and no buffer — the level's Web Audio graph
 * is somebody else's problem, which is what makes this testable without a
 * browser and what keeps the same architecture the jungle's birds and the
 * car's engine already use.
 *
 * WHY A BLEAT IS HARD TO FAKE, and what actually identifies it.
 *
 * It is not the pitch. A sheep's fundamental sits around 200-380 Hz, which is
 * unremarkable — a great many things live there. Three other properties are
 * what make the sound unmistakable, and getting any of them wrong produces
 * something that reads as a toy:
 *
 *   1. THE WAVER. A bleat is frequency-modulated at roughly 20-35 Hz, deep
 *      enough to be heard as a rattle rather than as vibrato. This is the
 *      single most identifying feature. Musical vibrato is 5-7 Hz and gentle;
 *      a sheep's is fast and violent, because it is not vibrato at all — it is
 *      the vocal folds beating irregularly against each other.
 *
 *   2. THE VOWEL. The formants sit where a human "eh"/"aa" sits, which is
 *      exactly why the sound is describable in letters at all and why every
 *      language writes it down as some variation on "baa". Two resonances,
 *      near 700 Hz and 1900 Hz, do the whole job.
 *
 *   3. THE FALL. It starts a couple of semitones high and sags through its
 *      length, because the animal is running out of breath. A flat bleat
 *      sounds synthetic no matter how good the rest is.
 *
 * Lambs are not just ewes transposed up — they are higher AND cleaner AND
 * shorter, because a small larynx is more regular. That difference is worth
 * modelling: a flock of identical bleats reads as one sheep with an echo.
 */

/**
 * Deterministic noise, so a given seed always renders the same animal.
 *
 * The seed is avalanched before use. Plain xorshift seeded with small nearby
 * integers produces highly correlated first outputs, and the first outputs are
 * exactly what this file uses to choose duration and pitch — the first version
 * rendered a twelve-animal bank in which five had identical lengths to the
 * centisecond. A flock whose members share a duration reads as one sheep and
 * an echo, which is the specific failure this bank exists to avoid.
 */
function rng(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = Math.imul(s, 0x846ca68b) >>> 0;
  s ^= s >>> 16; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A one-pole resonator, used as a formant. Two of these in parallel are
 * enough for a vowel; a full vocal tract model would be inaudible at the
 * distance these are heard from. */
function resonate(input, out, sampleRate, freq, q, gain) {
  const w = 2 * Math.PI * freq / sampleRate;
  const r = Math.exp(-w / (2 * q));
  const a1 = 2 * r * Math.cos(w), a2 = -r * r;
  const norm = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const y = norm * input[i] + a1 * y1 + a2 * y2;
    y2 = y1; y1 = y;
    out[i] += y * gain;
  }
}

/**
 * Render one bleat.
 *
 * @param {object}  opt
 * @param {number}  opt.sampleRate
 * @param {number}  opt.seed        deterministic identity for this animal
 * @param {boolean} opt.lamb        higher, cleaner, shorter
 * @returns {{ data: Float32Array, seconds: number }}
 */
export function renderBleat({ sampleRate = 48000, seed = 1, lamb = false } = {}) {
  const r = rng(seed);
  const seconds = lamb ? 0.34 + r() * 0.26 : 0.52 + r() * 0.46;
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const glottis = new Float32Array(n);
  const out = new Float32Array(n);

  /* Ewes are lower and rougher; lambs higher and more regular. */
  const f0 = lamb ? 330 + r() * 130 : 195 + r() * 110;
  const waverHz = lamb ? 26 + r() * 9 : 19 + r() * 13;
  const waverDepth = (lamb ? 0.055 : 0.105) * (0.7 + r() * 0.6);
  const rough = lamb ? 0.10 : 0.26;

  /* Formants. The vowel is what makes it "baa" rather than a buzz. */
  const F1 = (lamb ? 780 : 690) * (0.92 + r() * 0.16);
  const F2 = (lamb ? 2100 : 1880) * (0.93 + r() * 0.14);

  let phase = 0, jitter = 0, lastFlow = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;

    /* The fall: about three semitones over the length of the call, plus a
     * slight rise in the first tenth as the animal gets going. */
    const contour = Math.pow(2, (0.28 * Math.min(1, t * 10) - 0.34 * t) / 12 * 12 / 12);
    /* The waver. Deep, fast, and slightly irregular — a perfectly periodic
     * modulation sounds like a synthesiser patch, which is exactly what it
     * would be. */
    jitter += (r() - 0.5) * rough * 0.06;
    jitter *= 0.985;
    const waver = 1 + waverDepth * Math.sin(2 * Math.PI * waverHz * i / sampleRate) + jitter;

    phase += 2 * Math.PI * f0 * contour * waver / sampleRate;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

    /* A GLOTTAL PULSE, and specifically one with a sharp closure.
     *
     * The first version used a squared raised cosine, on the theory that it
     * was "a cheap asymmetric pulse". Measuring the band energy showed the
     * spectrum collapsing above 600 Hz — normalised 1.00 / 0.32 / 0.01 / 0.01
     * — so the formants at 690 and 1880 Hz, which sit on the third and eighth
     * harmonics, had NOTHING TO RESONATE. A smooth pulse is very nearly a
     * sinusoid; the formants were being fed silence and the result was a
     * hum with two expensive filters on it.
     *
     * What produces harmonics is the DISCONTINUITY. A real larynx snaps shut,
     * and the sharp negative spike in the flow derivative at that instant is
     * where nearly all of the high-frequency energy in any voice comes from.
     * This is the Rosenberg model: a smooth opening, a faster closing, and the
     * derivative taken across the closure. */
    const u = phase / (2 * Math.PI);
    const T1 = 0.42, T2 = 0.16;          // open phase, closing phase
    let flow;
    if (u < T1) flow = 0.5 * (1 - Math.cos(Math.PI * u / T1));
    else if (u < T1 + T2) flow = Math.cos(Math.PI * (u - T1) / (2 * T2));
    else flow = 0;
    let g = (flow - lastFlow) * 12;      // derivative: the closure spike
    lastFlow = flow;
    /* Breath. Real animals leak air; a pure pulse train sounds electronic. */
    g += (r() - 0.5) * rough * 0.5;

    /* Envelope: fast attack, long decay, and a distinct closing on the tail
     * where the mouth shuts. */
    const attack = Math.min(1, t / 0.06);
    const release = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
    glottis[i] = g * attack * release * (0.55 + 0.45 * (1 - t * 0.5));
  }

  resonate(glottis, out, sampleRate, F1, 7.5, 1.0);
  resonate(glottis, out, sampleRate, F2, 9.0, 0.42);
  /* A little of the raw buzz keeps the low end present; formants alone are
   * thin at a distance where only the low end survives. */
  for (let i = 0; i < n; i++) out[i] += glottis[i] * 0.18;

  /* Normalise. The caller sets distance gain, so the source should always
   * arrive at full scale. */
  let peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  if (peak > 0) { const k = 0.92 / peak; for (let i = 0; i < n; i++) out[i] *= k; }

  return { data: out, seconds };
}

/**
 * A small bank of animals.
 *
 * Rendered once and reused, because synthesising a bleat costs about a
 * millisecond and doing it per call would be audible as a hitch. Twelve is
 * enough that a repeat is not recognisable — the ear identifies a flock by its
 * spread, not by individual voices.
 */
export function renderFlockBank(sampleRate = 48000, count = 12, seed = 0x5EEB) {
  const r = rng(seed);
  const bank = [];
  for (let i = 0; i < count; i++) {
    /* About a third lambs. A flock of nothing but ewes sounds like a much
     * smaller and much older group than it looks. */
    bank.push(renderBleat({ sampleRate, seed: (seed + i * 7919) >>> 0, lamb: r() < 0.34 }));
  }
  return bank;
}
