/* Jungle Trail — entry point.
 *
 * Boots the renderer, builds the world once, and runs a fixed-cap loop. The
 * capture harness in tools/ drives this file through `window.__game`, so the
 * control surface below (pause, render one frame, teleport, advance time) is
 * load-bearing rather than debug convenience.
 */
import * as THREE from 'three';
import { Sky } from './render/sky.js';
import * as jungle from './levels/jungle/index.js';
import * as lake from './levels/lake/index.js';
import { Walker } from './player/controller.js';
import { Driver } from './player/driver.js';
import { Race } from './game/race.js';
import { CollisionWorld } from './player/collision.js';
import {
  PlayerBody,
  BODY_FIRST_PERSON_LAYER,
} from './player/body.js';
import { buildWorldField } from './render/field.js';
import { Canopy, patchCanopyLight } from './render/canopy.js';
import { Atmosphere } from './render/atmosphere.js';
import { Hud } from './game/hud.js';
import { Session } from './game/session.js';
import * as platform from './game/platform.js';

/* Quality tiers.
 *
 * Boot on `high`, never `ultra`: the first seconds of a load are the worst
 * possible time to be measuring performance (shader compilation, texture
 * upload and the GC are all still running), and a tier chosen there is chosen
 * on bad data. The adaptive step below only moves once the frame time has been
 * stable for a while.
 */
/* How far the one shadow cascade reaches, in metres, at every tier.
 *
 * This used to be a tier knob, rising from 45 m to 100 m with the quality
 * setting, which is backwards. The cascade is a fixed number of texels spread
 * over whatever it is asked to cover, so reaching further is not more quality,
 * it is the same quality thinned out — the top tier was paying for its larger
 * map and then throwing the gain away, since 3072 texels over 100 m is 6.5 cm
 * and 2048 over 80 m is 7.8 cm.
 *
 * What decides how far shadows are worth drawing here is the air. FogExp2 at
 * 0.038 leaves a surface at 46 m with under 5% of its own colour, so a shadow
 * out there can change the frame by at most that much, and by 60 m it is half
 * a per cent. Sizing the frustum to the fog rather than to the tier costs
 * nothing — same map, same casters, same draws — and buys 1.7x finer texels at
 * `high` and 2.2x at `ultra`. The sun shafts do not depend on it: the
 * volumetric march gates itself on the canopy transmittance field, not on this
 * depth map.
 */
const SHADOW_REACH = 46;

/* ...for the jungle. An open basin is a different argument entirely.
 *
 * The 46 m above was derived from the forest's air: FogExp2 at 0.038 leaves a
 * surface at 46 m with under 5% of its own colour, so a shadow past that
 * cannot change the frame, and spending texels beyond it is spending them on
 * nothing. Lake Tekapo's fog is 0.00135 — an order of magnitude thinner — and
 * its subject is forty kilometres away. Nothing is hidden at 46 m there.
 *
 * It matters more now that the level is driven than it did when it was walked.
 * At 150 km/h the car covers 46 m in 1.1 seconds, so every shadow in the
 * landscape appears one second before the car reaches it, which is a moving
 * ring of darkness travelling with the player — the single most obvious
 * artefact left in the driving frames.
 *
 * A cascade is a fixed number of texels over whatever it covers, so this is
 * paid for in sharpness: 2048 over 46 m is 2.2 cm, over 170 m it is 8.3 cm.
 * That is the right trade for a landscape whose shadows are cast by tussock
 * clumps, roadside posts and moraine hummocks rather than by leaves.
 */
const levelShadowReach = (mood) => mood?.shadowReach ?? SHADOW_REACH;

const TIERS = {
  low: { dpr: 0.75, shadow: 1024, aniso: 4 },
  medium: { dpr: 1.0, shadow: 1536, aniso: 8 },
  high: { dpr: 1.0, shadow: 2048, aniso: 16 },
  ultra: { dpr: 1.25, shadow: 3072, aniso: 16 },
};
const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

/* The levels this build ships, in the order the picker offers them. */
export const LEVELS = { jungle, lake };

