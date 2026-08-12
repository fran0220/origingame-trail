/* The Tongariro Alpine Crossing.
 *
 * A third level chosen by two measurements rather than by taste.
 *
 * RELIEF. Probing the other two for a point where the ground falls away on
 * BOTH sides of the path found 1.14 m on the lake and 0.23 m of notch on the
 * jungle walk. Neither has a saddle, a crossing or a drop, and two set-pieces
 * — a one-lane bridge and a swingbridge — were abandoned after measuring for
 * exactly that reason. Terrain is authored, so this is where it gets fixed:
 * the Red Crater ridge here measures 33 to 37 m of drop on both sides within
 * 60 m, seventy metres into the crater on one side. See tools/tprofile.mjs.
 *
 * NO TREES. Vegetation is 63.7% of a jungle frame and world/vegetation.js
 * records four dead ends against its alpha-tested silhouette aliasing. Above
 * the saddle this place has no plants at all, so the level simply does not
 * have the one problem in this project known to be unsolved.
 */
import { Trail } from '../../world/path.js';
import { ROUTE, STAGES, trackElevation, stageAt } from './route.js';
import { Terrain, makeTerrainMaterial, DATUM, BOUNDS } from './terrain.js';
import { Skyline } from './skyline.js';
import { Lakes } from './lakes.js';
import { Poles } from './poles.js';
import { Fumaroles } from './steam.js';
import { Rockfield } from './rocks.js';
import { Alpine } from './alpine.js';
import { Dike } from './dike.js';
import { TongariroAmbience } from './audio.js';
import { pick, applyCondition } from './conditions.js';
import { content } from './content.js';

export const meta = {
  id: 'tongariro',
  title: '汤加里罗',
  blurb: '越过火山鞍部的一天：灰烬、赤色火山渣与蒸汽。',
};

/* The look of the air, as data.
 *
 * The one that matters is the fog. Both other levels use fog as an atmosphere:
 * the bush wants it dark and close, the lake wants it blue and far. Above the
 * bushline on a clear day the air is the cleanest in the country and the fog
 * has to be almost nothing — 0.0016 against the jungle's 0.028 — or the
 * mountains that are the entire reason to look up go grey and flat. The
 * whole point of standing on that ridge is that you can see Taranaki 130 km
 * away, and any haze that would be flattering at ground level erases it.
 */
const BASE_MOOD = {
  /* FAR PLANE 12 km, and it is not a luxury. The apron that closes the ground
   * runs out to 5.2 km and Ruapehu sits about 5 km away, so at the lake's
   * 4200 m every one of them was clipped — which is why four builds showed a
   * brown void from the high ground no matter what I put on the horizon. I
   * added three mountains and an apron to fix a hole that was being cut by the
   * projection matrix. From a ridge on a clear day you can see Taranaki 130 km
   * off; 12 km is still modest and it is what the geometry needs. */
  camera: { fov: 62, near: 0.10, far: 22000 },
  sun: { elevation: 24, azimuth: 68 },
  fog: { color: 0x9aa8b4, density: 0.00030 },
  /* 0.72, NOT 1.35. A hemisphere at 1.35 is a second sun with no direction:
   * every surface receives nearly the same fill, landform shadows disappear,
   * and the mountain reads as a clay model under studio lights. The lake is
   * 0.64 and the jungle 0.55; alpine daylight is hard, not flooded. */
  hemi: { sky: 0x8eb4d4, ground: 0x5a4536, intensity: 0.38 },
  /* Lower than the jungle's 1.90 because nothing here is in shade. An alpine
   * scene lit at a forest's stop is a white one. 0.92 rather than 1.15 so
   * oxidised scoria can sit in the upper mid-tones instead of washing to tan. */
  exposure: 0.92,
  environmentIntensity: 0.62,
  air: {
    turbidity: 2.4,
    ground: 0x6a5a4a,
    haze: 0xa8b6c2,
    /* Close to true clear-sky Rayleigh, unlike either other level: at 1800 m
     * there is a third less atmosphere above you and the sky genuinely is a
     * deeper blue than anyone paints it. */
    beta: [0.058, 0.135, 0.331],
    sunScale: 2.4,
    sunMax: 1.8,
    /* Broken alpine cumulus. A featureless dome is half the frame from every
     * ridge, and it is also the environment map, so weather here is lighting. */
    clouds: 0.58,
    cloudScale: 1.55,
  },
  /* Nothing overhead. Without this the canopy fleck mask prints leaf shadows
   * on bare scoria and the contact-AO ring latches to the heightfield grid —
   * the moiré that covered every Tongariro gallery frame. */
  openSky: true,
  /* The jungle's 46 m is derived from FogExp2 at 0.038. Air this thin still
   * shows a shadow at 200 m, and the subject of the ridge is a crater wall
   * that far away. */
  shadowReach: 210,
};

