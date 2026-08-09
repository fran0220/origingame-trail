/* Lake Tekapo's eastern shore, under the Southern Alps.
 *
 * The second level, and almost everything that makes it hard is the same fact
 * from different directions: it is *open*. The jungle is a corridor thirty
 * metres wide with a roof on it, so the far distance is a problem that solves
 * itself — fog eats it. Here the subject of the picture is forty kilometres
 * away and the air between is the only thing that can say so.
 *
 * That inverts three things the first level had settled:
 *
 *   Haze is brighter than the subject, not darker. Sunlit air between you and
 *   a mountain scatters light *toward* you, so distance washes toward the sky
 *   colour. In a forest the same air is in shade and distance goes dark. Using
 *   the jungle's rule here paints the range black; using this one there paints
 *   the end of the trail as a glowing exit.
 *
 *   Shadows are blue. Open ground sees the whole sky, and at this altitude
 *   that sky is a deep, clean blue with very little scattering haze in it. A
 *   forest floor sees a few degrees of green, which is why one level's fill
 *   light is the other's mistake.
 *
 *   Vegetation stops being a wall and becomes a floor. The scatter economy
 *   inverts with it — see the vegetation notes when that lands.
 */
import { Trail } from '../../world/path.js';
import { ROUTE } from './route.js';
import { Basin, LAKE_Y, shoreX } from './basin.js';
import { makeBasinMaterial } from './ground.js';
import { content } from './content.js';
import { LakeDistance } from './distance.js';
import { LakeWater, drawLakeWater } from './water.js';
import { LakeRoad } from './road.js';
import { LakeFlora } from './flora.js';
import { LakeProps } from './props.js';
import { LakeShelter } from './shelter.js';
import { LakeFences } from './fences.js';
import { LakeFarm } from './farm.js';
import { LakeRoadside } from './roadside.js';
import { LakeStructures } from './structures.js';
import { LakeRock } from './rock.js';
import { LakeWayside } from './wayside.js';
import { pick as pickCondition, applyCondition } from './conditions.js';
import { WheelDust } from '../../player/dust.js';
import { LakeFauna } from './fauna.js';
import { LakeAmbience } from './audio.js';

export const meta = {
  id: 'lake',
  title: '特卡波湖 · 八号国道',
  blurb: '沿冰蚀湖东岸的国道北上，尽头是南阿尔卑斯与库克山。计时赛段。',
};

/* How this level is played. The host reads it to decide which body, camera and
 * input to build — see main.js. The jungle omits it and walks. */
export const locomotion = 'drive';

