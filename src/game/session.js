/* The run: input, progression, and everything that turns walking into a game.
 *
 * This is the only file that knows about all of the other ones, and that is
 * intentional — the systems below it (tablets, the camera, the notebook, the
 * platform adapter) have no idea a game is being played and can be tested or
 * replaced one at a time. What lives here is the wiring nobody else should
 * own: which key does what, when a record is worth a sound, when the sun is
 * allowed to move, and when a walk is over.
 */
import * as THREE from 'three';
import { Glyphs } from './glyphs.js';
import { Minimap, Compass, ZOOMS } from './minimap.js';
import { PhotoCamera, captureThumbnail } from './photo.js';
import { Cues } from './cues.js';
import { RunState } from './state.js';
import { chapterAt, GLYPHS, SUBJECTS, TOTAL_RECORDS } from './content.js';
import { formatTime } from './hud.js';
import * as platform from './platform.js';

/* The sun over the course of a full record set: high morning to low evening.
 * Rebaking the sky is not free — it is a cube render plus a PMREM prefilter —
 * so it moves once every couple of records rather than continuously, and it
 * moves at the moment a record lands, when the player is already stopped and
 * looking at a notification. */
const SUN_STEPS = 12;
const SUN_FROM = { elev: 46, azim: 132 };
const SUN_TO = { elev: 7, azim: 206 };

/** How close an unrecorded tablet has to be before the player can feel it. */
const SENSE_RANGE = 19;

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _tan = new THREE.Vector3();

export class Session {
  /**
   * @param {object} deps { game, hud, renderer, camera, canvas, walker,
   *                        trail, terrain, veg, collision, ambience }
   */
  constructor(deps) {
    this.game = deps.game;
    this.hud = deps.hud;
    this.camera = deps.camera;
    this.canvas = deps.canvas;
    this.walker = deps.walker;
    this.trail = deps.trail;

    const world = { trail: deps.trail, terrain: deps.terrain, veg: deps.veg };
    this.glyphs = new Glyphs(deps.renderer, world, deps.collision);
    this.photo = new PhotoCamera(deps.camera, deps.walker, world);
    this.cues = new Cues(deps.ambience);
    this.state = new RunState();
    this.minimap = new Minimap(this.hud.el.mapCanvas, world);
    this.compass = new Compass(this.hud.el.compass);
    /* Three states, not two: forty metres is the search radius, eighty is for
     * working out where in the level you are, and off is for the players this
     * whole overlay is an intrusion on. */
    this.mapMode = 0;

    this.chapter = null;
    this.aimed = null;         // the tablet currently under the reticle
    this.pendingShot = null;   // set by the shutter, consumed after the render
    this.paused = false;
    this._q = {};
    this._sunApplied = -1;
    this._nearId = null;       // the unrecorded tablet currently being sensed
    this._chapterDone = new Set();

    this._index();
    this.hud.setChapterIndex(this.chapterOf);
    this.minimap.resize(180);
    this.minimap.bake();
    this.compass.resize(420, 28);
    this._applyMapMode();

    this._bindInput();
    this.hud.onBookTab(() => this.hud.renderBook(this.state));
    this.hud.onFinaleAction(
      () => { this.hud.hideFinale(); this.hud.openBook(this.state); },
      () => { this.hud.hideFinale(); this._lock(); },
    );

    /* One last write on the way out. `pagehide` rather than `unload`, because
     * a bfcache restore fires it and `unload` is not guaranteed to run at all
     * on mobile; `visibilitychange` covers the tab-switch that never comes
     * back. Both are cheap and idempotent. */
    const persist = () => { void this.state.flush(); void platform.analytics.flush(); };
    addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
  }

  /* ------------------------------------------------------------ lifecycle */

  /**
   * File every record under the chapter it stands in.
   *
   * Derived from where the thing actually ended up rather than declared in
   * content.js, because half the anchors resolve against the terrain or the
   * nearest plant of a species — a chapter written into the table would be a
   * second source of truth that goes stale the first time a subject moves.
   */
  _index() {
    /* Keyed by kind *and* id: the two tables were written independently and
     * both of them have a `terrace`, so a bare id would file one record under
     * the other's chapter and count it twice. */
    this.chapterOf = new Map();
    this.byChapter = new Map();
    const file = (key, x, z) => {
      const ch = chapterAt(this.trail.nearest(x, z, this._q).t);
      this.chapterOf.set(key, ch);
      if (!this.byChapter.has(ch.id)) this.byChapter.set(ch.id, []);
      this.byChapter.get(ch.id).push(key);
    };
    for (const it of this.glyphs.items) file(`glyph:${it.id}`, it.position.x, it.position.z);
    for (const s of this.photo.subjects) file(`photo:${s.id}`, s.position.x, s.position.z);
  }

