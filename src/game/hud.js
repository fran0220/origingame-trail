/* The heads-up display.
 *
 * DOM rather than canvas, and the reason is not convenience: everything here
 * is text, and text is the one thing a browser does better than a renderer.
 * Laying out two scripts, a scrollable notebook and a leaderboard in WebGL
 * would mean shipping a font atlas and a line breaker to reproduce what the
 * page already has.
 *
 * The markup lives in index.html and this file only ever changes text,
 * classes and a handful of inline positions. Nothing below builds a panel from
 * scratch, so the styling is all in one place and the HUD cannot drift into
 * having two visual languages.
 */
import { GLYPHS, SUBJECTS } from './content.js';
import { MIN_QUALITY } from './photo.js';

const $ = (sel) => document.querySelector(sel);

export class Hud {
  constructor() {
    this.el = {
      hud: $('#hud'),
      boot: $('#boot'),
      bootBar: $('#bootBar'),
      bootStep: $('#bootStep'),
      reticle: $('#reticle'),
      chapter: $('#chapter'),
      nearby: $('#nearby'),
      map: $('#map'),
      mapCanvas: $('#mapCanvas'),
      mapScale: $('#mapScale'),
      compass: $('#compass'),
      quest: $('#quest'),
      questName: $('#questName'),
      questCount: $('#questCount'),
      questList: $('#questList'),
      counters: { glyph: $('#cGlyph'), photo: $('#cPhoto') },
      prompt: $('#prompt'),
      toasts: $('#toasts'),
      hints: $('#hints'),
      finder: $('#finder'),
      lock: $('#finder .lock'),
      lockTag: $('#finder .lock .tag'),
      fHint: $('#fHint'),
      fQual: $('#fQual'),
      fMode: $('#fMode'),
      fMeterFill: $('#fMeter > b'),
      fMeterMark: $('#fMeter > u'),
      shutter: $('#shutter'),
      book: $('#book'),
      bookGrid: $('#bookGrid'),
      bookSub: $('#bookSub'),
      bookRec: $('#bookRec'),
      bookQual: $('#bookQual'),
      pause: $('#pause'),
      qTiers: $('#qTiers'),
      qNote: $('#qNote'),
      finale: $('#finale'),
      finTitle: $('#finTitle'),
      finRows: $('#finRows'),
      finLb: $('#finLb'),
    };
    this.bookTab = 'glyph';
    this.bookOpen = false;
    this._hintTimer = null;
    this._onBookTab = null;

    for (const b of document.querySelectorAll('#book .tabs button')) {
      b.addEventListener('click', () => {
        this.bookTab = b.dataset.tab;
        for (const o of document.querySelectorAll('#book .tabs button')) o.classList.toggle('on', o === b);
        this._onBookTab?.(this.bookTab);
      });
    }
  }

  /* --------------------------------------------------------------- boot */

  /**
   * Stand down the local boot screen when the platform is drawing its own.
   *
   * Loading is platform-owned on a deployed page: the portal holds its cover
   * and progress bar over the frame until ready() resolves, so a second
   * full-screen splash underneath it is at best invisible and at worst a
   * different progress number showing through the seam. Standalone, this is
   * the only loading surface there is, so it stays.
   */
  useHostLoading() {
    this.el.boot.style.background = 'transparent';
    this.el.boot.querySelector('.inner').style.display = 'none';
  }

  bootProgress(value, label) {
    this.el.bootBar.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
    if (label) this.el.bootStep.textContent = label;
  }

  bootDone() {
    this.el.boot.classList.add('gone');
    this.el.hud.classList.remove('hidden');
    setTimeout(() => this.el.boot.remove(), 900);
    // The control list is useful for about a minute and then it is clutter.
    this._hintTimer = setTimeout(() => this.el.hints.classList.add('faded'), 45_000);
  }

  /* --------------------------------------------------------------- meta */

  setChapter(name, metres, done = null, total = null) {
    const c = this.el.chapter.querySelector('.c');
    const m = this.el.chapter.querySelector('.m');
    if (c.textContent !== name) c.textContent = name;
    // Progress belongs to the quest panel below; repeating it here was the
    // same fraction twice, forty pixels apart.
    const line = `${Math.round(metres)} m`;
    if (m.textContent !== line) m.textContent = line;
    this.el.chapter.classList.toggle('done', total !== null && done === total);
  }

