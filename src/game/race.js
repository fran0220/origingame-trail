/* The stage.
 *
 * This level is a timed run up a public road, not a circuit race, and that is
 * a deliberate choice about the place rather than a shortcut. State Highway 8
 * is a point-to-point: it goes up the lake and it does not come back, and a
 * lap counter on it would be a lie about the geography. What fits a road like
 * this is what motorsport actually does with roads like this — close it, send
 * cars up it one at a time, and time them. So: a special stage, with splits.
 *
 * That format also solves the problem this landscape would otherwise have.
 * The subject of the picture is forty kilometres away and it changes very
 * slowly, so a lap would show the player the same reveal four times. A single
 * run up the shore shows it once, getting closer the whole way, which is the
 * thing the alignment was authored for in the first place.
 *
 * Three things are tracked and they are not the same thing:
 *
 *   Elapsed time, which is the score.
 *   Split times at each gate, which is how a player knows *where* they lost
 *   it — a total tells you that you were slow and nothing else.
 *   The best run, held per level in the existing save slot, which is what
 *   turns one run into practice rather than an ending.
 */
import * as THREE from 'three';

/* Where the gates stand, as normalised arc length up the route.
 *
 * Not evenly spaced. They are placed at the features the alignment already
 * has — off the moraine bench, onto the shingle, over each of the two alluvial
 * fans, and the delta at the head — so that a split is always the time for a
 * recognisable piece of road rather than for an arbitrary 150 m of it. A
 * player who loses two seconds should be able to name what they lost them on.
 */
const GATES = [
  { t: 0.00, name: '起点' },
  { t: 0.22, name: '冰碛台地' },
  { t: 0.45, name: '砾石滩' },
  { t: 0.62, name: '第一冲积扇' },
  { t: 0.80, name: '第二冲积扇' },
  { t: 1.00, name: '湖头三角洲' },
];

/* How far either side of the centreline a gate counts as passed.
 *
 * Wider than the seal, because a gate that can be missed by putting two wheels
 * on the gravel is a gate that will eventually invalidate a good run for a
 * reason the player cannot see. The formation is 5.9 m of half-width; 11 m
 * catches anyone still recognisably on the road, and anyone further off it
 * than that has had a much larger problem than a missed split.
 */
const GATE_HALF = 11.0;

export class Race {
  /**
   * @param {object} opts
   * @param {import('../player/driver.js').Driver} opts.driver
   * @param {import('../world/path.js').Trail} opts.trail
   * @param {object} opts.terrain
   * @param {THREE.Scene} opts.scene
   * @param {Hud} opts.hud
   */
  constructor({ driver, trail, terrain, scene, hud, best = null }) {
    this.driver = driver;
    this.trail = trail;
    this.terrain = terrain;
    this.hud = hud;

    this.state = 'staged';        // staged | running | finished
    this.time = 0;
    this.splits = [];
    this.next = 1;                // index of the gate being driven toward
    this.best = best;             // { total, splits } from the save, or null
    this.bestSplits = best?.splits ?? null;
    this.penalty = 0;
    this._offRoadFor = 0;
    this.topSpeed = 0;

    this.root = new THREE.Group();
    this.root.name = 'race';
    this.materials = [];
    this._buildGates();
    scene.add(this.root);

    /* Gate positions in world space, resolved once. Testing against arc
     * length rather than against geometry keeps this exact through a bend and
     * means a gate cannot be clipped by a fast frame. */
    this._gateT = GATES.map((g) => g.t);
  }

  /* ── the gates ─────────────────────────────────────────────────────────── */

