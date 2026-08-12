/* Weather on the Crossing.
 *
 * The lake's conditions are about the sky and the jungle's are about how much
 * light gets through a canopy. This place has neither problem: it is above the
 * bushline with nothing overhead at all. What changes here is VISIBILITY, and
 * on this mountain that is not a mood, it is the hazard the whole walk is
 * famous for — the Crossing closes more often for weather than any other day
 * walk in the country, and people die on it in summer because the saddle makes
 * its own cloud in an hour.
 *
 * So the set runs along one axis, how much of the mountain you can see, and
 * the sun angle follows from it rather than the other way round. A day you can
 * see Ngauruhoe is a still cold morning; a day you cannot is a westerly with
 * cloud pouring over Red Crater from the Tasman.
 */
import { pickCondition, applyCondition } from '../../world/conditions.js';

export const CONDITIONS = [
  {
    id: 'clear',
    label: '晴',
    /* Low early sun raking the ridge. The only condition where the scoria
     * reads as genuinely red rather than as brown — colour that saturated
     * needs direct light on it, and the whole palette argument for this level
     * depends on at least one condition delivering it. */
    sun: { elevation: 24, azimuth: 68 },
    hemi: { sky: 0x8eb4d4, ground: 0x5a4536, intensity: 0.48 },
    /* 0.00030, NOT 0.0016. At the old value a mountain 1.5 km away kept 9% of
     * itself and arrived as 91% haze — which is why Ngauruhoe rendered as a
     * white wedge for five builds and why I went looking for a snow-line bug
     * that was not there. On a clear day at 1800 m the air is the cleanest in
     * the country and you can see Taranaki 130 km off. */
    fog: { color: 0x9aa8b4, density: 0.00030 },
    air: { turbidity: 2.4, haze: 0xa8b6c2, clouds: 0.58, cloudScale: 1.55 },
    environmentIntensity: 0.88,
    exposureScale: 1.00,
  },
  {
    id: 'highsun',
    label: '正午',
    /* Overhead and hard. Alpine midday is brutal and flat: the shadows go
     * away, the ash goes white, and the mountain loses its shape — which is
     * true and is why nobody photographs it at noon. */
    sun: { elevation: 66, azimuth: 12 },
    hemi: { sky: 0x9cbcda, ground: 0x5c4a3a, intensity: 0.82 },
    fog: { color: 0xa6b2bc, density: 0.00042 },
    air: { turbidity: 3.4, haze: 0xb0bcc6, clouds: 0.36, cloudScale: 1.25 },
    environmentIntensity: 0.96,
    exposureScale: 0.92,
  },
  {
    id: 'cloud',
    label: '云涌',
    /* Cloud pouring over the saddle. Density is 30x the clear day, which
     * sounds absurd written down and is roughly what it looks like when the
     * far side of South Crater disappears while you are standing in it. */
    sun: { elevation: 18, azimuth: 300 },
    hemi: { sky: 0x8e98a0, ground: 0x40382f, intensity: 0.95 },
    fog: { color: 0x8c959c, density: 0.0075 },
    air: { turbidity: 8.0, haze: 0x939ba2, sunScale: 2.4, sunMax: 1.8, clouds: 0.92, cloudScale: 1.80 },
    environmentIntensity: 0.70,
    exposureScale: 1.06,
  },
  {
    id: 'ash',
    label: '硫烟',
    /* Sulphur haze off the vents, held down by an inversion. Warm, dirty,
     * and the one condition where the steam is the most visible thing on the
     * mountain rather than a detail on it. */
    sun: { elevation: 31, azimuth: 108 },
    hemi: { sky: 0xbcae8e, ground: 0x4e4030, intensity: 0.78 },
    fog: { color: 0xa79878, density: 0.0022 },
    air: { turbidity: 6.2, haze: 0xb3a482, clouds: 0.48, cloudScale: 1.40 },
    environmentIntensity: 0.84,
    exposureScale: 0.98,
  },
];

export function pick(hashOrSearch) { return pickCondition(CONDITIONS, hashOrSearch); }
export { applyCondition };
