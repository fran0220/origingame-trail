/* Full-journey test: collect every record through the real input path.
 *
 * This drives the game the way a player does — window keydown for the rubbing
 * key, a canvas mousedown for the shutter — rather than calling the verbs
 * directly, because half of what can break here is the wiring: a prompt that
 * never appears, a key that the notebook swallows, a shutter that fires while
 * the camera is down. Calling `session._rub()` would pass with all of that
 * broken.
 *
 * Every subject is approached from a viewpoint derived from the same
 * projection the scorer uses, so a failure here means the content is
 * unreachable or the judging is wrong, not that the test guessed badly.
 *
 * Usage:  node tools/serve.mjs &  node tools/journey.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.JOURNEY_URL || 'http://localhost:8099/';
const TIMEOUT = Number(process.env.JOURNEY_TIMEOUT || 180_000);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: TIMEOUT });

/* Teleport, aim and step helpers live in the page so each one costs a single
 * round trip. Pointer lock cannot be granted to a headless page, so the
 * walker's own gate is opened by hand — it is the same flag the browser would
 * set, and nothing else about the input path is bypassed. */
await page.evaluate(() => {
  const g = window.__game;
  g.walker.enabled = true;

  window.__t = {
    /** Stand at a world point, looking at another. */
    stand(px, pz, look) {
      const w = g.walker;
      w.setAuto(null);
      w.pos.set(px, g.terrain.height(px, pz), pz);
      w.vel.set(0, 0, 0);
      w.verticalVelocity = 0;
      const eye = { x: px, y: w.pos.y + 1.66, z: pz };
      const dx = look.x - eye.x, dy = look.y - eye.y, dz = look.z - eye.z;
      w.yaw = Math.atan2(-dx, -dz);
      w.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      // Two steps: one to settle the camera onto the new position, one so the
      // gait's handheld noise is not still swinging when the shot is judged.
      g.step(1 / 60);
      g.step(1 / 60);
      g.render();
    },
    key(code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
    },
    frames(n) { for (let i = 0; i < n; i++) { g.step(1 / 60); g.render(); } },
    state() {
      const s = g.session.state;
      return { glyphs: [...s.glyphs], photos: Object.fromEntries(s.photos), records: s.records };
    },
  };
});

const results = { glyphs: [], photos: [], failures: [] };

/* Subjects are collected before tablets, and the order is load-bearing rather
 * than arbitrary: the last tablet stands at the falls and ends the run, and a
 * finished run puts the finale over the screen, which correctly swallows every
 * gameplay key. Rubbing that stone first would leave the photographic leg
 * testing nothing.
 */
/* --------------------------------------------------------------- subjects */

const subjects = await page.evaluate(() =>
  window.__game.session.photo.subjects.map((s) => ({
    id: s.id, title: s.title, radius: s.radius, range: s.range,
    focus: { x: s.focus.x, y: s.focus.y, z: s.focus.z },
  })));

// The camera has to be up for the whole photographic leg; raising it once and
// leaving it up is also what a player does.
await page.evaluate(() => { window.__t.key('KeyF'); window.__t.frames(20); });