  /* Two poles and a banner, and they are as plain as that on purpose.
   *
   * A rally stage does not have grandstands. It has a pair of poles, a strip
   * of cloth with a sponsor on it, and a marshal — and the reason the plain
   * version is also the right version here is that this frame already has a
   * 3,700 m mountain in it. Anything with real visual weight beside the road
   * competes with the only thing the player came to look at.
   */
  _buildGates() {
    const P = new THREE.Vector3(), T = new THREE.Vector3();

    const poleGeo = new THREE.CylinderGeometry(0.075, 0.09, 4.4, 8);
    poleGeo.translate(0, 2.2, 0);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xdedcd4, roughness: 0.62, metalness: 0.1,
    });
    this.materials.push(poleMat);

    GATES.forEach((g, i) => {
      this.trail.pointAt(g.t, P);
      this.trail.tangentAt(g.t, T);
      const nx = T.z, nz = -T.x;
      const yaw = Math.atan2(T.x, T.z);
      const span = 7.6;

      for (const side of [-1, 1]) {
        const x = P.x + nx * span * side, z = P.z + nz * span * side;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, this.terrain.height(x, z) - 0.1, z);
        pole.castShadow = true;
        this.root.add(pole);
      }

      /* The banner. Start and finish get their own colours because those are
       * the two the player has to recognise instantly and at distance; the
       * intermediate splits are neutral so they do not read as finishes. */
      const isStart = i === 0, isEnd = i === GATES.length - 1;
      const col = isStart ? 0x2f7d4f : isEnd ? 0xb03a2e : 0x2b5f88;
      const bannerMat = new THREE.MeshStandardMaterial({
        color: col, roughness: 0.86, metalness: 0.0,
        side: THREE.DoubleSide,
      });
      this.materials.push(bannerMat);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, 1.15), bannerMat);
      banner.position.set(P.x, this.terrain.height(P.x, P.z) + 3.75, P.z);
      banner.rotation.y = yaw;
      banner.castShadow = false;
      banner.receiveShadow = true;
      this.root.add(banner);
      /* A cross-bar so the banner is hanging from something. Without it the
       * cloth floats between two poles it is not attached to, which is the
       * kind of detail that is invisible until it is not. */
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, span * 2, 6), poleMat);
      bar.rotation.set(0, yaw, Math.PI / 2);
      bar.position.set(P.x, this.terrain.height(P.x, P.z) + 4.34, P.z);
      this.root.add(bar);
    });
  }

  /* ── running ───────────────────────────────────────────────────────────── */

  /** Arm the stage: the clock starts on the first metre the player drives. */
  stage() {
    this.state = 'staged';
    this.time = 0;
    this.splits = [];
    this.next = 1;
    this.penalty = 0;
    this.topSpeed = 0;
    this._offRoadFor = 0;
  }

  update(dt) {
    const d = this.driver;

    if (this.state === 'staged') {
      /* Rolling start, on movement rather than on a countdown. A countdown is
       * a better competition and a worse thing to sit through on the tenth
       * attempt at the same stage. */
      if (d.speed > 1.2) { this.state = 'running'; this.time = 0; }
      this._hud();
      return;
    }
    if (this.state !== 'running') { this._hud(); return; }

    this.time += dt;
    if (d.speed > this.topSpeed) this.topSpeed = d.speed;

    /* Cutting. Leaving the formation is not forbidden — the shoulder is part
     * of the road and using it is real driving — but *sustained* off-road
     * running is a shortcut across a bend, and a stage that does not police
     * that is a stage whose fastest line is through the tussock. Two seconds
     * of grace, then time is added at the rate it is being saved. */
    if (d.offRoad > 0.75 && d.speed > 8) {
      this._offRoadFor += dt;
      if (this._offRoadFor > 2.0) { this.penalty += dt * 2.0; this.time += dt * 2.0; }
    } else {
      this._offRoadFor = Math.max(0, this._offRoadFor - dt * 2);
    }

    /* Gate crossing, tested in arc length. `nearest` gives where the car is
     * along the route; a gate is passed when that value goes beyond the
     * gate's and the car is close enough to the road to have gone through it
     * rather than around it. */
    /* A loop, not an `if`, and the difference is a bug that only appears when
     * a player has a bad moment.
     *
     * Gates fire on arc length, and arc length only advances while the car is
     * close enough to the road to be on the stage at all. Run wide into the
     * tussock for a few hundred metres and come back, and the car re-enters
     * having already passed two gates — which the single-test version then
     * credited one per *frame*, producing splits 0.017 s apart. That is not a
     * cosmetic complaint: the second split is the difference between two
     * consecutive frames, so it says the player covered 170 m of road in a
     * sixtieth of a second.
     *
     * Crediting them together, at the time they were actually noticed, is the
     * honest reading: the clock is still right, the total is still right, and
     * the split that swallowed the excursion is the one that shows the loss —
     * which is exactly what a split is for. */
    const q = this.trail.nearest(d.pos.x, d.pos.z, {});
    while (this.state === 'running'
           && q.dist < GATE_HALF
           && q.t >= this._gateT[this.next]) {
      this._passGate(this.next);
    }
    this._hud();
  }

  _passGate(i) {
    const split = this.time;
    const prev = this.bestSplits?.[this.splits.length] ?? null;
    this.splits.push(split);
    const delta = prev === null ? null : split - prev;
    const name = GATES[i].name;

    if (i >= GATES.length - 1) {
      this.state = 'finished';
      this.finishTime = split;
      const improved = !this.best || split < this.best.total;
      if (improved) this.best = { total: split, splits: [...this.splits] };
      this.onFinish?.({ total: split, splits: [...this.splits], improved,
                        penalty: this.penalty, topSpeed: this.topSpeed });
      this.hud?.toast?.({
        kind: improved ? '新纪录' : '完成',
        title: fmt(split),
        sub: improved ? '本关最佳成绩' : (delta === null ? '' : `与最佳 ${fmtDelta(delta)}`),
      });
    } else {
      this.next = i + 1;
      this.hud?.toast?.({
        kind: '分段',
        title: `${name} ${fmt(split)}`,
        sub: delta === null ? '' : `与最佳 ${fmtDelta(delta)}`,
      });
    }
    this.onSplit?.({ index: i, name, split, delta });
  }

  /* ── the readout ───────────────────────────────────────────────────────── */

  /* What a driver actually needs, and nothing else.
   *
   * Speed, because it is the one number every corner is judged against. The
   * clock, because it is the score. The next split's name, because a stage you
   * do not know is a stage you cannot attack. Everything else a racing game
   * usually shows — lap counter, position, tyre temperature — is either absent
   * from this format or invented, and this level's whole argument is that the
   * view out of the windscreen is the product.
   */
  _hud() {
    const d = this.driver;
    const kmh = Math.round(d.speed * 3.6);
    this.hud?.setRace?.({
      kmh,
      time: this.state === 'staged' ? 0 : this.time,
      running: this.state === 'running',
      finished: this.state === 'finished',
      gate: GATES[Math.min(this.next, GATES.length - 1)].name,
      done: this.splits.length,
      total: GATES.length - 1,
      best: this.best?.total ?? null,
      surface: d.surface,
      skid: d.skid,
      penalty: this.penalty,
      staged: this.state === 'staged',
    });
  }

  save() {
    return this.best ? { total: this.best.total, splits: this.best.splits } : null;
  }

  stats() { return { gates: GATES.length, state: this.state, time: this.time }; }

  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}

export function fmt(s) {
  if (!isFinite(s)) return '--:--.--';
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
}

function fmtDelta(d) {
  if (d === null || !isFinite(d)) return '';
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`;
}

export { GATES };
