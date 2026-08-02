/* Run state, and the only thing that decides what has been collected.
 *
 * Two storage tiers, split by what the platform can afford to carry. The cloud
 * save is small, structural and authoritative: which records exist, how far
 * the walk got, how long it took. Photograph thumbnails stay local — twelve
 * JPEGs would eat most of the platform's 256 KB save budget for something that
 * is a nicety in the notebook rather than progress — and the notebook renders
 * fine without them.
 *
 * Writes are debounced because the platform rate-limits saves to twelve a
 * minute and a photographic run can easily produce three records in ten
 * seconds. The debounce is flushed on the events that mean "this session may
 * not get another frame": pagehide, visibility change and the finale.
 */
import * as platform from './platform.js';

/* Bumped to 2 when the save had to hold more than one level. */
const SAVE_VERSION = 2;
/* The level every version-1 save belongs to, because it was the only one. */
const V1_LEVEL = 'jungle';
const THUMB_KEY = 'jungle-trail/thumbs/v1';
const SAVE_DEBOUNCE_MS = 12_000;

export class RunState {
  /**
   * @param {{GLYPHS:Array, SUBJECTS:Array, TOTAL_RECORDS:number}} content
   *   The level's collection tables. Held rather than imported so that a
   *   restore is checked against the ids of the level being played.
   * @param {string} levelId which level's run this is, within the one save.
   */
  constructor(content, levelId) {
    this.content = content;
    this.levelId = levelId;
    /* Other levels' runs, held from the save that was read at boot so that
     * writing this one back does not delete them. Empty until a restore. */
    this._others = {};
    this.glyphs = new Set();
    /** id → framing quality in [0,1]. */
    this.photos = new Map();
    /** id → data URL. Local only; never enters the cloud save. */
    this.thumbs = new Map();
    this.furthestT = 0;
    /* Where the walker stood, in metres. Saved alongside furthestT rather than
     * derived from it, because the trail's two parameterisations disagree and
     * a restored position is the one thing a player notices immediately. */
    this.where = null;
    this.elapsedMs = 0;
    this.sunStep = 0;
    this.finished = false;
    this.finalScore = 0;
    this.restored = false;

    this._listeners = new Map();
    this._saveTimer = null;
    this._thumbKey = `${THUMB_KEY}.${levelId}`;
    this._loadThumbs();
  }

  /* ------------------------------------------------------------- events */

  on(event, fn) {
    let l = this._listeners.get(event);
    if (!l) this._listeners.set(event, l = new Set());
    l.add(fn);
    return () => l.delete(fn);
  }

  emit(event, payload) {
    const l = this._listeners.get(event);
    if (!l) return;
    // Copied before iterating: a discovery handler is allowed to unsubscribe
    // itself, which is exactly what the finale gate does.
    for (const fn of [...l]) fn(payload);
  }

  /* ------------------------------------------------------------ queries */

  get records() { return this.glyphs.size + this.photos.size; }
  get complete() { return this.records >= this.content.TOTAL_RECORDS; }
  hasGlyph(id) { return this.glyphs.has(id); }
  hasPhoto(id) { return this.photos.has(id); }

  /**
   * Completion first, time only as a tie-break.
   *
   * A board sorted by time would reward running straight down a trail whose
   * whole point is that you stop and look at it, so the record term is worth
   * far more than any plausible time difference: a single missed record costs
   * 1000, and even a two-hour walk only spends 720 against a perfect run's
   * head start. Quality is folded in at a small weight so that a careless shot
   * still counts but a considered one counts for slightly more.
   */
  score() {
    let quality = 0;
    for (const q of this.photos.values()) quality += q;
    const seconds = Math.round(this.elapsedMs / 1000);
    return Math.max(0,
      this.records * 1000
      + Math.round(quality * 120)
      - Math.min(2400, Math.round(seconds / 10)));
  }

  /* ------------------------------------------------------------ mutation */

  /** @returns {boolean} true when this was the first time. */
  addGlyph(id) {
    if (this.glyphs.has(id)) return false;
    this.glyphs.add(id);
    this.emit('record', { kind: 'glyph', id });
    this.scheduleSave();
    return true;
  }

  /** @returns {boolean} true when this shot was kept. */
  addPhoto(id, quality, thumb) {
    const prev = this.photos.get(id);
    const isNew = prev === undefined;
    // A retake only replaces the entry when it is actually better, so a
    // second, worse shot cannot cost a player the framing they already earned.
    if (!isNew && quality <= prev) return false;
    this.photos.set(id, quality);
    if (thumb) {
      this.thumbs.set(id, thumb);
      this._saveThumbs();
    }
    this.emit('record', { kind: 'photo', id, quality, retake: !isNew });
    this.scheduleSave();
    return true;
  }