  /** How many of a chapter's records the player has, and how many there are. */
  _chapterProgress(chapterId) {
    const keys = this.byChapter.get(chapterId) ?? [];
    let done = 0;
    for (const key of keys) {
      const id = key.slice(key.indexOf(':') + 1);
      if (key.startsWith('glyph:') ? this.state.hasGlyph(id) : this.state.hasPhoto(id)) done++;
    }
    return { done, total: keys.length };
  }

  /** Restore a previous walk, if the platform or this browser has one. */
  async restore() {
    const data = await platform.save.get();
    if (!this.state.restore(data)) return false;
    // Put the walker back where the save left it before the first frame, so
    // the player never sees the trailhead flash past. A save from before
    // positions were recorded still resumes, just snapped back onto the trail.
    const w = this.state.where;
    if (w) this.walker.setAuto(null).placeAtPoint(w.x, w.z, w.yaw);
    else this.game.goTo(this.state.furthestT);
    this._applySun(true);
    this.refreshCounters();
    return true;
  }

  begin() {
    this._syncChapter(true);
    if (this.state.restored) {
      this.hud.toast({
        kind: '继续', title: '回到你上次停下的地方',
        sub: `已记录 ${this.state.records}/${TOTAL_RECORDS} · ${formatTime(this.state.elapsedMs)}`,
      });
    }
  }

  /* ---------------------------------------------------------------- input */