  /**
   * The chapter's records, listed.
   *
   * The hint for a record the player does not have yet is the same sentence
   * the notebook shows, so this panel is a shortcut to the page rather than a
   * second, more generous source of directions.
   * @param {{name:string, done:number, total:number,
   *          items:Array<{title:string, hint:string, found:boolean}>}} q
   */
  setQuest(q) {
    if (!q || !q.items.length) { this.el.quest.classList.remove('show'); return; }
    this.el.questName.textContent = q.name;
    this.el.questCount.textContent = `${q.done}/${q.total}`;
    this.el.questList.innerHTML = q.items.map((it) =>
      `<li class="${it.found ? 'done' : ''}"><i></i><span>`
      + escapeHtml(it.found ? it.title : it.hint)
      + '</span></li>').join('');
    this.el.quest.classList.add('show');
  }

  setMapVisible(on) { this.el.map.classList.toggle('off', !on); }
  setMapScale(metres) { this.el.mapScale.textContent = `${metres} m`; }

  /** Hide every readout without unbinding anything. Returns the new state. */
  toggleBare() {
    const bare = this.el.hud.classList.toggle('bare');
    return bare;
  }

  /** A one-line note under the chapter block, or null to clear it. */
  setNearby(text) {
    const el = this.el.nearby;
    if (!text) { el.classList.remove('show'); return; }
    if (el.textContent !== text) el.textContent = text;
    el.classList.add('show');
  }

  setCounters(glyphs, glyphTotal, photos, photoTotal, bump = null) {
    const set = (row, n, total) => {
      const b = row.querySelector('.row b');
      const next = `${n}/${total}`;
      if (b.textContent !== next) b.textContent = next;
      const pips = row.querySelector('.pips');
      if (pips.children.length !== total) {
        pips.innerHTML = '<i></i>'.repeat(total);
      }
      for (let i = 0; i < total; i++) pips.children[i].classList.toggle('on', i < n);
    };
    set(this.el.counters.glyph, glyphs, glyphTotal);
    set(this.el.counters.photo, photos, photoTotal);
    if (bump) {
      const row = this.el.counters[bump];
      row.classList.remove('bump');
      // Reading offsetWidth restarts the transition; without it a second
      // record inside the animation window shows no feedback at all.
      void row.offsetWidth;
      row.classList.add('bump');
      setTimeout(() => row.classList.remove('bump'), 1400);
    }
  }

  setReticleActive(on) { this.el.reticle.classList.toggle('active', !!on); }

  /** @param {{text:string, name?:string}|null} p */
  setPrompt(p) {
    const el = this.el.prompt;
    if (!p) { el.classList.remove('show'); return; }
    el.innerHTML = p.name
      ? `${p.text} <span class="name">${escapeHtml(p.name)}</span>`
      : p.text;
    el.classList.add('show');
  }