  advance(t, x, z, yaw) {
    if (t > this.furthestT) this.furthestT = t;
    this.where = { x: round2(x), z: round2(z), yaw: round3(yaw) };
  }

  tick(dtMs) {
    if (this.finished) return;
    this.elapsedMs += dtMs;
  }

  /* ------------------------------------------------------------ persistence */

  /** This level's run, on its own. */
  _record() {
    const photos = {};
    for (const [id, q] of this.photos) photos[id] = Math.round(q * 1000) / 1000;
    return {
      glyphs: [...this.glyphs],
      photos,
      t: Math.round(this.furthestT * 1e4) / 1e4,
      where: this.where,
      elapsedMs: Math.round(this.elapsedMs),
      sunStep: this.sunStep,
      finished: this.finished,
      score: this.finalScore,
    };
  }

  /**
   * The whole save, which is every level's run and not just this one's.
   *
   * The other levels' records are carried through untouched from whatever was
   * read at boot. There is one save slot for the game, so a session that
   * serialized only the level it was playing would delete the other one every
   * twelve seconds — and it would do it silently, because the level erased is
   * by definition not the one on screen.
   */
  serialize() {
    return {
      v: SAVE_VERSION,
      levels: { ...this._others, [this.levelId]: this._record() },
    };
  }

  /**
   * Find this level's run inside a save, whatever shape that save is in.
   *
   * Version 1 was written before there was more than one level, so it is a
   * bare record with no level named on it. There is exactly one level it can
   * belong to — the only one that existed when it was written — and reading it
   * as anything else would hand a jungle walk's tablet ids to a level that has
   * no tablets. A player loading a v1 save into any other level correctly
   * finds nothing, rather than finding a corrupted something.
   *
   * @returns {object|null} the record, or null if this level has no run in it
   */
  _unpack(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.v === 1) {
      this._others = {};
      return this.levelId === V1_LEVEL ? data : null;
    }
    if (data.v !== SAVE_VERSION || !data.levels || typeof data.levels !== 'object') {
      return null;
    }
    const { [this.levelId]: mine, ...others } = data.levels;
    this._others = others;
    return mine && typeof mine === 'object' ? mine : null;
  }

  /**
   * Restore, ignoring anything the current content tables no longer contain.
   *
   * A save written before a subject was renamed must not resurrect that
   * subject as an uncountable thirteenth record, which is what a blind
   * `new Set(data.glyphs)` would do the first time this content is edited.
   */
  restore(data) {
    const rec = this._unpack(data);
    if (!rec) return false;
    const glyphIds = new Set(this.content.GLYPHS.map((g) => g.id));
    const subjectIds = new Set(this.content.SUBJECTS.map((s) => s.id));

    if (Array.isArray(rec.glyphs)) {
      for (const id of rec.glyphs) if (glyphIds.has(id)) this.glyphs.add(id);
    }
    if (rec.photos && typeof rec.photos === 'object') {
      for (const [id, q] of Object.entries(rec.photos)) {
        if (subjectIds.has(id) && Number.isFinite(q)) this.photos.set(id, Math.min(1, Math.max(0, q)));
      }
    }
    if (Number.isFinite(rec.t)) this.furthestT = Math.min(1, Math.max(0, rec.t));
    const w = rec.where;
    if (w && Number.isFinite(w.x) && Number.isFinite(w.z) && Number.isFinite(w.yaw)) this.where = w;
    if (Number.isFinite(rec.elapsedMs)) this.elapsedMs = Math.max(0, rec.elapsedMs);
    if (Number.isInteger(rec.sunStep)) this.sunStep = rec.sunStep;
    if (Number.isFinite(rec.score)) this.finalScore = rec.score;
    this.finished = !!rec.finished;
    this.restored = this.records > 0 || this.furthestT > 0.02;
    return this.restored;
  }

  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = null; void this.flush(); }, SAVE_DEBOUNCE_MS);
  }

  async flush() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    await platform.save.set(this.serialize());
  }

  _loadThumbs() {
    try {
      const raw = JSON.parse(localStorage.getItem(this._thumbKey) ?? 'null');
      if (raw && typeof raw === 'object') {
        for (const [id, url] of Object.entries(raw)) {
          if (typeof url === 'string' && url.startsWith('data:image/')) this.thumbs.set(id, url);
        }
      }
    } catch { /* a corrupt thumbnail cache is not worth reporting */ }
  }

  _saveThumbs() {
    try {
      localStorage.setItem(this._thumbKey, JSON.stringify(Object.fromEntries(this.thumbs)));
    } catch { /* over quota: the notebook falls back to text entries */ }
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }
