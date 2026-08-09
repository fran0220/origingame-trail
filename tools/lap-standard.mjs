/* The handling standard, as a gate.
 *
 * Every change to this project for the last several days has ended with me
 * running telemetry by hand and eyeballing five numbers against five
 * thresholds I keep retyping. That is a checklist, and a checklist is a thing
 * you skip on the run where it would have mattered. The terrain incision in
 * the previous commit is the case in point: it rewrote the function every
 * placement and the entire road profile is derived from, and the only reason I
 * was willing to touch it was that a lap could be measured afterwards.
 *
 * WHAT THESE NUMBERS ARE, because thresholds without provenance rot into
 * superstition:
 *
 *   pctOffRoad   The autodriver follows the racing line the road geometry
 *                implies. If a change to the alignment, the profile or the
 *                grip model makes that line leave the seal, the road and the
 *                car no longer agree about where the road is. Zero is the
 *                observed value; 5 is slack for noise.
 *
 *   laneRmsM     How well the car holds its lane. This is the single most
 *                sensitive number to a physics regression — it moved when the
 *                static loads were swapped and again when IZZ was wrong.
 *                Observed 1.26 m on a 4.1 m half-width.
 *
 *   laneMaxM     The worst single excursion. Catches a spike that an RMS
 *                would average away — one bad crest at 130 km/h is not a
 *                small thing even if the rest of the lap is tidy.
 *
 *   spinFrames   Frames with the car facing meaningfully away from its
 *                velocity. Must be exactly zero: a stage car that spins on a
 *                clean lap is not a stage car.
 *
 *   lostIt       Whether the driver ever had to be recovered. Also exactly
 *                zero, and it is the one that catches "the lap completed but
 *                only because something put the car back on the road".
 *
 *   meanKmh      Pace. Guards the opposite failure from all of the above: a
 *                change that makes the car crawl will keep every other number
 *                beautifully inside its bounds.
 *
 * Deliberately WIDE. This is a regression gate, not a lap-time target — its
 * job is to catch "the car no longer drives", not to freeze a tune. Anything
 * tight enough to fail on an honest handling change would be edited away the
 * first time it fired, and then it would be worth nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const STANDARD = {
  pctOffRoad: [0, 5],
  laneRmsM: [0, 2.5],
  laneMaxM: [0, 6.0],
  spinFrames: [0, 0],
  lostIt: [0, 0],
  meanKmh: [120, 999],
};

const TAG = '__gate';

execFileSync(process.execPath, ['tools/telemetry.mjs', TAG], { stdio: 'ignore' });
const lap = JSON.parse(readFileSync(`media/telemetry/${TAG}.json`, 'utf8'));

const failures = [];
for (const [key, [lo, hi]] of Object.entries(STANDARD)) {
  const v = lap[key];
  if (typeof v !== 'number' || Number.isNaN(v)) { failures.push(`${key} missing`); continue; }
  if (v < lo || v > hi) failures.push(`${key} = ${v} (want ${lo}..${hi})`);
}

const shown = Object.keys(STANDARD).map((k) => `${k} ${lap[k]}`).join('  ');
if (failures.length) {
  console.error('\nlap standard: REGRESSED');
  for (const f of failures) console.error(`  ${f}`);
  console.error(`  ${shown}\n`);
  process.exit(1);
}
console.log(`ok — the lap still drives: ${shown}`);