class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} levelModule one of LEVELS — the world this host will run.
   */
  constructor(canvas, levelModule) {
    this.canvas = canvas;
    this.levelModule = levelModule;
    this.clock = new THREE.Clock();
    this.paused = false;
    this.running = false;
    this.fps = 0;
    this._acc = 0;
    this._frames = 0;
    this._fpsT = 0;
    this._stableFor = 0;

    const hash = new URLSearchParams(location.hash.slice(1));
    this.pinnedTier = TIER_ORDER.includes(location.hash.slice(1)) ? location.hash.slice(1)
                    : hash.get('tier');
    /* A tier chosen in the pause menu outlives the tab. The hash still wins,
     * because it is what the test harness and a bug report use to pin one. */
    if (!this.pinnedTier) {
      try {
        const saved = localStorage.getItem('jt.tier');
        if (TIER_ORDER.includes(saved)) this.pinnedTier = saved;
      } catch { /* private mode; auto is a fine default */ }
    }
    this.tier = this.pinnedTier || 'high';
    /* The user of this machine games on it. An uncapped loop on an RTX-class
     * card will happily render this at 300 fps and pull 150 W to do it, for a
     * scene that is a walking pace nature documentary. 60 is the target and
     * the cap. */
    this.frameCap = Number(hash.get('fps')) || 60;

    this._initRenderer();
  }

  _initRenderer() {
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      /* No multisampling on the canvas any more, and nothing has been given
       * up: the canvas only ever receives one full-screen triangle now. MSAA
       * moved to the offscreen half-float target the scene is drawn into (see
       * render/atmosphere.js), which is the only place it can be once the
       * frame has to be read back for volumetrics. The reason it is still on
       * at all is unchanged — nearly every silhouette here is a leaf edge and
       * the geometric edge is the one the eye follows. */
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    /* Tone mapping is off in the *scene* pass and happens once in the
     * composite instead. It is the same ACES fit at the same exposure — the
     * curve has not been touched and the grading pass is a later system — but
     * it has to run after the volumetric in-scatter has been added, because a
     * sun shaft is radiance like everything else and tone mapping it
     * separately from the surface behind it is what makes a shaft look like a
     * decal laid over the picture. */
    r.toneMapping = THREE.NoToneMapping;
    /* Exposure is the level's, set from `mood` once the level is known. This
     * is a placeholder for the frames before that happens. It is not a render
     * setting in the sense that shadow type is: a photographer walking from
     * rainforest into an open glacial basin changes it by two stops, and a
     * single number here means whichever level was tuned second comes out
     * wrong. Ours came out white. */
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setPixelRatio(Math.min(devicePixelRatio, TIERS[this.tier].dpr));
    r.setSize(innerWidth, innerHeight, false);
    this.renderer = r;

    addEventListener('resize', () => this.resize());
  }

  /**
   * Build the world, yielding between stages.
   *
   * This used to be one synchronous call in the constructor, which is the
   * shortest way to write it and the worst way to load it: fifteen GPU texture
   * bakes, a hundred thousand plants and half a million heightfield samples in
   * a single task means the browser cannot paint, so there is nothing to show
   * a player during the several seconds it takes and no honest moment to call
   * the game ready. Awaiting a frame between stages costs a handful of
   * milliseconds in total and buys a loading bar that is telling the truth.
   *
   * @param {(value:number, label:string)=>void} stage
   */
  async build(stage) {
    const step = async (value, label) => {
      stage(value, label);
      await nextFrame();
    };

    const scene = new THREE.Scene();
    this.scene = scene;
    const mood = this.levelModule.mood;

    const cm = mood.camera;
    this.camera = new THREE.PerspectiveCamera(cm.fov, innerWidth / innerHeight, cm.near, cm.far);

    await step(0.04, '生成天空');
    this.sky = new Sky(this.renderer, mood.air);
    this.sky.setSun(mood.sun.elevation, mood.sun.azimuth);
    scene.add(this.sky.mesh);

    /* Depth cue, and its colour and density are the level's — see the `mood`
     * block in the level module for why this one is dark rather than bright.
     * The volumetric pass in the atmosphere system replaces the look of it,
     * but this stays underneath as the thing that closes the far distance. */
    scene.fog = new THREE.FogExp2(mood.fog.color, mood.fog.density);
    this.renderer.toneMappingExposure = mood.exposure;

    const sl = this.sky.sunLight();
    this.sun = new THREE.DirectionalLight(sl.color, sl.intensity);
    this.sun.castShadow = true;
    this._configureShadow();
    scene.add(this.sun);
    scene.add(this.sun.target);

    /* Sky/ground bounce, and the colour of it matters far more than the
     * amount — which is why the pair is the level's and not this file's. Its
     * reasoning lives with it, in the level module's `mood`.
     *
     * A hemisphere light is by construction the least directional light there
     * is: it varies only with the surface normal's y, so it is simultaneously
     * the thing keeping a shaded surface out of the black and the thing
     * flattening it. Most of that budget goes through canopyFill() in
     * render/canopy.js, which is the same idea with the roof's own thickness
     * modulating it, so a thin patch of canopy puts a well of light under
     * itself and a thick one does not. This is what is left: the isotropic
     * floor under everything, which still has to exist. */
    const hm = mood.hemi;
    this.hemi = new THREE.HemisphereLight(hm.sky, hm.ground, hm.intensity);
    scene.add(this.hemi);

    /* The scene used to carry a second, weak, unshadowed DirectionalLight here
     * standing in for skylight that had been through the canopy. It has been
     * removed rather than retuned: it was uniform across the world, and the
     * one thing scattered canopy light is not is uniform. Its replacement is
     * canopyFill() in render/canopy.js, which is the same physical idea driven
     * by the roof density field, and it costs one fewer light in every shader
     * in the scene as well. */

    /* Solids are registered while their procedural generators still know
     * what each merged or instanced piece represents. Keeping this registry
     * beside the walker avoids turning the render scene back into physics data
     * every frame, after that identity has deliberately been batched away. */
    this.collision = new CollisionWorld({ cellSize: 4 });

    /* The world itself, which is the level's to make.
     *
     * What comes back is aliased onto the host below rather than reached for
     * through `this.level` everywhere. Partly because half this file was
     * written against those names, but mostly because they are the surface the
     * probes drive: nine test tools, the gallery and the regression guard all
     * ask `window.__game` for its trail and its terrain, and a refactor that
     * renames the thing every probe holds onto has moved the cost rather than
     * paid it. */
    this.level = await this.levelModule.build({
      renderer: this.renderer, scene, camera: this.camera,
      tier: this.tier, collision: this.collision, step,
    });
    this.trail = this.level.trail;
    this.terrain = this.level.terrain;
    this.terrainMat = this.level.terrainMat;
    this.ruins = this.level.ruins;
    this.veg = this.level.veg;
    this.water = this.level.water;

    await step(0.74, '烘焙环境光');
    this._bakeEnv();
    /* The cyan cast on the near-horizontal understory blades came from those
     * leaves facing straight up into an open sky that the roof of the forest
     * does not actually let them see; what they see now is leaves. */
    scene.environmentIntensity = mood.environmentIntensity;

    /* How the player moves through this level, and it is the level's to say.
     *
     * Two levels, two verbs. The jungle is a corridor with a roof, and what it
     * is for is looking closely at things a metre away; the lake is forty
     * kilometres of open basin with a state highway through it, and what it is
     * for is covering ground. Those want different bodies, different cameras
     * and different input, and trying to serve both from one controller
     * produces a walker that drifts or a car that can strafe.
     *
     * So the host asks. Everything downstream of here — the session, the
     * ambience, the save — is written against the small surface both share:
     * a position, a heading, a speed, an update and a place-me-here. */
    this.driving = this.levelModule.locomotion === 'drive';
    /* Told once, here, rather than inferred in the HUD: the overlay differs
     * between the two verbs by a layout and a set of widgets, and the host is
     * the only thing that knows which verb this level uses. */
    this.hud?.setDriving(this.driving);

    if (this.driving) {
      await step(0.80, '交付赛车');
      this.walker = new Driver(this.camera, this.terrain, this.trail,
                               this.collision).attach(this.canvas);
      /* Imported here rather than at the top of the file, because a walked
       * level has no use for several thousand triangles of bodywork and no
       * reason to pay for parsing it. This is the only dynamic import in the
       * engine and it earns its keep: the module is large, it is needed by
       * exactly one of the two levels, and the boot sequence is already
       * asynchronous at this point. */
      const { CarMesh } = await import('./player/carMesh.js');
      this.car = new CarMesh(this.renderer, { tier: this.tier });
      scene.add(this.car.root);
      /* No PlayerBody. The driver is in the car, and a first-person pair of
       * arms belonging to a walking rig would be attached to a torso that is
       * bobbing through a gait cycle at 200 km/h. */
      this.body = null;
    } else {
      await step(0.80, '塑造行者');
      this.walker = new Walker(this.camera, this.terrain, this.trail,
                               this.collision).attach(this.canvas);
      this.body = new PlayerBody(this.renderer, this.walker, { tier: this.tier });
      scene.add(this.body.root);
    }
    /* First-person limbs and the complete external body use separate layers.
     * This camera sees only the camera-aligned representation; PlayerBody
     * exposes the complete one to the depth traversal just long enough to cast
     * its shadow. A later third-person camera can swap those representations
     * without rebuilding the character or accepting doubled limbs. */
    if (!this.driving) this.camera.layers.enable(BODY_FIRST_PERSON_LAYER);

    /* Everything above builds surfaces; everything below decides how they are
     * lit. The order is forced — the field has to be sampled from a terrain
     * that has finished building, and the materials have to exist before they
     * can be patched — but the split is also the honest description of what
     * this system is. */
    await step(0.86, '计算林冠透光');
    this.field = buildWorldField(this.terrain, this.level.roof);
    this.canopy = new Canopy(this.renderer, this.field,
                             { openSky: mood.openSky === true });
    this.canopy.setSun(this.sky.sunDir);
    this.atmos = new Atmosphere(this.renderer, this.canopy);
    this.atmos.setTier(this.tier);
    this._syncAtmosphereSize();

    /* Every opaque MeshStandardMaterial in the scene, and the list is
     * deliberately exhaustive rather than a traversal: a surface that misses
     * the patch is not subtly wrong, it is a leaf standing in a shaft of light
     * that the shaft does not touch, and that reads instantly. */
    for (const m of [...this.level.materials(),
                     ...(this.body?.materials ?? []),
                     ...(this.car?.materials ?? [])]) {
      patchCanopyLight(m, this.canopy);
    }

    /* The soundscape is the level's, and it is built here rather than in the
     * level's own build because it needs a walker to chain its footfalls to.
     * Browsers refuse to start an AudioContext without a user gesture, so the
     * bake and the graph happen on the click that grabs pointer lock — which
     * is also the moment the player starts walking, and therefore the first
     * moment any of it would be heard. */
    this.ambience = this.level.makeAmbience({
      camera: this.camera, walker: this.walker,
    });
    this.level.attachAtmosphere?.(this.atmos);

    /* The game layer is built last because it consumes finished world systems
     * and nothing in the world consumes it: the tablets are set into the
     * completed heightfield and registered with the collision world, and the
     * photographic subjects resolve against the finished plant scatter. */
    await step(0.94, '安放石碑');
    this.session = new Session({
      game: this,
      hud: this.hud,
      renderer: this.renderer,
      camera: this.camera,
      canvas: this.canvas,
      walker: this.walker,
      trail: this.trail,
      terrain: this.terrain,
      veg: this.veg,
      fauna: this.level.fauna,
      collision: this.collision,
      ambience: this.ambience,
      mapWater: this.level.mapWater,
      content: this.levelModule.content,
      levelId: this.levelModule.meta.id,
      onSceneExit: (button) => exitToPicker(this.session.state, button),
    });
    scene.add(this.session.glyphs.root);
    // Added to the same exhaustive list as every other opaque surface: a
    // tablet that missed the patch would be a stone standing in a light shaft
    // that the shaft does not touch.
    patchCanopyLight(this.session.glyphs.material, this.canopy);

    /* The stage is built after the session, because it reads the saved best
     * time out of it, and it is the last thing built because it is the only
     * system that consumes a finished world *and* a finished game layer. */
    if (this.driving) {
      await step(0.96, '布置计时段');
      this.race = new Race({
        driver: this.walker,
        trail: this.trail,
        terrain: this.terrain,
        scene,
        hud: this.hud,
        best: this.session.state?.best ?? null,
      });
      for (const m of this.race.materials) patchCanopyLight(m, this.canopy);
      this.race.onFinish = (r) => this.session.onRaceFinish?.(r);
      this.race.stage();
    }

    this.hud.bindQuality((choice) => this.chooseTier(choice));
    this.onTierChange = (choice, actual) => this.hud.setQuality(choice, actual);
    this.hud.setQuality(this.pinnedTier || 'auto', this.tier);

    await step(0.98, '准备就绪');
  }

  /* Put the car where the physics says it is.
   *
   * The split matters: driver.js owns a rigid body and knows nothing about
   * geometry, and carMesh.js owns geometry and knows nothing about forces.
   * This is the only place the two meet, and keeping it to a dozen lines is
   * the evidence that the seam is in the right place.
   *
   * The mesh's origin is the centre of the rear axle at ground level while the
   * body's origin is its centre of mass, so the mesh is pushed back along its
   * own heading by the CG-to-rear-axle distance. Getting that wrong does not
   * look like an offset; it looks like the car pivoting about its boot under
   * steering, which is the tell of a car placed at its centre.
   */
  _driveCar(dt) {
    const d = this.walker;
    const car = this.car;
    const s = Math.sin(d.yaw), c = Math.cos(d.yaw);
    const back = 2.62 * 0.61;          // WHEELBASE * WEIGHT_FRONT — see driver.js
    car.root.position.set(d.pos.x - s * back, d.pos.y, d.pos.z - c * back);
    car.root.rotation.set(0, d.yaw, 0);
    car.setSteer(d.steer);
    car.setWheelSpin(d.wheelSpin);
    car.setBodyAttitude(d.bodyPitch, d.bodyRoll);
    /* Visible in both views now. The bonnet camera sits out on the cowl rather
     * than inside the cabin — see _updateCamera() — precisely so that the car
     * can stay drawn and fill the bottom of the frame with its own bonnet and
     * front arches, which is what makes it a bonnet cam rather than a camera
     * floating where a driver would be.
     *
     * `hideCar` is a field on the host rather than a write to
     * `car.root.visible`, because this method rewrites that flag every frame
     * and an external assignment would survive exactly until the next step.
     * The fixed-view capture tools set it: every station there places a camera
     * by hand, which leaves the physics body parked on the lens. */
    car.root.visible = !this.hideCar;
  }

  _configureShadow() {
    const t = TIERS[this.tier];
    const s = this.sun.shadow;
    s.mapSize.set(t.shadow, t.shadow);
    const d = levelShadowReach(this.levelModule.mood);
    s.camera.left = -d; s.camera.right = d;
    s.camera.top = d; s.camera.bottom = -d;
    s.camera.near = 1; s.camera.far = d * 3.2;
    // Foliage shadows are thin and overlapping, which is exactly the case that
    // shows acne; normalBias does more for it than a constant bias and does not
    // cause the peter-panning that a large constant bias would.
    s.bias = -0.0006;
    s.normalBias = 0.06;
    s.camera.updateProjectionMatrix();
    if (s.map) { s.map.dispose(); s.map = null; }
  }

  /* Keep the shadow frustum around the player. A single cascade sized to the
   * whole level would give roughly 15 cm shadow texels; sized to 80 m around
   * the camera it is under 4 cm, which is the difference between leaf shadows
   * and grey blobs. */
  _trackSun() {
    return this._aimShadow(this.camera.position);
  }

  /**
   * Point the one shadow cascade at a place.
   *
   * Parameterized because the camera is not the only thing that needs shadows
   * where it is standing. The environment probe renders from a fixed point on
   * the trail while this frustum follows the player, and `sky.bake` reuses the
   * shadow map already in hand rather than paying for six more passes — so a
   * bake from the falls lit the ground under the probe with a depth map that
   * did not cover it, i.e. did not shadow it at all. That showed up as the
   * probe's lower hemisphere reading three times too bright.
   *
   * @param {THREE.Vector3} p
   */
  _aimShadow(p) {
    const d = this.sky.sunDir;
    const dist = SHADOW_REACH * 1.6;
    this.sun.position.set(p.x + d.x * dist, p.y + d.y * dist, p.z + d.z * dist);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
    return this;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    // The listener is armed with the renderer, which now exists before the
    // scene does; a window resized during the load must not take the build
    // down with it.
    if (!this.camera) { this.renderer.setSize(w, h, false); return; }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[this.tier].dpr));
    this.renderer.setSize(w, h, false);
    this._syncAtmosphereSize();
  }

  _syncAtmosphereSize() {
    if (!this.atmos) return;
    const v = this.renderer.getDrawingBufferSize(_size);
    this.atmos.setSize(v.x, v.y);
    // Spray sprites are sized in pixels, so they have to be told how many
    // pixels tall the frame is or the plume changes physical size with the
    // window and with whatever DPR the current tier picked.
    this.level?.setViewportHeight(v.y);
  }

  /**
   * Answer the pause menu.
   *
   * 'auto' hands control back to the adaptive step; anything else pins, which
   * is the only way to reach ultra — the adaptive step only ever steps *down*,
   * deliberately, so a machine that could carry ultra would never be offered
   * it. Persisted, because a choice that resets every load is not a choice.
   */
  chooseTier(choice) {
    if (choice !== 'auto' && !TIERS[choice]) return this;
    this.pinnedTier = choice === 'auto' ? null : choice;
    try {
      if (this.pinnedTier) localStorage.setItem('jt.tier', this.pinnedTier);
      else localStorage.removeItem('jt.tier');
    } catch { /* private mode */ }
    if (this.pinnedTier) this.setTier(this.pinnedTier);
    this.onTierChange?.(choice, this.tier);
    return this;
  }

  setTier(name) {
    if (!TIERS[name] || name === this.tier) return;
    this.tier = name;
    this.onTierChange?.(this.pinnedTier || 'auto', name);
    this._configureShadow();
    this.body?.setQuality(name);
    this.atmos?.setTier(name);
    this.level?.setTier(name);
    this.resize();
  }

  /* Only ever steps one tier at a time and only after several seconds of
   * consistent evidence. Reacting fast to frame time produces a renderer that
   * oscillates between two tiers, which looks far worse than either. */
  _adapt(dt) {
    if (this.pinnedTier) return;
    const target = 1 / this.frameCap;
    const bad = dt > target * 1.55;
    this._stableFor = bad ? 0 : this._stableFor + dt;
    if (bad) {
      this._badFor = (this._badFor || 0) + dt;
      if (this._badFor > 1.6) {
        const i = TIER_ORDER.indexOf(this.tier);
        if (i > 0) this.setTier(TIER_ORDER[i - 1]);
        this._badFor = 0;
      }
    } else {
      this._badFor = 0;
    }
  }

  step(dt) {
    this.walker.update(dt);
    this.body?.update(dt);
    if (this.car) this._driveCar(dt);
    this.race?.update(dt);
    /* Before the camera's matrices are refreshed below, because the session
     * only reads the walker's position and the previous frame's orientation —
     * and after the walker, so a tablet prompt describes where the player has
     * just arrived rather than where they were. */
    this.session?.update(dt);
    this._trackSun();
    // The camera's world-inverse has to be current before the vegetation
    // rotates the sun into view space for its transmission term.
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.level.update(dt, this);
    this.canopy.update(dt);
    /* After the camera's world matrix is current, because the listener's
     * position and orientation are read straight out of it. Placing this
     * before the update above would put the ears one frame behind the eyes,
     * which is small but is exactly the error that makes a source seem to
     * swing as you turn. */
    this.ambience?.update(dt);
  }

  render() {
    const r = this.renderer;
    /* The materials reconstruct world position from vViewPosition, so they
     * need the camera's world matrix as a uniform. Set once per frame here
     * rather than per material, because they all share the same uniform
     * object by reference. */
    this.canopy.uniforms.uViewToWorld.value.copy(this.camera.matrixWorld);

    this.atmos.beginScene();
    /* Only the walker has two representations to swap between for the depth
     * pass. A car casts the same shell into the shadow map that the chase
     * camera already sees, so there is nothing to prepare. */
    this.body?.prepareShadowPass();
    r.render(this.scene, this.camera);
    /* Snapshotted here because the post passes are render() calls of their
     * own and three resets its counters at the top of each one, so by the time
     * the frame is on screen the info block describes a single full-screen
     * triangle. This is the same quantity every earlier measurement reported —
     * three zeroes the counters after the shadow pass, so it is the visible
     * pass only — which is what keeps the numbers comparable across the
     * change. */
    this._sceneCalls = r.info.render.calls;
    this._sceneTris = r.info.render.triangles;
    this.atmos.finish(this.camera, this.sun.color, this.sun.intensity);
    /* The shutter reads the drawing buffer, and this is the only place it can:
     * the renderer runs without `preserveDrawingBuffer`, so the frame exists
     * until the browser composites it and is gone by the time a click handler
     * runs in the next task. */
    this.session?.afterRender();
  }

  renderOnce() { this.render(); }

  begin() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;      // a tab that was backgrounded must not teleport

      if (this.paused) return;

      // Frame cap. Skipping the work rather than the present keeps the GPU
      // genuinely idle between frames instead of spinning on vsync.
      this._acc += dt;
      const budget = 1 / this.frameCap;
      if (this._acc < budget * 0.92) return;
      const step = this._acc;
      this._acc = 0;

      this.step(step);
      this.render();

      this._frames++;
      this._fpsT += step;
      if (this._fpsT >= 0.5) {
        this.fps = this._frames / this._fpsT;
        this._frames = 0; this._fpsT = 0;
        this._adapt(1 / Math.max(1, this.fps));
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  setPaused(p) {
    this.paused = !!p;
    this.ambience?.setPaused(this.paused);
  }

  /** Advance the simulation without waiting for wall-clock time. */
  warp(seconds, stepSize = 1 / 60) {
    for (let t = 0; t < seconds; t += stepSize) this.step(stepSize);
  }

  /** Teleport to normalised arc length along the trail. */
  goTo(t) { this.walker.setAuto(null).placeAt(t); return this; }

  setSun(elevationDeg, azimuthDeg) {
    this.sky.setSun(elevationDeg, azimuthDeg);
    const sl = this.sky.sunLight();
    this.sun.color.copy(sl.color);
    this.sun.intensity = sl.intensity;
    this._bakeEnv();
    this.canopy?.setSun(this.sky.sunDir);
    return this;
  }

  /**
   * Capture the surroundings into the environment map.
   *
   * The probe stands on the trail rather than at the origin, because an
   * image-based light has no position and the only choice available is which
   * single place in the level it lies about least. Mid-trail under closed
   * canopy is where the player spends the walk; the clearing and the falls are
   * brighter than this map says, and they are also the two places with enough
   * direct sun that the environment term is not carrying the frame.
   */
  _bakeEnv() {
    const p = this._envProbe || (this._envProbe = new THREE.Vector3());
    this.trail.pointAt(0.5, p);
    p.y = this.terrain.height(p.x, p.z) + 1.7;

    /* Move the forest's cull to the probe before photographing from it.
     * Vegetation tiles are hidden per frame by distance to the camera, and the
     * probe does not move with the camera — so a bake triggered at the falls
     * was capturing the trail's midpoint with every tree around it culled
     * away. That is the same failure the probe was introduced to fix, arriving
     * through a different door: not an empty temp scene this time, but a real
     * scene whose forest is switched off. Because `setSun` rebakes and the sun
     * advances with the walk, it got worse the further the player went. */
    this.level?.cullAround(p.x, p.z);

    /* And aim the shadow cascade there too, with one update requested. `bake`
     * holds shadows still across the six faces, which is right — one depth
     * pass then serves all of them — but the map it holds still has to be the
     * one that covers the probe. */
    this._aimShadow(p);
    this.renderer.shadowMap.needsUpdate = true;

    this.sky.bake(this.scene, {
      probe: p,
      /* The water is the main consumer of this map; capturing it would make
       * the reflection a function of itself. The body is excluded because a
       * probe at eye height is standing inside it. */
      exclude: [...(this.level?.envExclude() ?? []), this.body?.root].filter(Boolean),
    });

    /* Hand the cull back to the camera. `update` would do this on the next
     * frame anyway, but a bake can land between the cull and the draw — the
     * loading sequence bakes without stepping, and `setSun` is called from
     * game code — and one frame of forest culled for a point the player is
     * not standing at is a visible pop. */
    this.level?.cullAround(this.camera.position.x, this.camera.position.z);
    this._trackSun();
    this.renderer.shadowMap.needsUpdate = true;
    return this;
  }

  /**
   * Read the frame back and describe it numerically.
   *
   * Screenshots lie about exposure — a shot that looks "moody" on one display
   * is crushed to black on another, and judging it by eye is how you end up
   * grading the same scene three times. These are the numbers that decide
   * whether the frame has a usable range: the percentiles say where the
   * histogram actually sits, `black` and `blown` say how much of it has been
   * clipped away at either end, and `sky` vs `ground` separates the two
   * exposures that are fighting each other in a backlit forest.
   */
  probe(sampleStep = 4) {
    const w = this.renderer.domElement.width, h = this.renderer.domElement.height;
    const gl = this.renderer.getContext();
    const px = new Uint8Array(w * h * 4);
    this.render();
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);

    const lum = [];
    let skyL = 0, skyN = 0, gndL = 0, gndN = 0, black = 0, blown = 0, total = 0;
    // readPixels is bottom-up, so the upper rows of the image are the high j.
    for (let j = 0; j < h; j += sampleStep) {
      for (let i = 0; i < w; i += sampleStep) {
        const k = (j * w + i) * 4;
        const l = (px[k] * 0.2126 + px[k + 1] * 0.7152 + px[k + 2] * 0.0722) / 255;
        lum.push(l);
        total++;
        if (l < 0.02) black++;
        if (l > 0.98) blown++;
        if (j > h * 0.62) { skyL += l; skyN++; } else { gndL += l; gndN++; }
      }
    }
    /* High-frequency energy, which is the one thing the percentiles cannot
     * see. Sharpening a texture, refining a shadow or resolving a leaf edge
     * moves no part of the histogram — the frame keeps the same distribution
     * of brightnesses and merely arranges them at a finer scale — so a change
     * that is entirely about detail reads as all zeroes in every other number
     * here. Mean absolute gradient between neighbouring samples reads it
     * directly. It is a comparison figure and nothing else: its value depends
     * on `sampleStep` and on the resolution, so only compare runs that share
     * both. */
    let grad = 0, gradN = 0;
    for (let j = 0; j < h; j += sampleStep) {
      for (let i = 0; i < w - sampleStep; i += sampleStep) {
        const k = (j * w + i) * 4, k2 = (j * w + i + sampleStep) * 4;
        const a = px[k] * 0.2126 + px[k + 1] * 0.7152 + px[k + 2] * 0.0722;
        const b = px[k2] * 0.2126 + px[k2 + 1] * 0.7152 + px[k2 + 2] * 0.0722;
        grad += Math.abs(a - b) / 255;
        gradN++;
      }
    }

    lum.sort((a, b) => a - b);
    const q = (p) => +lum[Math.min(lum.length - 1, Math.floor(p * lum.length))].toFixed(3);
    return {
      p01: q(0.01), p10: q(0.10), median: q(0.5), p90: q(0.90), p99: q(0.99),
      mean: +(lum.reduce((a, b) => a + b, 0) / lum.length).toFixed(3),
      contrast: +((q(0.95) - q(0.05)) * 255).toFixed(0),
      detail: +(grad / Math.max(1, gradN)).toFixed(4),
      blackPct: +(100 * black / total).toFixed(1),
      blownPct: +(100 * blown / total).toFixed(1),
      upper: +(skyL / Math.max(1, skyN)).toFixed(3),
      lower: +(gndL / Math.max(1, gndN)).toFixed(3),
    };
  }

  info() {
    const i = this.renderer.info;
    return {
      calls: this._sceneCalls ?? i.render.calls,
      triangles: this._sceneTris ?? i.render.triangles,
      geometries: i.memory.geometries, textures: i.memory.textures,
      programs: i.programs ? i.programs.length : 0,
      ...(this.level?.stats() ?? {}),
      body: this.body ? this.body.stats() : null,
      race: this.race ? this.race.stats() : null,
      collision: this.collision ? this.collision.stats() : null,
    };
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.ambience?.dispose();
    this.level?.dispose?.();
    this.walker.dispose();
    this.body?.dispose();
    this.car?.dispose();
    this.race?.dispose();
    this.atmos?.dispose();
    this.canopy?.dispose();
    this.renderer.dispose();
  }
}

