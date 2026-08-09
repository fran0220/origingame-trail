/* Does the car make a sound, and does the sound follow the car?
 *
 * The jungle's soundscape can be rendered offline because its synthesis is
 * pure; the car's is too, so most of this needs no browser at all. What does
 * need one is the graph — that the voices exist, are connected, and move when
 * the car does — so this drives the real level with a real AudioContext and
 * reads the gain nodes back.
 *
 * Usage: node tools/car-audio.mjs
 */
import { run } from './harness.mjs';
import { engineCycle, tyreBed, windBed, gearFor } from '../src/audio/car.js';

/* ── the pure half, in Node ─────────────────────────────────────────────── */
const rate = 48000;
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const seam = (a) => Math.abs(a[0] - a[a.length - 1]);

const cyc = engineCycle(rate, 60, 26, 0.5);
const seal = tyreBed(rate, 1.0, 'seal');
const grav = tyreBed(rate, 1.0, 'gravel');
const wind = windBed(rate, 1.0);

console.log('synthesis');
console.log(`  engine cycle   ${cyc.length} samples  rms ${rms(cyc).toFixed(3)}  loop seam ${seam(cyc).toFixed(3)}`);
console.log(`  tyre seal      rms ${rms(seal).toFixed(3)}   gravel rms ${rms(grav).toFixed(3)}`);
console.log(`  wind           rms ${rms(wind).toFixed(3)}`);

/* Gravel must actually differ from seal, or the surface crossfade is a lie. */
const diff = Math.abs(rms(grav) - rms(seal)) / rms(seal);
console.log(`  gravel vs seal  ${(diff * 100).toFixed(0)}% rms difference`);

/* The gearbox must climb, drop and climb — that shape is the whole point. */
const st = { gear: 0, wheelRadius: 0.34 };
const trace = [];
for (let kmh = 0; kmh <= 200; kmh += 4) {
  const g = gearFor(st, kmh / 3.6, 1, false);
  st.gear = g.gear;
  trace.push({ kmh, gear: g.gear + 1, rpm: Math.round(g.rpm) });
}
let drops = 0;
for (let i = 1; i < trace.length; i++) if (trace[i].rpm < trace[i - 1].rpm - 200) drops++;
console.log(`  gearbox        ${trace.at(-1).gear} gears used, ${drops} upshifts, ` +
            `rpm ${Math.min(...trace.map(t => t.rpm))}..${Math.max(...trace.map(t => t.rpm))}`);

/* ── the live graph, in a browser ───────────────────────────────────────── */
await run({ hash: 'manual&tier=high&level=lake', timeout: 600_000 }, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const g = window.__game, d = g.walker;
    g.begin();
    /* Unlock without a gesture, which is what the harness is for. */
    await g.ambience.unlock();
    const a = g.ambience;
    if (!a.car) return { error: 'no CarAudio built' };

    const read = () => ({
      engBody: +a.car.engBody.gain.gain.value.toFixed(4),
      engEdge: +a.car.engEdge.gain.gain.value.toFixed(4),
      seal: +a.car.seal.gain.gain.value.toFixed(4),
      gravel: +a.car.gravel.gain.gain.value.toFixed(4),
      wind: +a.car.wind.gain.gain.value.toFixed(4),
      rate: +a.car.engBody.src.playbackRate.value.toFixed(3),
      ...a.car.stats(),
    });

    const { drive } = await import('/tools/autodriver.mjs');
    const out = {};
    /* Stopped. */
    d.placeAt(0.30);
    for (const k in d.keys) d.keys[k] = false;
    for (let i = 0; i < 60; i++) { g.step(1 / 60); a.update(1 / 60); }
    out.idle = read();
    /* Accelerating hard. */
    d.keys.KeyW = true;
    for (let i = 0; i < 60 * 8; i++) { g.step(1 / 60); a.update(1 / 60); }
    out.flatOut = read();
    out.flatOutKmh = Math.round(d.speed * 3.6);
    /* On the gravel shoulder. */
    for (let i = 0; i < 60 * 6; i++) { drive(g); g.step(1 / 60); a.update(1 / 60); }
    d.keys.KeyD = true; d.keys.KeyA = false;
    for (let i = 0; i < 60 * 2; i++) { g.step(1 / 60); a.update(1 / 60); }
    out.offRoad = { ...read(), off: +d.offRoad.toFixed(2) };
    return out;
  });
  console.log('\nlive graph');
  for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(10)} ${JSON.stringify(v)}`);
});