const BASE_MOOD = {
  /* Far plane at fifty kilometres rather than the jungle's nine hundred
   * metres. The range is the subject and it is genuinely that far away. What
   * makes this affordable is that the far distance is drawn in its own pass —
   * see render/distance.js — so this frustum never has to resolve a leaf at
   * 0.08 m and a summit at 45 km in the same depth buffer. */
  camera: { fov: 55, near: 0.10, far: 50_000 },
  /* Clear spring morning. A lower cross-light gives every meadow hummock and
   * mountain spur a readable side while keeping snow and lake highlights out
   * of the tone curve's shoulder. */
  sun: { elevation: 34, azimuth: 26 },
  /* An order of magnitude thinner than the jungle's 0.038, and warm-neutral
   * rather than green. This is only the near-field haze; the aerial
   * perspective that carries the mountains is computed from the atmosphere
   * rather than faked with a fog colour. */
  fog: { color: 0xb7cddd, density: 0.00135 },
  /* Sky term: real, deep, high-altitude blue — the thing a forest can never
   * have. Ground term: pale tawny, bouncing off dry tussock and grey shingle,
   * and much brighter than a forest floor's because there is far more light
   * arriving to bounce. */
  hemi: { sky: 0x83b4db, ground: 0x526d38, intensity: 0.64 },
  environmentIntensity: 0.86,
  /* Two stops under the jungle's, and in the same direction a photographer
   * would move the dial walking out of forest into a glacial basin at noon.
   * Dry tussock, pale shingle and a snowfield in frame make this one of the
   * brightest scenes there is; metering it like an understory is what put the
   * first cut of this level at a median luminance of 0.89 with no black
   * anywhere in the histogram, which is not a bright landscape, it is a
   * blown one. */
  exposure: 0.50,
  /* Mackenzie air: dry, thin, and among the clearest in the inhabited world —
   * which is why an observatory sits on the hill above this lake.
   *
   * The beam extinction is close to true clear-sky Rayleigh rather than the
   * jungle's heavily aerosol-loaded figure, and that is what takes the sun
   * from a 4400 K amber to something near daylight. It matters more here than
   * anywhere in the forest: greywacke shingle is blue-grey and dead tussock is
   * tawny, and under a strongly amber beam those two collapse into a single
   * cream — which is exactly what the first lit frames of this basin showed
   * while the albedo underneath them was correctly split.
   *
   * The beam scale is well under the jungle's, for the same reason the
   * exposure is. The jungle's was chosen to put a sunfleck at ten times its
   * surroundings under a closed roof; applied to ground with no roof at all it
   * drives the whole frame past the tone curve's shoulder, where ACES
   * desaturates everything toward white no matter what colour it started.
   *
   * Below the horizon the dome shows the pale grey of dust and distance over
   * the basin floor instead of the forest's green, which had been leaving a
   * green band along the skyline of a treeless landscape. */
  air: {
    turbidity: 2.0,
    ground: 0x71835f,
    haze: 0xb7cddd,
    beta: [0.09, 0.15, 0.38],
    sunScale: 7.0,
    sunMax: 6.2,
    /* Broken high-country cloud banks supply photographic scale in the empty
     * half of an open frame and, because the sky is also the environment map,
     * give the lake broad reflected value changes without a second camera. */
    /* Real weather, not a hint of it.
     *
     * 0.28 through a density function gated at sstep(.60,.74) put the cloud
     * mix factor under 0.24 at its strongest and left the sky effectively
     * clear — reported, correctly, as "there are no clouds". A Mackenzie
     * morning has broken cumulus over the divide and long banks running down
     * the valley, and they are also the only thing that gives an empty half of
     * the frame any scale. */
    clouds: 0.72,
    cloudScale: 1.35,
  },
  /* Nothing in this basin is under anything. That switches off both halves of
   * the canopy light model — the sunfleck mask, which would otherwise print
   * leaf shadows on bare gravel, and the through-the-leaves fill, which here
   * would be a second copy of the skylight the hemisphere light above already
   * provides. See render/canopy.js. */
  openSky: true,
  /* See levelShadowReach() in main.js. The jungle's 46 m is derived from its
   * fog, and this level's air is an order of magnitude clearer; at 150 km/h a
   * 46 m cascade is a ring of shadow that travels with the car. */
  shadowReach: 170,
};

/* The stage under whatever sky today brings — see conditions.js.
 *
 * mood is read once, at build, by main.js. Deriving it here at module load
 * means a condition costs nothing at runtime and every system that reads mood
 * (sky, fog, hemisphere, exposure, shadows, the distance pass) picks it up
 * without knowing conditions exist. `?cond=<id>` pins one, which the capture
 * tools need: an instrument whose subject changes between runs is not an
 * instrument. */
export const condition = pickCondition(
  typeof location === 'undefined' ? '' : `${location.search}${location.hash}`);
export const mood = applyCondition(BASE_MOOD, condition);


export { content };

export async function build(ctx) {
  const lv = new LakeLevel(ctx);
  await lv._build();
  return lv;
}

