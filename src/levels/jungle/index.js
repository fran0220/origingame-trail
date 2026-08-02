/* The jungle trail, as one level.
 *
 * Everything here used to live in main.js, which made that file a description
 * of this walk rather than a host that could run one. The split is not about
 * tidiness: a second level cannot be added to a renderer whose fog colour,
 * build order, soundscape and content tables are written into it as literals.
 *
 * The division is by *ownership*, not by subject. The host owns the things
 * that are true of any walk — a renderer, a camera, a sun and a shadow
 * cascade, a walker, a body, a canopy-light pass, a HUD and a session. This
 * file owns the things that are true of *this* walk: where the path goes, what
 * the ground does, what grows on it, where the water is, what colour the air
 * is, what it sounds like, and what there is to find.
 *
 * The build order below is a dependency chain and none of the links are
 * optional. The ruin *plan* is pure arithmetic over the trail, so it comes
 * first and the heightfield can consult it while it is being built — which is
 * what puts the terrace, the earthwork and the spoil banks into the ground
 * itself rather than leaving the masonry to be sunk into a hillside that does
 * not know it is there. The ruin *geometry* then needs the finished
 * heightfield to know where the ground is under every block, and the
 * vegetation needs the finished geometry so that it can grow on the stone and
 * refuse to grow through it.
 */
import { Trail } from '../../world/path.js';
import { Terrain, makeTerrainMaterial } from '../../world/terrain.js';
import { RuinPlan, Ruins } from '../../world/ruins.js';
import { Water, IMPACT, LIP } from '../../world/water.js';
import { Vegetation, roofDensity } from '../../world/vegetation.js';
import { standingWater } from '../../world/spillway.js';
import { drawWater } from '../../world/mapwater.js';
import { Ambience } from '../../audio/engine.js';
import { content } from '../../game/content.js';

export const meta = {
  id: 'jungle',
  title: '雨林小径',
  blurb: '一条穿过闭合林冠的路，尽头是遗迹与瀑布。',
};

/* The look of the air and the light, as data.
 *
 * These are the level's, not the renderer's, and the two that matter most are
 * the ones that read as physics mistakes if they are copied to somewhere they
 * do not belong. In a closed forest the haze is *darker* than the foreground:
 * the air between you and a tree thirty metres away is itself in shade, so it
 * scatters almost nothing back. Aerial perspective that brightens with
 * distance is what a mountain range does, and applying it here turned the end
 * of the trail into a lit white wall the eye reads as an exit.
 *
 * The hemisphere pair is the same argument for fill. Almost no light down here
 * has come straight from the sky; it has been through one or more leaves or
 * bounced off them, so it arrives green and warm, and the ground bounce is wet
 * brown litter. Feeding real sky blue into these shadows is what makes CG
 * forests look like they were shot on an overcast day in a car park.
 */
export const mood = {
  camera: { fov: 58, near: 0.08, far: 900 },
  sun: { elevation: 38, azimuth: 152 },
  fog: { color: 0x323c2c, density: 0.038 },
  hemi: { sky: 0x82a081, ground: 0x63513a, intensity: 0.55 },
  /* The canopy map now carries its own occlusion, so surfaces are no longer
   * handed a full unoccluded hemisphere and this no longer has to be a global
   * dimmer hiding that. */
  environmentIntensity: 1.0,
};

export { content };

/**
 * @param {object} ctx { renderer, scene, camera, tier, collision, step }
 * @returns {Promise<JungleLevel>}
 */
export async function build(ctx) {
  const lv = new JungleLevel(ctx);
  await lv._build();
  return lv;
}