for (const s of subjects) {
  const r = await page.evaluate(({ s }) => {
    const g = window.__game;
    const sess = g.session;

    /* Search the ring of directions around the subject at its ideal distance
     * for a viewpoint the terrain does not block, then fall back through
     * closer distances. This is the honest question the content has to answer:
     * is there anywhere a walker can stand and take this picture? */
    const want = sess.photo.idealDistanceFor(s);
    const dists = [want, want * 0.8, want * 1.25, s.range[0] * 1.15, s.range[1] * 0.85];
    let placed = null;
    for (const d of dists) {
      if (d < s.range[0] || d > s.range[1]) continue;
      for (let a = 0; a < 24 && !placed; a++) {
        const ang = (a / 24) * Math.PI * 2;
        const px = s.focus.x + Math.cos(ang) * d;
        const pz = s.focus.z + Math.sin(ang) * d;
        window.__t.stand(px, pz, s.focus);
        sess.photo.update(1 / 60);
        if (sess.photo.target?.id === s.id && sess.photo.quality >= 0.28) {
          placed = { ang, d, quality: sess.photo.quality };
        }
      }
      if (placed) break;
    }
    if (!placed) {
      sess.photo.update(1 / 60);
      return { placed: null, target: sess.photo.target?.id ?? null, quality: sess.photo.quality, recorded: false };
    }

    g.canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    window.__t.frames(3);
    return {
      placed: { d: +placed.d.toFixed(1), quality: +placed.quality.toFixed(3) },
      recorded: sess.state.hasPhoto(s.id),
      quality: sess.state.photos.get(s.id) ?? 0,
      thumb: !!sess.state.thumbs.get(s.id),
    };
  }, { s });

  results.photos.push({ id: s.id, ...r });
  if (!r.recorded) results.failures.push(`subject not photographable: ${s.id} (best target=${r.target}, q=${(r.quality ?? 0).toFixed(2)})`);
  else if (!r.thumb) results.failures.push(`subject has no thumbnail: ${s.id}`);
}

/* ---------------------------------------------------------------- tablets */

// The camera comes down first. A raised camera correctly suppresses the
// rubbing prompt — you cannot read a tablet through a viewfinder — so leaving
// it up would test the suppression rather than the tablets.
await page.evaluate(() => { window.__t.key('KeyF'); window.__t.frames(20); });

const tablets = await page.evaluate(() =>
  window.__game.session.glyphs.items.map((i) => ({
    id: i.id, title: i.title,
    focus: { x: i.focus.x, y: i.focus.y, z: i.focus.z },
    pos: { x: i.position.x, z: i.position.z },
  })));

for (const t of tablets) {
  const r = await page.evaluate(({ t }) => {
    const g = window.__game;
    /* Stand 1.6 m in front of the dressed face, which is where the tablet was
     * turned to be read from. Approaching from behind is a legitimate way to
     * find one, but it is not what this test is checking. */
    const yaw = g.session.glyphs.items.find((i) => i.id === t.id).mesh.rotation.y;
    const px = t.pos.x + Math.sin(yaw) * 1.6;
    const pz = t.pos.z + Math.cos(yaw) * 1.6;
    window.__t.stand(px, pz, t.focus);
    const aimed = g.session.aimed?.id ?? null;
    const promptShown = document.getElementById('prompt').classList.contains('show');
    window.__t.key('KeyE');
    window.__t.frames(2);
    return { aimed, promptShown, recorded: g.session.state.hasGlyph(t.id) };
  }, { t });

  results.glyphs.push({ id: t.id, ...r });
  if (!r.recorded) results.failures.push(`tablet not recorded: ${t.id} (aimed=${r.aimed})`);
  else if (!r.promptShown) results.failures.push(`tablet had no prompt: ${t.id}`);
}

/* ----------------------------------------------------------------- finale */

const finale = await page.evaluate(() => {
  const s = window.__game.session;
  return {
    records: s.state.records,
    complete: s.state.complete,
    finished: s.state.finished,
    score: s.state.finalScore,
    finaleShown: document.getElementById('finale').classList.contains('show'),
    sunStep: s.state.sunStep,
    rows: [...document.querySelectorAll('#finRows .r')].map((r) => r.textContent),
  };
});

console.log(JSON.stringify({ ...results, finale }, null, 2));

if (errors.length) {
  console.error(`\n${errors.length} console error(s):`);
  for (const e of errors) console.error('  ', e);
}
await browser.close();

if (results.failures.length || errors.length) {
  console.error(`\nFAILED: ${results.failures.length} content failure(s), ${errors.length} console error(s)`);
  process.exit(1);
}
console.log('\nok — every record collected through the real input path');
