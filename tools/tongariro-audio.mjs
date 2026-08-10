/* Does the mountain sound like a mountain?
 *
 * Runs in Node against a stub AudioContext, which is only possible because the
 * synthesis here is pure — no Web Audio call is made until unlock(), and every
 * decision the ambience makes is a number this can read back.
 *
 * It checks the three things that would make the soundscape wrong rather than
 * merely absent: that the wind rises with altitude (it is the level's only
 * altimeter), that steam is loud at a vent and SILENT away from one (otherwise
 * the fumaroles are a layer, not objects), and that the gust envelope never
 * repeats (a looped gust is what gives synthetic wind away).
 *
 * To see it go red, make exposure a constant in audio.js.
 */

/* Drive TongariroAmbience against a stub AudioContext and check that it makes
 * a graph, that wind rises with altitude, and that steam is loud AT a vent and
 * silent away from one. No browser: the whole point of the pure-synthesis rule
 * is that this is testable in Node. */
import { TongariroAmbience } from '../src/levels/tongariro/audio.js';

let nodes = 0;
const param = () => ({ value: 0, setTargetAtTime(v){ this.value = v; } });
const node = (extra = {}) => { nodes++; return {
  connect(){}, start(){}, stop(){}, gain: param(), frequency: param(), Q: param(),
  pan: param(), ...extra }; };
const ctx = {
  sampleRate: 48000, currentTime: 0, state: 'running', destination: node(),
  createGain: () => node(), createBiquadFilter: () => node(),
  createStereoPanner: () => node(), createBufferSource: () => node(),
  createBuffer: (ch, n) => ({ getChannelData: () => new Float32Array(n),
                              copyToChannel(){}, length: n }),
  resume: async () => {}, close(){},
};

const walker = { trailT: 0, onStep: null };
const amb = new TongariroAmbience({ camera: {}, walker, terrain: null,
                                    contextFactory: () => ctx, doc: null });
await amb.unlock();

const read = (t, seconds) => {
  walker.trailT = t; amb._time = seconds; amb.update(1 / 60);
  return { wind: +amb.beds.wind.gain.gain.value.toFixed(4),
           steam: +amb.beds.steam.gain.gain.value.toFixed(4) };
};
const valley = read(0.05, 20);
const saddle = read(0.60, 20);
const atVent = read(0.700, 20);
const away   = read(0.640, 20);
/* Gust must not repeat: sample the wind over two minutes and count distinct. */
const seen = new Set();
for (let s = 0; s < 120; s += 0.5) { walker.trailT = 0.6; amb._time = s; amb.update(1/60);
  seen.add(amb.beds.wind.gain.gain.value.toFixed(4)); }
let steps = 0; const realStep = amb._step.bind(amb);
amb._step = () => { steps++; realStep(); };
walker.onStep(); walker.onStep();

const fail = [];
if (!amb.ready) fail.push('ambience never became ready');
if (Object.keys(amb.beds).length !== 3) fail.push('expected three beds');
/* The wind is the level's altimeter: the valley is sheltered, the saddle is
 * not, and a player should hear the climb. */
if (!(saddle.wind > valley.wind * 1.5)) {
  fail.push(`wind does not rise with altitude: valley ${valley.wind}, saddle ${saddle.wind}`);
}
/* Steam must have a PLACE. If it is audible everywhere it is a layer, not a
 * set of vents, and the fumaroles stop being objects. */
if (!(atVent.steam > 0.05)) fail.push(`no steam at a vent: ${atVent.steam}`);
if (!(away.steam === 0)) fail.push(`steam audible 160 m from any vent: ${away.steam}`);
/* A looped gust is the one thing that gives a synthetic wind bed away. */
if (seen.size < 100) fail.push(`gust envelope repeats: only ${seen.size} distinct values in 120 s`);
if (steps !== 2) fail.push(`footsteps not wired: ${steps}`);

console.log(`  beds ${Object.keys(amb.beds).join(', ')} on ${nodes} nodes`);
console.log(`  wind  valley ${valley.wind}  saddle ${saddle.wind}  (x${(saddle.wind / valley.wind).toFixed(1)})`);
console.log(`  steam at vent ${atVent.steam}  160 m away ${away.steam}`);
console.log(`  gust  ${seen.size} distinct values over 120 s`);
amb.dispose();
if (fail.length) { console.error('\nFAIL — ' + fail.join('; ')); process.exit(1); }
console.log('\nok — the mountain makes the right noises');