class JungleLevel {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = meta.id;
    /* Handed to the minimap and the world field respectively. Both are
     * general-purpose systems that need one level-shaped answer each. */
    this.mapWater = drawWater;
    this.roof = roofDensity;
  }

  async _build() {
    const { renderer, scene, collision, tier, step } = this.ctx;

    this.trail = new Trail();

    await step(0.12, '计算遗迹平面');
    this.ruinPlan = new RuinPlan(this.trail);

    await step(0.18, '生成地形');
    this.terrain = new Terrain(this.trail, undefined, this.ruinPlan);
    this.terrainMat = makeTerrainMaterial(renderer);
    scene.add(this.terrain.build(this.terrainMat));

    await step(0.34, '砌筑遗迹');
    this.ruins = new Ruins(renderer, this.terrain, this.trail, this.ruinPlan,
                           undefined, collision);
    scene.add(this.ruins.root);

    await step(0.46, '种植林木');
    this.veg = new Vegetation(renderer, this.terrain, this.trail, undefined,
                              this.ruins, collision, {
      waterMask: (x, z, y, q) => standingWater(x, z, y, this.terrain.brook, q),
    });
    scene.add(this.veg.root);

    /* Built after the vegetation, and the order matters even though water
     * grows nothing. Every surface in it is clipped per fragment against the
     * finished heightfield, and its levels were cut from the same spillway
     * tables the terrain used, so it has to see a terrain that has stopped
     * changing. It registers no collision: the causeway that keeps the trail
     * out of the pool is ground, and the walker is already stopped by the
     * bank's fifty-degree slope rather than by anything here. */
    await step(0.66, '注水');
    this.water = new Water(renderer, this.terrain, this.trail, { tier });
    scene.add(this.water.root);
  }

  /** Every opaque material this level put in the scene, for the canopy patch. */
  materials() {
    return [this.terrainMat, this.veg.leafMat, this.veg.woodMat,
            this.ruins.material, ...this.water.materials];
  }

  /**
   * The soundscape, built once the walker exists.
   *
   * Nothing is allocated on the audio device here and no buffer is
   * synthesized: constructing Ambience only chains the walker's footfall
   * callbacks and arms a listener for the first user gesture.
   */
  makeAmbience({ camera, walker }) {
    this.ambience = new Ambience({
      camera, walker, trail: this.trail, terrain: this.terrain,
    });
    /* The score guessed at these from the terrain constants before the falls
     * existed — a base at the pool's rim and a lip on the cliff plane. Both
     * were out: the real impact is 1.3 m short in z and 0.8 m higher, and the
     * real lip is 4.4 m higher than the guess and two metres further into the
     * cliff, because the water leaves the rock at the top of an undercut
     * rather than at the notch's plan position. Four metres of error in the
     * lip is audible — it is most of the vertical separation between the
     * rumble and the hiss, which is the cue that tells you how tall the thing
     * in front of you is. */
    this.ambience.setWaterfallPosition(IMPACT, LIP);
    return this.ambience;
  }

  /** Level-specific hooks into the volumetric pass. */
  attachAtmosphere(atmos) { atmos.setFallsPlume(IMPACT); }

  update(dt, host) {
    this.veg.update(dt, host.camera, host.sky.sunDir, host.sun.color,
                    host.hemi.color);
    this.ruins.update(dt, host.camera);
    this.water.update(dt, host.camera, host.sky.sunDir, host.sun.color,
                      host.hemi.color, host.sun.intensity);
    // Read back rather than advanced separately, so the caustics on the bed
    // stay in phase with the surface that is supposed to be casting them.
    this.terrainMat.userData.uniforms.uTime.value = this.water.time;
  }

  cullAround(x, z) {
    this.veg?.cullAround(x, z);
    this.ruins?.cullAround(x, z);
  }

  /* Capturing the water into the environment map would make its reflection a
   * function of itself. */
  envExclude() { return [this.water?.root]; }

  setTier(name) { this.water?.setTier(name); }

  /* Spray sprites are sized in pixels, so they have to be told how many pixels
   * tall the frame is or the plume changes physical size with the window and
   * with whatever DPR the current tier picked. */
  setViewportHeight(px) { this.water?.setViewportHeight(px); }

  stats() {
    return {
      water: this.water ? this.water.stats() : null,
      veg: this.veg ? this.veg.stats() : null,
    };
  }
}
