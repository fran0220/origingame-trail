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
  camera: { fov: 62, near: 0.10, far: 12000 },
  sun: { elevation: 24, azimuth: 68 },
  fog: { color: 0x9aa8b4, density: 0.00030 },
  hemi: { sky: 0x9fb6cc, ground: 0x4a3a30, intensity: 1.35 },
  /* Lower than the jungle's 1.90 because nothing here is in shade. An alpine
   * scene lit at a forest's stop is a white one. */
  exposure: 1.15,
  air: {
    turbidity: 2.6,
    ground: 0x6a5a4a,
    haze: 0xa8b6c2,
    /* Close to true clear-sky Rayleigh, unlike either other level: at 1800 m
     * there is a third less atmosphere above you and the sky genuinely is a
     * deeper blue than anyone paints it. */
    beta: [0.058, 0.135, 0.331],
    sunScale: 1.6,
    sunMax: 1.2,
  },
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

    await step(0.95, '标出穿越路线');
  }

  materials() { return [this.terrainMat, ...this.skyline.materials]; }

  makeAmbience() { return null; }
  attachAtmosphere() {}
  update() {}
  cullAround() {}
  envExclude() { return []; }
  setTier() {}
  setViewportHeight() {}

  stats() {
    return {
      stage: null,
      datum: DATUM,
      summitM: Math.round(trackElevation(0.65)),
      skyline: this.skyline?.stats(),
    };
  }
}

export { STAGES, stageAt, BOUNDS };
