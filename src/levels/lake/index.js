/* Lake Pukaki's eastern shore, under the Southern Alps.
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

export const meta = {
  id: 'lake',
  title: '冰河湖',
  blurb: '沿冰蚀湖的东岸北行，尽头是南阿尔卑斯与库克山。',
};

export const mood = {
  /* Far plane at fifty kilometres rather than the jungle's nine hundred
   * metres. The range is the subject and it is genuinely that far away. What
   * makes this affordable is that the far distance is drawn in its own pass —
   * see render/distance.js — so this frustum never has to resolve a leaf at
   * 0.08 m and a summit at 45 km in the same depth buffer. */
  camera: { fov: 55, near: 0.10, far: 50_000 },
  /* Late morning, north-north-west. In the southern hemisphere the sun is in
   * the northern sky, so this puts it up the lake and slightly across it —
   * which is what keeps the range modelled rather than flattened into a
   * silhouette, and what makes the water read as bright rather than black. */
  sun: { elevation: 47, azimuth: 22 },
  /* An order of magnitude thinner than the jungle's 0.038, and warm-neutral
   * rather than green. This is only the near-field haze; the aerial
   * perspective that carries the mountains is computed from the atmosphere
   * rather than faked with a fog colour. */
  fog: { color: 0xa8b6c4, density: 0.0016 },
  /* Sky term: real, deep, high-altitude blue — the thing a forest can never
   * have. Ground term: pale tawny, bouncing off dry tussock and grey shingle,
   * and much brighter than a forest floor's because there is far more light
   * arriving to bounce. */
  hemi: { sky: 0x7ea6d8, ground: 0x9a8e73, intensity: 0.85 },
  environmentIntensity: 1.0,
  /* Two stops under the jungle's, and in the same direction a photographer
   * would move the dial walking out of forest into a glacial basin at noon.
   * Dry tussock, pale shingle and a snowfield in frame make this one of the
   * brightest scenes there is; metering it like an understory is what put the
   * first cut of this level at a median luminance of 0.89 with no black
   * anywhere in the histogram, which is not a bright landscape, it is a
   * blown one. */
  exposure: 0.42,
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
    turbidity: 2.2,
    ground: 0x8d9098,
    haze: 0xaeb9c4,
    beta: [0.10, 0.17, 0.42],
    sunScale: 5.2,
    sunMax: 4.4,
  },
  /* Nothing in this basin is under anything. That switches off both halves of
   * the canopy light model — the sunfleck mask, which would otherwise print
   * leaf shadows on bare gravel, and the through-the-leaves fill, which here
   * would be a second copy of the skylight the hemisphere light above already
   * provides. See render/canopy.js. */
  openSky: true,
};

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
    this.mapWater = null;
  }

  async _build() {
    const { renderer, scene, step } = this.ctx;

    this.trail = new Trail(ROUTE);

    await step(0.16, '刻蚀冰川盆地');
    this.terrain = new Basin(this.trail);
    this.terrainMat = makeBasinMaterial(renderer);
    scene.add(this.terrain.build(this.terrainMat));
  }

  materials() { return [this.terrainMat]; }

  makeAmbience() { return null; }

  update() {}

  cullAround() {}

  envExclude() { return []; }

  setTier() {}

  setViewportHeight() {}

  stats() { return {}; }
}

export { LAKE_Y, shoreX };