export const condition = pick(location.hash || location.search);
export const mood = applyCondition(BASE_MOOD, condition);
export { content };

/* Walked, not driven. */
export const locomotion = 'walk';

export async function build(ctx) {
  const lv = new TongariroLevel(ctx);
  await lv._build();
  return lv;
}

class TongariroLevel {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = meta.id;
    /* No surface water yet, and no canopy ever. The minimap takes a null for
     * water and draws nothing, which is the answer.
     *
     * `roof` is LEFT UNDEFINED rather than set to null, and the difference is
     * not style: render/field.js declares `roof = NO_ROOF` as a default
     * parameter, and a default parameter fires on undefined and NOT on null.
     * Assigning null therefore replaces the engine's own no-canopy function
     * with nothing and the world field calls it — which is exactly what
     * happened, and the boot handler added in v65 reported it as
     * "roof is not a function" instead of hanging on a loading bar forever. */
    this.mapWater = null;
  }

  async _build() {
    const { renderer, scene, tier, step } = this.ctx;

    this.trail = new Trail(ROUTE);

    await step(0.20, '抬升火山');
    this.terrain = new Terrain(this.trail);

    await step(0.55, '铺开火山灰与赤渣');
    this.terrainMat = makeTerrainMaterial(renderer);
    scene.add(this.terrain.build(this.terrainMat));

    await step(0.80, '立起三座火山');
    this.skyline = new Skyline(this.terrain);
    scene.add(this.skyline.root);

    await step(0.72, '撒下火山块与火山弹');
    this.rock = new Rockfield(this.terrain, this.trail, tier);
    scene.add(this.rock.root);

    await step(0.80, '在林线以下种下红草丛');
    this.alpine = new Alpine(this.terrain, this.trail, tier);
    scene.add(this.alpine.root);

    await step(0.84, '立起红火口的岩脉');
    this.dike = new Dike(this.terrain, this.trail, tier);
    scene.add(this.dike.root);

    await step(0.88, '注满翡翠湖');
    this.lakes = new Lakes(this.terrain, this.trail);
    scene.add(this.lakes.root);

    await step(0.95, '标出穿越路线');
    this.poles = new Poles(this.terrain, this.trail);
    scene.add(this.poles.root);

    await step(0.97, '打开硫气孔');
    this.steam = new Fumaroles(this.terrain, this.trail, tier);
    scene.add(this.steam.root);
  }

  materials() { return [this.terrainMat, ...this.skyline.materials, ...this.lakes.materials, ...this.poles.materials, ...this.steam.materials, ...this.rock.materials, ...this.alpine.materials, ...this.dike.materials]; }

  makeAmbience({ camera, walker }) {
    this.ambience = new TongariroAmbience({ camera, walker, terrain: this.terrain });
    return this.ambience;
  }
  attachAtmosphere(atmos) {
    /* Thin bright alpine veil, never transplanted jungle mist. The default
     * volume is authored for a 30 m humid understory; left alone it milks
     * the whole saddle and flattens Ngauruhoe to a wedge. */
    atmos.volumeMat.uniforms.uMistAmbient.value.set(0x9aa8b4);
    atmos.volumeMat.uniforms.uMist.value.set(0.0009, 0.07, 0.09, 480);
    atmos.volumeMat.uniforms.uBand.value.set(6, 5, 0.006, 0.05);
    atmos.volumeMat.uniforms.uScatter.value.set(0.07, 0.36);
    /* Same lesson as the lake: the tight screen-space contact ring quantises
     * against an open heightfield and prints the terrain lattice over every
     * slope. Landform already has normals and a long shadow cascade. */
    atmos.aoStrength = 0.035;
    atmos.contactStrength = 0;
  }
  update(dt, host) {
    this.steam?.update(dt, host?.camera);
    this.ambience?.update(dt);
  }
  cullAround() {}
  envExclude() { return []; }
  setTier() {}
  setViewportHeight() {}

  stats() {
    return {
      stage: null,
      datum: DATUM,
      /* Read from the profile's own high point rather than a t typed in here:
       * it said 1719 because the stages were re-spanned and 0.65 stopped being
       * the summit, which is the same stale-constant fault as the skyline's. */
      summitM: Math.round(Math.max(...Array.from({ length: 101 },
        (_, i) => trackElevation(i / 100)))),
      skyline: this.skyline?.stats(),
      lakes: this.lakes?.stats(),
      poles: this.poles?.stats(),
      steam: this.steam?.stats(),
      rock: this.rock?.stats(),
      alpine: this.alpine?.stats(),
      dike: this.dike?.stats(),
      audio: this.ambience?.stats?.() ?? null,
    };
  }
}

export { STAGES, stageAt, BOUNDS };
