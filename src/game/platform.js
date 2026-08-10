/* OriginGame platform adapter.
 *
 * The deployed page has `window.OG` injected by the platform before this
 * module runs; a `npm run serve` page does not. Everything below therefore has
 * two implementations and the game only ever sees this file's interface.
 *
 * The local fallback is a real fallback, not a stub: saves go to localStorage
 * so the walk is resumable while developing, and the leaderboard reports
 * honestly that there is no board rather than inventing ranks. A platform call
 * that fails must never take the render loop with it, so every await here is
 * wrapped and every failure degrades to the local behaviour.
 */

const OG = typeof window !== 'undefined' ? window.OG : undefined;
export const online = !!OG;

const LOCAL_SAVE_KEY = 'jungle-trail/save/v1';

function warn(what, err) {
  // One line, no stack: a platform hiccup is not a game bug and should not
  // fill a player's console with noise.
  console.warn(`[og] ${what} unavailable:`, err && err.message ? err.message : err);
}

/* ------------------------------------------------------------------ loading */

/**
 * OriginGame only gates the game shell. This game then owns loading because a
 * player chooses one large procedural level after the shell has opened, and
 * only the game knows which world-building stage is running.
 *
 * Idempotence is important: the picker/deep-link path releases the host as
 * soon as the local loading UI has painted, while the completed boot calls
 * ready() again as a safety net. The SDK must still observe exactly one call.
 */
let readyPromise = null;
export const loading = {
  async ready() {
    if (!readyPromise) {
      readyPromise = (async () => {
        try { await OG?.ready(); } catch (e) { warn('ready', e); }
      })();
    }
    await readyPromise;
  },
};

/* --------------------------------------------------------------------- save */

export const save = {
  async get() {
    if (OG?.save) {
      try {
        const data = await OG.save.get();
        if (data && typeof data === 'object') return data;
      } catch (e) { warn('save.get', e); }
    }
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  async set(data) {
    /* Written locally first and unconditionally. A cloud save that fails on a
     * flaky connection must not be the reason a player loses an hour of
     * walking, and the local copy is also what makes the fallback path above
     * meaningful when the platform recovers. */
    try { localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    if (!OG?.save) return;
    try { await OG.save.set(data); } catch (e) { warn('save.set', e); }
  },
};

/* ---------------------------------------------------------------- analytics */

export const analytics = {
  track(name, attributes) {
    try { OG?.analytics?.track(name, attributes); } catch (e) { warn('analytics.track', e); }
  },
  start(node, attributes) {
    try { OG?.analytics?.progression?.start(node, attributes); } catch (e) { warn('progression.start', e); }
  },
  complete(node, attributes) {
    try { OG?.analytics?.progression?.complete(node, attributes); } catch (e) { warn('progression.complete', e); }
  },
  async flush() {
    try { await OG?.analytics?.flush(); } catch (e) { warn('analytics.flush', e); }
  },
};

/* -------------------------------------------------------------- leaderboard */

export const leaderboard = {
  /** @returns {Promise<{rank:number}|null>} null when there is no board. */
  async submit(score) {
    if (!OG?.leaderboard) return null;
    try { return await OG.leaderboard.submit(Math.max(0, Math.round(score))); }
    catch (e) { warn('leaderboard.submit', e); return null; }
  },

  /** @returns {Promise<{top:Array, me:object|null}|null>} */
  async top(n = 8) {
    if (!OG?.leaderboard) return null;
    try { return await OG.leaderboard.top(n); }
    catch (e) { warn('leaderboard.top', e); return null; }
  },
};

/* ------------------------------------------------------------------- player */

export async function playerName() {
  if (!OG?.player) return null;
  try { return await OG.player.name(); } catch (e) { warn('player.name', e); return null; }
}