  _bindInput() {
    const down = (e) => {
      if (e.code === 'Tab') { e.preventDefault(); this._toggleBook(); return; }
      if (this.hud.bookOpen || this.hud.finaleOpen) return;
      if (!this.walker.enabled) return;

      if (e.code === 'KeyE') { e.preventDefault(); this._rub(); }
      else if (e.code === 'KeyF') { e.preventDefault(); this._toggleCamera(); }
      else if (e.code === 'KeyM') { e.preventDefault(); this._cycleMap(); }
      else if (e.code === 'KeyH') { e.preventDefault(); this.hud.toggleBare(); this.cues.page(); }
    };
    addEventListener('keydown', down);

    /* The canvas click is already spoken for: the walker uses it to take
     * pointer lock. Only once locked does a click mean the shutter, which is
     * also why the camera cannot be fired from the pause screen. */
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.walker.enabled) return;
      if (this.photo.raised) { e.preventDefault(); this._shoot(); }
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.paused = !locked && !this.hud.bookOpen && !this.hud.finaleOpen;
      this.hud.setPaused(this.paused);
      if (!locked && this.photo.raised) this._toggleCamera();
    });
  }

  _toggleBook() {
    const opening = !this.hud.bookOpen;
    if (opening) {
      if (this.photo.raised) this._toggleCamera();
      document.exitPointerLock();
      this.hud.openBook(this.state);
      this.hud.setPaused(false);
      platform.analytics.track('game.notebook.opened', { records: this.state.records });
    } else {
      this.hud.closeBook();
      this._lock();
    }
    this.cues.page();
  }

  /**
   * Take pointer lock without letting a refusal reach the console.
   *
   * Newer browsers return a promise here, and it rejects for reasons that are
   * not faults: the document is not focused, the user pressed Escape inside
   * the lock cooldown, or the page is being driven headlessly. An unhandled
   * rejection from any of those reads as a crash in the error telemetry.
   */
  _lock() {
    try {
      const r = this.canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* not lockable in this context */ }
  }

  _toggleCamera() {
    const on = !this.photo.raised;
    this.photo.setRaised(on);
    this.hud.setFinder(on);
    if (on) {
      this.cues.raise();
      platform.analytics.track('game.camera.raised', { trailT: round3(this._trailT()) });
    }
  }

  /* --------------------------------------------------------------- verbs */

  _rub() {
    const target = this.aimed;
    if (!target) return;
    if (this.state.hasGlyph(target.id)) {
      this.hud.toast({ kind: '已拓印', title: target.title });
      return;
    }
    this.cues.rubbing();
    this.state.addGlyph(target.id);
    this.hud.toast({ kind: '拓片', title: target.title, sub: firstLine(target.text) });
    this._onRecord('glyph', `glyph:${target.id}`);
    platform.analytics.track('game.glyph.rubbed', {
      glyphId: target.id,
      trailT: round3(this._trailT()),
      offTrailM: round3(this._offTrail()),
      elapsedS: Math.round(this.state.elapsedMs / 1000),
    });
    /* The last tablet stands at the foot of the falls and says the walk is
     * over. Ending there rather than on a full collection means the run always
     * has a reachable ending — the notebook can still be finished afterwards,
     * and completing it shows the finale again with the better score. */
    if (target.id === 'last') this._finish('你走到了瀑布');
  }

  _shoot() {
    const shot = this.photo.shoot();
    if (!shot) {
      this.cues.deny();
      this.hud.toast({ kind: '未收录', title: '画面里没有可记录的东西', sub: '走近一些，或把目标放进取景框' });
      platform.analytics.track('game.photo.refused', { trailT: round3(this._trailT()) });
      return;
    }
    this.cues.shutter();
    this.hud.flashShutter();
    // The thumbnail cannot be read here: the drawing buffer belongs to the
    // frame loop. afterRender() picks this up on the next rendered frame.
    this.pendingShot = shot;
  }

  /** Called by the frame loop immediately after render(), in the same task. */
  afterRender() {
    const shot = this.pendingShot;
    if (!shot) return;
    this.pendingShot = null;

    const thumb = captureThumbnail(this.canvas);
    const first = !this.state.hasPhoto(shot.subject.id);
    const kept = this.state.addPhoto(shot.subject.id, shot.quality, thumb);
    const pct = Math.round(shot.quality * 100);

    if (first) {
      this.cues.record(true);
      this.hud.toast({ kind: '图鉴', title: shot.subject.title, sub: `构图 ${pct}%` });
      this._onRecord('photo', `photo:${shot.subject.id}`);
    } else if (kept) {
      this.hud.toast({ kind: '重拍', title: shot.subject.title, sub: `构图提高到 ${pct}%` });
    } else {
      this.hud.toast({ kind: '未采用', title: shot.subject.title, sub: `构图 ${pct}%，不如已收录的那张` });
    }

    platform.analytics.track('game.photo.taken', {
      subjectId: shot.subject.id,
      quality: round3(shot.quality),
      firstTime: first,
      trailT: round3(this._trailT()),
      elapsedS: Math.round(this.state.elapsedMs / 1000),
    });
  }

  _onRecord(kind, key) {
    this.refreshCounters(kind);
    this._applySun(false);
    this._checkChapterDone(key);
    if (this.state.complete) this._finish('你把它记满了');
  }

  refreshCounters(bump = null) {
    this.hud.setCounters(
      this.state.glyphs.size, GLYPHS.length,
      this.state.photos.size, SUBJECTS.length,
      bump,
    );
    if (this.hud.bookOpen) this.hud.renderBook(this.state);
  }

  /* ----------------------------------------------------------------- sun */

  /**
   * Move the sun with the notebook.
   *
   * This is the only reward in the game that changes the whole picture, and it
   * costs nothing to author: the sky, the image-based lighting and every
   * shadow in the scene are already functions of one direction. A run that
   * fills the notebook walks from morning into evening.
   */
  _applySun(force) {
    const step = Math.min(SUN_STEPS, Math.floor(this.state.records / 2));
    this.state.sunStep = step;
    if (step === this._sunApplied && !force) return;
    const moved = this._sunApplied >= 0 && step !== this._sunApplied;
    this._sunApplied = step;

    const k = step / SUN_STEPS;
    this.game.setSun(
      SUN_FROM.elev + (SUN_TO.elev - SUN_FROM.elev) * k,
      SUN_FROM.azim + (SUN_TO.azim - SUN_FROM.azim) * k,
    );
    if (moved && !force) this.cues.sun();
  }

  /* -------------------------------------------------------------- finale */

  async _finish(title) {
    if (this.state.finished && !this.state.complete) return;
    const wasFinished = this.state.finished;
    this.state.finished = true;
    this.state.finalScore = this.state.score();
    this.cues.finale();
    document.exitPointerLock();

    await this.state.flush();
    platform.analytics.complete('run', {
      records: this.state.records,
      complete: this.state.complete,
      elapsedS: Math.round(this.state.elapsedMs / 1000),
      score: this.state.finalScore,
    });

    const submitted = await platform.leaderboard.submit(this.state.finalScore);
    const board = await platform.leaderboard.top(8);

    let quality = 0;
    for (const q of this.state.photos.values()) quality += q;
    const avg = this.state.photos.size ? quality / this.state.photos.size : 0;

    this.hud.showFinale({
      title: wasFinished ? '记录已更新' : title,
      rows: [
        ['铭文拓片', `${this.state.glyphs.size} / ${GLYPHS.length}`],
        ['物种图鉴', `${this.state.photos.size} / ${SUBJECTS.length}`],
        ['平均构图', `${Math.round(avg * 100)}%`],
        ['行程用时', formatTime(this.state.elapsedMs)],
        ['成绩', this.state.finalScore + (submitted ? `　第 ${submitted.rank} 名` : ''), true],
      ],
    }, board);
  }

  /* ---------------------------------------------------------------- frame */

  update(dt) {
    /* The clock only runs while the player is actually walking. Counting the
     * minutes a notebook sits open, or a tab sits in the background, would put
     * the one number the leaderboard tie-breaks on at the mercy of whether
     * someone answered the door. */
    if (!this.paused && !this.hud.bookOpen && !this.hud.finaleOpen) {
      this.state.tick(dt * 1000);
    }
    this.photo.update(dt);

    const t = this._trailT();
    this.state.advance(t, this.walker.pos.x, this.walker.pos.z, this.walker.yaw);
    this._syncChapter(false);
    this._drawNav(dt, t);

    if (this.photo.raised) {
      this.aimed = null;
      this.hud.setPrompt(null);
      this.hud.setNearby(null);
      const s = this.photo.target;
      this.hud.setFinderTarget(s ? {
        label: s.title,
        quality: this.photo.quality,
        box: this.photo.box,
        advice: this.photo.advice,
        recorded: this.state.hasPhoto(s.id),
        distance: this.photo.distance,
      } : null);
      return;
    }

    this._sense();
    this.aimed = this._aimedTablet();
    this.hud.setReticleActive(!!this.aimed);
    if (!this.aimed) {
      this.hud.setPrompt(null);
    } else if (this.state.hasGlyph(this.aimed.id)) {
      this.hud.setPrompt({ text: '<span class="kbd">E</span> 重读', name: this.aimed.title });
    } else {
      this.hud.setPrompt({ text: '<span class="kbd">E</span> 拓印铭文' });
    }
  }

  /**
   * The tablet the player is both near enough to touch and looking at.
   *
   * Both halves matter. Distance alone means a prompt appears for a stone
   * behind you; view direction alone means you can rub something across a
   * ravine. The angle is generous because a tablet is a metre wide and a
   * player standing beside one is not looking at its centre.
   */
  _aimedTablet() {
    this.camera.getWorldDirection(_fwd);
    let best = null, bestScore = 0;
    for (const it of this.glyphs.items) {
      _to.subVectors(it.focus, this.camera.position);
      const dist = _to.length();
      if (dist > it.reach) continue;
      _to.divideScalar(dist);
      const facing = _fwd.dot(_to);
      if (facing < 0.55) continue;
      // Prefer the one most squarely in view, not merely the closest: two
      // tablets are never within reach at once, but a near miss behind the
      // player should never beat the one being read.
      const score = facing / Math.max(0.5, dist);
      if (score > bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  /** The current chapter's records, for the quest panel. */
  _chapterItems(chapterId) {
    return (this.byChapter.get(chapterId) ?? []).map((key) => {
      const id = key.slice(key.indexOf(':') + 1);
      if (key.startsWith('glyph:')) {
        const g = GLYPHS.find((d) => d.id === id);
        return { title: g.title, hint: g.hint ?? '在小径沿途', found: this.state.hasGlyph(id) };
      }
      const s = SUBJECTS.find((d) => d.id === id);
      return { title: s.title, hint: s.hint, found: this.state.hasPhoto(id) };
    });
  }

  _syncChapter(force) {
    const t = this._trailT();
    const ch = chapterAt(t);
    const p = this._chapterProgress(ch.id);
    this.hud.setChapter(ch.name, t * this.trail.length, p.done, p.total);
    /* Rebuilt only when its contents can have changed. The panel is otherwise
     * a dozen array searches and an innerHTML assignment per frame to produce
     * exactly the markup that is already on screen. */
    const questKey = `${ch.id}|${p.done}`;
    if (questKey !== this._questKey || force) {
      this._questKey = questKey;
      this.hud.setQuest({ name: ch.name, done: p.done, total: p.total, items: this._chapterItems(ch.id) });
    }
    if (ch === this.chapter && !force) return;
    if (this.chapter) platform.analytics.complete(this.chapter.id, { elapsedS: Math.round(this.state.elapsedMs / 1000) });
    this.chapter = ch;
    platform.analytics.start(ch.id, { records: this.state.records });
  }

  /**
   * Announce a chapter the moment its last record lands.
   *
   * Without this a player who cleared a stretch has no way to know it, and the
   * only honest thing to do is walk it again. Announced on the *record*, not
   * on re-entering the chapter, so it arrives while the player is still
   * standing where they earned it.
   */
  _checkChapterDone(key) {
    const ch = this.chapterOf.get(key);
    if (!ch || this._chapterDone.has(ch.id)) return;
    const p = this._chapterProgress(ch.id);
    if (p.done < p.total) return;
    this._chapterDone.add(ch.id);
    this.cues.sun();
    this.hud.toast({ kind: '本章记满', title: ch.name, sub: `${p.total} 处全部收录` });
    platform.analytics.complete(`${ch.id}.records`, { total: p.total });
  }

  /* ------------------------------------------------------------ navigation */

  _cycleMap() {
    this.mapMode = (this.mapMode + 1) % (ZOOMS.length + 1);
    this._applyMapMode();
    this.cues.page();
  }

  _applyMapMode() {
    const on = this.mapMode < ZOOMS.length;
    this.hud.setMapVisible(on);
    if (!on) return;
    this.minimap.zoom = this.mapMode;
    this.hud.setMapScale(this.minimap.radiusM);
  }

  /**
   * Draw the map and the compass.
   *
   * Only records the player already holds are marked. The one exception is the
   * tablet the proximity sense has already announced, which appears as an
   * anonymous ring — the map is allowed to draw what the player can hear, and
   * nothing more, or the game becomes a walk between icons.
   */
  _drawNav(dt, t) {
    // Both are faded out behind the notebook and inside the viewfinder. Drawing
    // them there is work whose entire output is covered by an opacity of zero.
    if (this.hud.bookOpen || this.hud.finaleOpen || this.photo.raised) return;

    const p = this.walker.pos, yaw = this.walker.yaw;

    const tan = this.trail.tangentAt(Math.min(1, t + 0.004), _tan);
    this.compass.draw(yaw, Math.atan2(tan.x, -tan.z));

    if (this.mapMode >= ZOOMS.length) return;
    const r = this.minimap.radiusM + 8;
    const marks = [];
    for (const it of this.glyphs.items) {
      if (!this.state.hasGlyph(it.id)) continue;
      if (Math.abs(it.position.x - p.x) > r || Math.abs(it.position.z - p.z) > r) continue;
      marks.push({ x: it.position.x, z: it.position.z, kind: 'glyph' });
    }
    for (const s of this.photo.subjects) {
      if (!this.state.hasPhoto(s.id)) continue;
      if (Math.abs(s.position.x - p.x) > r || Math.abs(s.position.z - p.z) > r) continue;
      marks.push({ x: s.position.x, z: s.position.z, kind: 'photo' });
    }
    if (this._nearId) {
      const it = this.glyphs.items.find((g) => g.id === this._nearId);
      if (it) marks.push({ x: it.position.x, z: it.position.z, kind: 'sense' });
    }
    this.minimap.draw({ x: p.x, z: p.z, yaw, dt, marks });
  }

  /**
   * The sense that something is nearby.
   *
   * Half the tablets are deliberately off the tread, and without any feedback
   * at all the only way to find those is to sweep the undergrowth — which is
   * not exploring, it is mowing. This gives a direction-free proximity signal
   * and nothing more: the player learns there is something within about twenty
   * metres and still has to look for it.
   */
  _sense() {
    if (this.hud.bookOpen || this.hud.finaleOpen) return;
    let near = null, bestD = SENSE_RANGE;
    for (const it of this.glyphs.items) {
      if (this.state.hasGlyph(it.id)) continue;
      const d = this.camera.position.distanceTo(it.focus);
      if (d < bestD) { bestD = d; near = it; }
    }
    if (!near) {
      if (this._nearId) { this._nearId = null; this.hud.setNearby(null); }
      return;
    }
    // Inside reach the prompt says it better, and two labels for one stone is
    // one label too many.
    const text = bestD <= near.reach ? null : '附近有未拓印的铭文';
    // Only on the way in. Two tablets within range of each other would
    // otherwise trade the "nearest" title back and forth and chirp every time
    // the player shifted their weight.
    if (this._nearId === null) this.cues.page();
    this._nearId = near.id;
    this.hud.setNearby(text);
  }

  _trailT() {
    const p = this.camera.position;
    return this.trail.nearest(p.x, p.z, this._q).t;
  }

  _offTrail() {
    const p = this.camera.position;
    return this.trail.nearest(p.x, p.z, this._q).dist;
  }
}

function firstLine(text) {
  const line = String(text).split('\n')[0];
  return line.length > 42 ? `${line.slice(0, 40)}…` : line;
}

function round3(v) { return Math.round(v * 1000) / 1000; }
