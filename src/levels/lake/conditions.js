import { pickCondition, applyCondition } from '../../world/conditions.js';
/* Conditions: the same stage under a different sky.
 *
 * This road is driven in under two minutes and a player who comes back does
 * the identical run. Everything else added to this level makes the world
 * denser; this makes it DIFFERENT, which is a separate axis and a much cheaper
 * one — the geometry, the physics and the route are untouched, only the light
 * changes, and light is most of what a landscape looks like.
 *
 * It also fixes something dishonest about a Mackenzie basin that is always at
 * 34 degrees of clear spring morning. This is one of the most weather-exposed
 * places in the country: the reason the vegetation is what it is, the reason
 * the shelterbelts exist and the reason the lake is the colour it is are all
 * weather. A stage that only ever shows one hour of one day is not showing the
 * place.
 *
 * WHAT A CONDITION HAS TO CARRY, and why a sun angle alone is not enough:
 *
 * Moving the sun and leaving everything else is the classic mistake. A low
 * evening sun over a sky whose hemisphere term is still noon-blue produces a
 * scene lit warm from the side and cool from above with no atmosphere joining
 * them, and it reads as a lighting bug rather than as evening. Every entry
 * here therefore carries a COMPLETE set: sun angle, the two hemisphere
 * colours, fog colour and density, exposure, cloud cover, and the strength of
 * the environment term. They were tuned together and they only work together.
 *
 * Exposure is the one people leave out. A camera in real evening light opens
 * up; if the exposure stays where it was at noon, "evening" just means "the
 * picture got darker", which is not what evening looks like to an eye that is
 * adapting.
 */

export const CONDITIONS = [
  {
    id: 'morning',
    label: '晴朗清晨',
    /* The original, and still the default: a clear spring morning with a low
     * cross-light that gives every hummock and spur a readable side. */
    sun: { elevation: 34, azimuth: 26 },
    hemi: { sky: 0x83b4db, ground: 0x526d38, intensity: 0.64 },
    fog: { color: 0xb7cddd, density: 0.00135 },
    air: { clouds: 0.72, cloudScale: 1.35 },
    environmentIntensity: 0.86,
    exposureScale: 1.00,
  },
  {
    id: 'noon',
    label: '正午',
    /* High sun. Short hard shadows, the lake at its most saturated turquoise
     * because the light is going straight into it rather than glancing off,
     * and the haze at its thinnest. Also the least flattering light there is,
     * which is precisely why it should be in the set — a landscape that only
     * ever appears at its best hour is a postcard. */
    sun: { elevation: 68, azimuth: 8 },
    hemi: { sky: 0x9ec6e8, ground: 0x5f7a41, intensity: 0.72 },
    fog: { color: 0xc6dbe8, density: 0.00105 },
    air: { clouds: 0.42, cloudScale: 1.15 },
    environmentIntensity: 0.95,
    exposureScale: 0.88,
  },
  {
    id: 'golden',
    label: '金色黄昏',
    /* Sun low and behind the driver's right shoulder, so the poplars and the
     * fence posts throw their length across the road — long shadows crossing
     * the direction of travel are the strongest sense of speed this level can
     * get for free. Haze thickens and warms; the snow goes pink before the
     * grass does, because it is higher and still in the light. */
    sun: { elevation: 9, azimuth: 292 },
    hemi: { sky: 0x7d9fc4, ground: 0x6b5230, intensity: 0.58 },
    fog: { color: 0xe0b98f, density: 0.00190 },
    air: { clouds: 0.62, cloudScale: 1.45 },
    environmentIntensity: 0.78,
    exposureScale: 1.22,
  },
  {
    id: 'norwester',
    label: '西北风',
    /* The basin's signature weather: a hot dry gale off the divide under a
     * heavy arch of cloud. Flat, shadowless, high haze, and the light comes
     * from everywhere — which makes it the one condition where the FORM of the
     * hills has to carry the frame on its own, because there are no shadows
     * left to do it. Cloud cover near saturation and the sky term pulled well
     * down toward grey. */
    sun: { elevation: 27, azimuth: 315 },
    hemi: { sky: 0x9aa6ad, ground: 0x6a6a55, intensity: 0.86 },
    fog: { color: 0xc8c6bd, density: 0.00320 },
    air: { clouds: 0.96, cloudScale: 1.70 },
    environmentIntensity: 0.62,
    exposureScale: 1.10,
  },
];


/* Cloud cover lives inside mood.air — the sky shader reads it from there — so
 * each entry above overrides `air` rather than the root. Writing it to the
 * root would have done nothing at all. */
export function pick(hashOrSearch) { return pickCondition(CONDITIONS, hashOrSearch); }
export { applyCondition };