class LakeLevel {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = meta.id;
    /* No canopy anywhere in this level, so the world field's roof channel is
     * zero everywhere. Saying so explicitly beats shipping a canopy function
     * that happens to evaluate to nothing. */
    this.roof = () => 0;
    this.mapWater = drawLakeWater;
  }

  async _build() {
    const { renderer, scene, step, tier } = this.ctx;

    this.trail = new Trail(ROUTE);

    await step(0.16, '刻蚀冰川盆地');
    this.terrain = new Basin(this.trail);
    this.terrainMat = makeBasinMaterial(renderer);
    /* This ground is broad, not flat. Moraine lips, fan channels and terrace
     * risers must shadow one another under the same sun as the vegetation;
     * disabling terrain casting removed the largest directional-light cue in
     * every frame and made the basin look like an ambient-lit model. */
    scene.add(this.terrain.build(this.terrainMat));

    /* The seal goes down before anything is scattered, because everything that
     * is scattered has to know it is there. */
    await step(0.34, '铺筑八号国道');
    this.road = new LakeRoad(this.terrain, this.trail, tier); scene.add(this.road.root);

    await step(0.38, '铺展冰川湖水');
    this.water = new LakeWater(this.terrain, tier, renderer, scene); scene.add(this.water.root);
    /* The scanned meadow and the photoscanned habitat used to sit here — a
     * glTF flower island layer and eleven families of scanned shrub, fern,
     * grass and rock. Both are gone.
     *
     * They were never compatible with what this project is. The README's first
     * line is zero external art assets and every texture, mesh and sound
     * generated in code, and the jungle keeps that promise completely; the
     * lake quietly did not, and shipped 57 MB of someone else's photographs
     * beside a game whose whole claim is that it contains none.
     *
     * What they were carrying — the middle storey, the mass between the ground
     * and the named specimens — is now carried by flora.js, which is entirely
     * procedural: a sward of real blades, tussock stools, lupin drifts and
     * thirty-one authored native species. That is a better answer than a
     * photograph anyway, because a scan of a plant is a plant seen from one
     * direction under one sky.
     */
    await step(0.58, '种植高地植物');
    /* Everything that grows in this basin, and all of it built in code. */
    /* Ground cover stays off, and this is the third time it has been switched
     * off rather than the first time it was never tried. See the refutation in
     * docs/experiments.md: restricting the card layer to the near field fixed
     * the two failures that killed it before — it no longer tiles the basin
     * and no longer forms a lattice — and it still does not read as cover.
     * At the density that closes the ground it is a crop; at the density that
     * is not a crop it is speckle, and speckle on tawny ground is
     * indistinguishable from the scattered stones already there.
     *
     * What was actually making the near field look bare is in the ground
     * shader, not missing from it. */
    this.veg = new LakeFlora(this.terrain, tier, renderer, { groundCover: false }); this.notable = this.veg.notable; scene.add(this.veg.root);
    await step(0.64, '铺陈岸线器物');
    /* Driftwood, erratics, lichen slabs, thatch mats, fan rills — the non-plant
     * assets that stop a vegetated terrace looking like plant stamps on pebble. */
    this.props = new LakeProps(this.terrain, tier); scene.add(this.props.root);
    /* Planted trees and fences: the two things that say a person has been here,
     * and between them most of the vertical structure and all of the straight
     * lines in a basin that otherwise has neither. */
    await step(0.66, '栽下防风林');
    this.shelter = new LakeShelter(this.terrain, tier); scene.add(this.shelter.root);
    await step(0.68, '拉起围栏');
    this.fences = new LakeFences(this.terrain, tier); scene.add(this.fences.root);
    await step(0.70, '放牧');
    this.farm = new LakeFarm(this.terrain, tier); scene.add(this.farm.root);
    await step(0.71, '架起电线与弯道标志');
    this.roadside = new LakeRoadside(this.terrain, tier); scene.add(this.roadside.root);
    await step(0.715, '砌起涵洞与畜栏');
    this.structures = new LakeStructures(this.terrain, tier); scene.add(this.structures.root);
    await step(0.72, '露出岩层与滩石');
    this.rock = new LakeRock(this.terrain, tier); scene.add(this.rock.root);
    await step(0.74, '铺出观景台');
    this.wayside = new LakeWayside(this.terrain, tier); scene.add(this.wayside.root);
    this.dust = new WheelDust({ tier }); scene.add(this.dust.root);
    this.fauna = new LakeFauna(this.trail, this.terrain, tier); scene.add(this.fauna.root);
    await step(0.72, '抬升南阿尔卑斯');
    this.distance = new LakeDistance(); this.distance.setTier(tier); scene.add(this.distance.root);
  }

  materials() { return [this.terrainMat, ...this.road.materials, ...this.water.standardMaterials, ...this.veg.materials, ...this.props.materials, ...this.shelter.materials, ...this.fences.materials, ...this.farm.materials, ...this.roadside.materials, ...this.structures.materials, ...this.rock.materials, ...this.wayside.materials, ...this.fauna.materials, ...this.distance.materials]; }

  makeAmbience({ camera, walker }) {
    const amb = new LakeAmbience({ camera, walker });
    /* The flocks are placed by LakeFarm from the terrain, so the soundscape
     * has to be told where they ended up rather than guessing. A bleat from
     * an empty paddock is worse than silence. */
    amb.setFlocks(this.farm?.flocks ?? []);
    return amb;
  }

  attachAtmosphere(atmos) {
    // Open, dry alpine air: retain only a light bright veil, never jungle mist.
    atmos.volumeMat.uniforms.uMistAmbient.value.set(0xb7cddd);
    atmos.volumeMat.uniforms.uMist.value.set(0.0013, 0.12, 0.10, 280);
    atmos.volumeMat.uniforms.uBand.value.set(18, 12, 0.015, 0.1);
    atmos.volumeMat.uniforms.uScatter.value.set(0.10, 0.42);
    /* The jungle's depth-derived AO is tuned for leaves resting on litter and
     * stems crowding one another. Across an open, shallow-angle heightfield its
     * sub-pixel sample rings lock to the 60 cm terrain grid and become a dark
     * screen-door pattern over the entire shore. There are no such crevices
     * here: plant contact is carried by real shadows, and the broad landform
     * already has normals and direct light. Keep the shared pass intact for
     * Jungle and make this level's deliberately open air an AO-free case. */
    /* Keep a very broad, weak landform term only. The tight screen-space ring
     * quantises against the kilometre water mesh's depth precision and prints
     * its triangle lattice over the entire lake; fixed-view ablations proved
     * that term, not the wave shader, caused the moiré. Lake plants use real
     * directional shadows and are sunk through the organic mat at their base,
     * so disabling this unsuitable contact estimator does not leave them
     * floating. */
    atmos.aoStrength = 0.045;
    atmos.contactStrength = 0;
  }

  update(dt, host) {
    this.water.update(dt, host.camera, host.sky.sunDir, host);
    this.fauna.update(dt);
    this.farm?.update(dt);
    this.shelter?.update(dt);
    /* The dust is driven by the car, so it needs the walker rather than the
     * camera. It is deliberately NOT in materials(): it is unlit by design —
     * a puff of dust in bright sun is its own light source as far as the eye
     * is concerned, and running it through the canopy patch would tint it
     * with a forest term that does not exist in this level. */
    this.dust?.update(dt, host.walker, host.renderer?.domElement?.height);
    this.veg.update(this.water.time);
    this.veg.cullAround(host.camera.position.x, host.camera.position.z);
    this.props?.cullAround(host.camera.position.x, host.camera.position.z);
    this.shelter?.cullAround(host.camera.position.x, host.camera.position.z);
    this.farm?.cullAround(host.camera.position.x, host.camera.position.z);
    this.terrainMat.userData.uniforms.uTime.value = this.water.time;
  }

  cullAround(x, z) { this.veg?.cullAround(x, z); this.props?.cullAround(x, z); this.shelter?.cullAround(x, z); this.farm?.cullAround(x, z); this.fauna?.cullAround?.(x, z); }

  /* Water must not reflect itself, but the Southern Alps are the dominant
   * object in Lake Pukaki's real reflection. The old exclusion removed them
   * from the PMREM and forced the lake shader to invent a flat sky colour. */
  envExclude() { return [this.water?.root, this.fauna?.root].filter(Boolean); }

  setTier(tier) { this.water?.setTier(tier); this.veg?.setTier(tier); this.props?.setTier(tier); this.fauna?.setTier(tier); this.distance?.setTier(tier); }

  setViewportHeight() {}

  stats() { return { water:this.water?.stats(), flora:this.veg?.stats(), props:this.props?.stats(), shelter:this.shelter?.stats(), fences:this.fences?.stats(), farm:this.farm?.stats(), roadside:this.roadside?.stats(), structures:this.structures?.stats(), rock:this.rock?.stats(), wayside:this.wayside?.stats(), dust:this.dust?.stats(), fauna:this.fauna?.stats(), distance:this.distance?.stats() }; }

  dispose() {
    this.road?.dispose();
    this.water?.dispose();
    this.veg?.dispose();
    this.props?.dispose();
    this.shelter?.dispose();
    this.fences?.dispose();
    this.farm?.dispose();
    this.roadside?.dispose();
    this.structures?.dispose();
    this.rock?.dispose();
    this.wayside?.dispose();
    this.dust?.dispose();
    this.fauna?.dispose();
    this.distance?.dispose();
    new Set(this.terrainMat?.userData.groundTextures || []).forEach((texture) => texture.dispose());
    this.terrainMat?.dispose();
  }
}

export { LAKE_Y, shoreX };