  toast({ kind, title, sub }) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="k">${escapeHtml(kind)}</div>`
      + `<div class="v">${escapeHtml(title)}</div>`
      + (sub ? `<div class="s">${escapeHtml(sub)}</div>` : '');
    this.el.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 600);
    }, 4200);
    // The stack is bounded so a burst of records cannot push the oldest toast
    // up behind the viewfinder.
    while (this.el.toasts.children.length > 3) this.el.toasts.firstElementChild.remove();
  }

  /* --------------------------------------------------------- viewfinder */

  setFinder(on) {
    this.el.finder.classList.toggle('show', !!on);
    this.el.hud.classList.toggle('framing', !!on);
    this.el.reticle.style.display = on ? 'none' : '';
  }

  _setReading(on) { this.el.hud.classList.toggle('reading', !!on); }

  /** @param {{label:string, quality:number, box:object}|null} s */
  setFinderTarget(s) {
    const lock = this.el.lock;
    if (!s) {
      lock.classList.remove('on');
      this.el.fQual.textContent = '';
      this.el.fMeterFill.style.width = '0%';
      this.el.fHint.textContent = '对准目标 · 左键快门';
      this.el.fMode.textContent = this._finderMode ?? '35mm';
      return;
    }
    lock.classList.add('on');
    lock.style.left = `${s.box.left}%`;
    lock.style.top = `${s.box.top}%`;
    lock.style.width = `${s.box.width}%`;
    lock.style.height = `${s.box.height}%`;
    this.el.lockTag.textContent = s.label;
    const pct = Math.round(s.quality * 100);
    this.el.fQual.textContent = `构图 ${pct}%`;
    this.el.fMeterFill.style.width = `${pct}%`;
    this.el.fMeterMark.style.left = `${Math.round(MIN_QUALITY * 100)}%`;
    // Below the threshold the shutter will refuse the shot, so the meter says
    // so before the player presses it rather than after.
    this.el.fMeterFill.classList.toggle('low', s.quality < MIN_QUALITY);
    this.el.fQual.classList.toggle('low', s.quality < MIN_QUALITY);
    this.el.fMode.textContent = `${Math.round(s.distance)} m${s.recorded ? ' · 已收录' : ''}`;
    this.el.fHint.textContent =
      s.advice === 'far' ? '目标太远 · 走近一些'
      : s.advice === 'near' ? '目标太近 · 后退一些'
      : s.quality < MIN_QUALITY ? '构图不足 · 把目标放到框中央'
      : s.recorded ? '已收录 · 可重拍以提高构图'
      : '左键快门';
  }

  setFinderMode(text) { this._finderMode = text; this.el.fMode.textContent = text; }

  flashShutter() {
    const el = this.el.shutter;
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
  }

  /* ------------------------------------------------------------- notebook */

  onBookTab(fn) { this._onBookTab = fn; }

  toggleBook(state) {
    this.bookOpen ? this.closeBook() : this.openBook(state);
    return this.bookOpen;
  }

  openBook(state) {
    this.bookOpen = true;
    this.renderBook(state);
    this.el.book.classList.add('show');
    this._setReading(true);
  }

  closeBook() {
    this.bookOpen = false;
    this.el.book.classList.remove('show');
    this._setReading(this.finaleOpen);
  }

  renderBook(state) {
    const glyphs = state.glyphs.size, photos = state.photos.size;
    const total = GLYPHS.length + SUBJECTS.length;
    this.el.bookSub.textContent =
      `铭文 ${glyphs}/${GLYPHS.length} · 图鉴 ${photos}/${SUBJECTS.length} · 行程 ${formatTime(state.elapsedMs)}`;
    this.el.bookRec.textContent = `${glyphs + photos}/${total}`;
    const qs = [...state.photos.values()];
    this.el.bookQual.textContent = qs.length
      ? `${Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 100)}%`
      : '—';

    const where = this._chapterOf ?? new Map();
    const cards = this.bookTab === 'glyph'
      ? GLYPHS.map((g, i) => glyphCard(g, i, state.hasGlyph(g.id), where.get(`glyph:${g.id}`)))
      : SUBJECTS.map((s, i) => photoCard(s, i, state.photos.get(s.id), state.thumbs.get(s.id), where.get(`photo:${s.id}`)));
    this.el.bookGrid.innerHTML = cards.join('');
  }

  /**
   * Tell the notebook which chapter each record lives in.
   *
   * The session works this out from where the anchors actually resolved, so
   * the notebook is handed the answer rather than recomputing it from a table
   * that does not know about the terrain.
   * @param {Map<string, {name:string}>} map keyed `glyph:id` / `photo:id`
   */
  setChapterIndex(map) { this._chapterOf = map; }

  /* ----------------------------------------------------------------- misc */

  setPaused(on) { this.el.pause.classList.toggle('show', !!on); }

  /**
   * Wire the quality picker.
   *
   * @param {(choice:string) => void} onPick called with 'auto' or a tier name.
   */
  bindQuality(onPick) {
    this.el.qTiers?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tier]');
      if (!b) return;
      /* The pause overlay sits over the canvas, whose own click resumes the
       * run. Without this, picking a tier also unpauses. */
      e.stopPropagation();
      onPick(b.dataset.tier);
    });
    return this;
  }

  /**
   * @param {string} choice  what the player asked for: 'auto' or a tier.
   * @param {string} actual  what is running, which differs from the choice
   *   whenever the adaptive step has stepped down under load. Showing only the
   *   choice would make an automatic downgrade invisible, and a player whose
   *   machine quietly dropped them to low deserves to be told rather than left
   *   wondering why it looks like that.
   */
  setQuality(choice, actual) {
    for (const b of this.el.qTiers?.children ?? []) {
      b.classList.toggle('on', b.dataset.tier === choice);
    }
    if (!this.el.qNote) return this;
    const NAME = { low: '低', medium: '中', high: '高', ultra: '极致' };
    this.el.qNote.textContent = choice === 'auto'
      ? `随帧率自动调整 · 当前 ${NAME[actual] ?? actual}`
      : '已锁定，不再自动调整';
    return this;
  }

  /**
   * @param {object} data { title, rows: [[label, value]], score }
   * @param {{top:Array, me:object}|null} board null when there is no board,
   *   which is reported as such rather than dressed up with fake ranks.
   */
  showFinale(data, board) {
    this.el.finTitle.textContent = data.title;
    this.el.finRows.innerHTML = data.rows
      .map(([k, v, total]) => `<div class="r${total ? ' total' : ''}"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`)
      .join('');

    if (!board || !board.top?.length) {
      this.el.finLb.innerHTML = '<div class="cap">排行榜</div>'
        + `<div class="none">${board ? '暂无记录' : '离线游玩，成绩未上传'}</div>`;
    } else {
      const meRank = board.me?.rank;
      this.el.finLb.innerHTML = '<div class="cap">排行榜</div>' + board.top.map((e) =>
        `<div class="e${e.rank === meRank ? ' me' : ''}">`
        + `<span class="rk">${e.rank}</span><span>${escapeHtml(e.name ?? '—')}</span>`
        + `<span class="sc">${e.score}</span></div>`).join('');
    }
    this.el.finale.classList.add('show');
    this._setReading(true);
  }

  hideFinale() {
    this.el.finale.classList.remove('show');
    this._setReading(this.bookOpen);
  }
  get finaleOpen() { return this.el.finale.classList.contains('show'); }

  onFinaleAction(onBook, onBack) {
    $('#finBook').addEventListener('click', onBook);
    $('#finBack').addEventListener('click', onBack);
  }
}

/* ------------------------------------------------------------------ cards */

function glyphCard(g, i, found, chapter) {
  const n = String(i + 1).padStart(2, '0');
  const where = chapter ? `${n} · ${escapeHtml(chapter.name)}` : n;
  if (!found) {
    return `<div class="card locked"><div class="n">${where}</div>`
      + '<div class="t">未拓印</div>'
      + `<div class="d">${escapeHtml(g.hint ?? '在小径沿途')}</div></div>`;
  }
  return `<div class="card found"><div class="n">${where}</div>`
    + `<div class="t">${escapeHtml(g.title)}</div>`
    + `<div class="d">${escapeHtml(g.text).replace(/\n/g, '<br>')}</div></div>`;
}

function photoCard(s, i, quality, thumb, chapter) {
  const n = String(i + 1).padStart(2, '0');
  if (quality === undefined) {
    const where = chapter ? `${n} · ${escapeHtml(chapter.name)}` : n;
    return `<div class="card locked"><div class="n">${where}</div>`
      + '<div class="t">未收录</div>'
      + `<div class="d">${escapeHtml(s.hint)}</div></div>`;
  }
  return '<div class="card found">'
    + (thumb ? `<img src="${thumb}" alt="">` : '')
    + `<div class="n">${n} · ${escapeHtml(s.group)}</div>`
    + `<div class="t">${escapeHtml(s.title)}</div>`
    + `<div class="d">${escapeHtml(s.text)}</div>`
    + `<div class="q">构图 ${Math.round(quality * 100)}%</div></div>`;
}

/* ----------------------------------------------------------------- helpers */

export function formatTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m} 分 ${String(s % 60).padStart(2, '0')} 秒`;
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
