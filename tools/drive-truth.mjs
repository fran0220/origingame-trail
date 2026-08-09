/* Can the stage be driven, and does the timing tell the truth?
 *
 * The gallery answers whether the level looks right from places nobody drives
 * to. This answers the other half, and it does it through the real input path
 * rather than by calling the physics directly: it holds keys down, exactly as
 * a player does, and reads back what the game believed happened.
 *
 * The assertions are deliberately about *consistency* rather than about
 * specific numbers. A test that pins the stage time to 47.3 s fails on every
 * tyre change and teaches nothing; a test that says the clock, the splits and
 * the distance covered all agree with one another catches the bugs that
 * actually occur — a gate that never fires, a timer that runs while staged, a
 * car that cannot reach the end, splits that arrive out of order.
 */
import { run } from './harness.mjs';

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

await run({ hash: 'manual&tier=high&level=lake', timeout: 420_000 }, async ({ page, errs }) => {
  const boot = await page.evaluate(() => {
    const g = window.__game;
    return {
      driving: !!g.driving,
      hasCar: !!g.car,
      hasRace: !!g.race,
      driverKind: g.walker?.constructor?.name ?? null,
      state: g.race?.stats?.().state ?? null,
    };
  });
  check(boot.driving, 'level did not select the driving locomotion');
  check(boot.hasCar, 'no car mesh was built');
  check(boot.hasRace, 'no stage was built');
  check(boot.driverKind === 'Driver', `player is a ${boot.driverKind}, not a Driver`);
  check(boot.state === 'staged', `stage began in "${boot.state}" rather than staged`);

  await page.evaluate(() => window.__game.begin());

  /* The clock must not run before the car does. */
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 90; i++) g.step(1 / 60);
  });
  const idle = await page.evaluate(() => window.__game.race.stats());
  check(idle.state === 'staged', 'stage started itself with the car stationary');
  check(idle.time === 0, `clock ran ${idle.time.toFixed(2)}s while staged`);

  /* Now drive it. An autopilot rather than a held key: this test is about the
   * stage and the timing, and a keyboard cannot steer a 1.3-tonne car around
   * 760 m of curve without either crashing or testing my steering rather than
   * the race. The throttle and the physics are entirely real; only the hands
   * are synthetic, and they steer by the same error signal a player uses —
   * where the road is, versus where the car points. */
  const drive = await page.evaluate(async () => {
    const g = window.__game, d = g.walker, trail = g.trail, THREE = window.THREE;
    const P = new THREE.Vector3();
    const log = { maxSpeed: 0, offRoadFrames: 0, frames: 0, splits: [] };
    const seen = new Set();
    const origToast = g.hud.toast.bind(g.hud);
    g.hud.toast = (t) => { log.splits.push(t.title); return origToast(t); };

    for (let i = 0; i < 60 * 240 && g.race.stats().state !== 'finished'; i++) {
      /* Aim at a point up the road, which is what a driver does. */
      const q = trail.nearest(d.pos.x, d.pos.z, {});
      trail.pointAt(Math.min(1, q.t + 0.018), P);
      const want = Math.atan2(P.x - d.pos.x, P.z - d.pos.z);
      let err = want - d.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;

      d.keys.KeyA = err < -0.012;
      d.keys.KeyD = err > 0.012;
      /* Lift for the corners, exactly as the grip requires. */
      const hot = Math.abs(err) > 0.055 || d.speed > 26;
      d.keys.KeyW = !hot;
      d.keys.KeyS = Math.abs(err) > 0.13 && d.speed > 17;

      g.step(1 / 60);
      log.frames++;
      if (d.speed > log.maxSpeed) log.maxSpeed = d.speed;
      if (d.offRoad > 0.75) log.offRoadFrames++;
    }
    const st = g.race.stats();
    return {
      ...log,
      state: st.state,
      time: st.time,
      splitTimes: [...g.race.splits],
      finishTime: g.race.finishTime ?? null,
      best: g.session.state.best,
      posT: trail.nearest(d.pos.x, d.pos.z, {}).t,
      length: trail.length,
    };
  });

  check(drive.state === 'finished',
        `never finished: state=${drive.state} after ${(drive.frames / 60).toFixed(0)}s, t=${drive.posT.toFixed(2)}`);
  check(drive.splitTimes.length === 5,
        `expected 5 splits, got ${drive.splitTimes.length}`);
  const ordered = drive.splitTimes.every((s, i, a) => i === 0 || s > a[i - 1]);
  check(ordered, `splits are not monotonic: ${drive.splitTimes.map(s => s.toFixed(2))}`);
  check(drive.finishTime > 0 && drive.finishTime === drive.splitTimes.at(-1),
        'finish time and the last split disagree');
  check(drive.maxSpeed > 18, `never got above ${(drive.maxSpeed * 3.6).toFixed(0)} km/h`);
  check(drive.best && Math.abs(drive.best.total - drive.finishTime) < 0.01,
        'the finish was not written to the save as a best time');

  /* A stage this length cannot honestly be covered in a handful of seconds,
   * and if it is, a gate is firing on the wrong side of the car. */
  const mean = drive.length / drive.finishTime;
  check(mean > 5 && mean < 60, `mean speed ${mean.toFixed(1)} m/s is not a drive`);

  /* Road-holding, and this is the assertion that earns this file.
   *
   * The autopilot above is a proportional steering controller with a lift and
   * a brake, which is to say it drives like a cautious human and nothing more
   * clever. If a car with a working tyre model is given that input it stays on
   * an 8.2 m road; if grip, load transfer, the steering sign or the speed
   * -sensitive lock is wrong, it does not, and the failure shows up here as a
   * number rather than as a vague sense that the car feels bad.
   *
   * The threshold is set well above what the model currently does — 7% of
   * frames with a wheel meaningfully off the seal, nearly all of it the two
   * fan crossings — so this catches a regression rather than pinning a tune.
   *
   * It has already earned it once. The same autopilot driven flat out ran 32%
   * off the road and finished ten seconds *slower* than the calm line, which
   * is the signature of a tyre model that saturates properly: overdriving is
   * slower, which is the entire subject of the physics in driver.js. */
  const offPct = 100 * drive.offRoadFrames / drive.frames;
  check(offPct < 18, `${offPct.toFixed(1)}% of frames were off the road`);

  /* Splits must be spread over the stage, not bunched. Two gates firing in
   * consecutive frames means arc-length progress was credited in one jump —
   * see the loop in Race.update(). */
  const gaps = drive.splitTimes.map((s, i, a) => i === 0 ? s : s - a[i - 1]);
  check(Math.min(...gaps) > 1.0,
        `two gates fired ${Math.min(...gaps).toFixed(3)}s apart: ${gaps.map(g => g.toFixed(2))}`);

  console.log(`  stage      ${drive.length.toFixed(0)} m`);
  console.log(`  time       ${drive.finishTime.toFixed(2)} s  (mean ${(mean * 3.6).toFixed(0)} km/h)`);
  console.log(`  top speed  ${(drive.maxSpeed * 3.6).toFixed(0)} km/h`);
  console.log(`  splits     ${drive.splitTimes.map(s => s.toFixed(2)).join('  ')}`);
  console.log(`  off road   ${offPct.toFixed(1)}% of frames`);

  for (const e of errs) fail.push(`console: ${e}`);
});

if (fail.length) {
  console.error('FAILED');
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('ok — the stage can be driven, and the clock agrees with the road');