const _size = new THREE.Vector2();

/** One paint. The stage boundaries in build() are the only callers. */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/* Recording convenience: number keys jump to the authored viewpoints.
 *
 * The falls are eight minutes of walking from the trailhead, which is the
 * right length for the level and the wrong length for the twentieth take of a
 * capture. These reuse goTo() rather than moving the camera themselves, so a
 * warp lands in exactly the state the harness's stops land in — snapped to the
 * heightfield, facing along the trail, velocity zeroed, gait clock reset.
 *
 * Now gated behind `#dev`, and that is a correctness fix rather than tidiness:
 * teleporting past a stretch of trail skips the tablets standing in it, so in
 * a normal session these keys are a way to lose records without being told.
 */
const WARP_STOPS = [0.04, 0.34, 0.81, 0.88, 0.96];

function attachDevWarps(game) {
  if (!/(^|[#&])dev(&|$)/.test(location.hash)) return;
  addEventListener('keydown', (e) => {
    if (!game.walker.enabled) return;
    const key = /^Digit([1-9])$/.exec(e.code);
    const t = key && WARP_STOPS[+key[1] - 1];
    if (t === undefined || t === null) return;
    game.goTo(t);
  });
}

/* Which level to run.
 *
 * A URL fragment for now, and it is deliberately the *only* selector: the
 * picker UI that will replace it has to choose between the same modules
 * through the same door, and a boot path that a probe cannot drive is a boot
 * path that stops being tested. `#level=jungle` is what the tools use.
 */
export function pickLevel() {
  const m = /(?:^|[#&])level=([a-z0-9-]+)/i.exec(location.hash);
  return m ? (LEVELS[m[1]] ?? jungle) : null;
}

function shouldShowPicker() {
  return !location.hash || location.hash === '#';
}

async function selectLevel(id) {
  if (!LEVELS[id]) return;
  history.replaceState(null, '', `#level=${id}`);
  document.getElementById('levelPicker')?.remove();
  await boot(LEVELS[id]);
}

/* A complete document rebuild is intentional: WebGL resources, pointer-lock
 * listeners, AudioContext state and procedural-world state all have one clear
 * owner and one teardown boundary instead of pretending a Game can hot-swap. */
export async function exitToPicker(state, button) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  await state.flush();
  location.hash = '';
  location.reload();
}

async function boot(chosen = undefined) {
  const levelModule = chosen ?? pickLevel();
  if (!levelModule && shouldShowPicker()) {
    const picker = document.getElementById('levelPicker');
    picker.hidden = false;
    picker.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-level]');
      if (button) void selectLevel(button.dataset.level);
    });
    window.__selectLevel = selectLevel;
    return;
  }
  const actualLevel = levelModule ?? jungle;
  document.getElementById('levelPicker')?.remove();
  document.title = `${actualLevel.meta.title} — Field Notes`;
  const hud = new Hud(actualLevel.content);
  if (platform.online) hud.useHostLoading();
  platform.loading.begin();

  const game = new Game(document.getElementById('view'), actualLevel);
  game.hud = hud;
  window.THREE = THREE;

  try {
    await game.build((value, label) => {
      hud.bootProgress(value, label);
      platform.loading.progress(value * 0.97, label);
    });
  } catch (err) {
    hud.bootProgress(1, '加载失败');
    // The platform's own load-failure telemetry needs the page to stop
    // pretending; rethrowing after the message keeps the console stack.
    platform.analytics.track('game.runtime.error', { where: 'build' });
    throw err;
  }

  /* The save is read after the world exists and before the first frame, so a
   * resumed walk starts where it left off instead of showing the trailhead
   * for a frame and then jumping. */
  await game.session.restore();

  /* Prime every simulation-owned uniform and perform the complete scene and
   * composite passes before either automation or the host can observe ready.
   * This is synchronous GPU work by design: a timer/RAF would make “ready” a
   * race and can still expose the loading canvas. */
  game.step(0);
  game.renderOnce();
  const firstFrame = game.info();
  if (!(firstFrame.calls > 1 && firstFrame.triangles > 0)) {
    const err = new Error(`First world frame was empty (calls=${firstFrame.calls}, triangles=${firstFrame.triangles})`);
    hud.bootProgress(1, '首帧渲染失败');
    platform.analytics.track('game.runtime.error', { where: 'first-frame' });
    throw err;
  }

  // The harness may drive __game immediately, so exposure itself is the
  // contract that a non-empty world frame has already completed.
  window.__game = game;
  attachDevWarps(game);

  hud.bootDone();
  game.session.begin();

  // The harness calls begin() itself so it can set state before the first frame.
  if (!/(^|[#&])manual(&|$)/.test(location.hash)) game.begin();

  /* Ready means the first playable frame, not the last byte of script. The
   * portal shows its own loading surface until this resolves, so calling it
   * early is the difference between a player waiting on a progress bar and a
   * player staring at a black canvas. */
  await platform.loading.ready();
}

void boot();
