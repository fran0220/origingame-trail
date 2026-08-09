/* Conditions under a canopy.
 *
 * The lake's conditions are about the sky. This forest barely has one — the
 * canopy is closed and the player looks up into leaves — so the same idea has
 * to be built out of entirely different quantities.
 *
 * What actually changes in a rainforest interior between one hour and another
 * is not the colour of the light. It is HOW MUCH OF IT GETS THROUGH, and in
 * what shape. That is governed by two things:
 *
 *   THE SUN'S ELEVATION, because a canopy is a horizontal filter. A high sun
 *   punches small bright holes straight down onto the floor; a low one has to
 *   go through many times as much leaf, and what survives arrives as long
 *   near-horizontal beams between the trunks. Those are different phenomena,
 *   not brighter and dimmer versions of one.
 *
 *   THE MIST, which is what makes a shaft visible at all. A beam of light in
 *   clean air is invisible — you see the surfaces it lands on, not the beam.
 *   Every god ray in this level is scattering off suspended water, so the
 *   density of that water is the difference between a forest with shafts and
 *   a forest with bright patches on the floor.
 *
 * So the set runs along those two axes rather than along a clock.
 */
import { pickCondition, applyCondition } from '../../world/conditions.js';

/* HEMISPHERE INTENSITY, RESET AGAINST A MEASUREMENT — all four scaled by the
 * same 2.91, so the relationships between them are untouched.
 *
 * Measured over ten stations, the level was arriving at a mean frame luminance
 * of 40.6 out of 255, with 19.2% of every frame below 16 and 51.7% below 32.
 * Below 16 there is no recoverable detail at all: a fifth of the screen was
 * not dark, it was empty, and at t = 0.15 it was a third. Nothing above 240
 * anywhere, so the whole image was living in the bottom sixth of the range
 * with all the headroom unused.
 *
 * A rainforest interior IS dark and this file argues at length that it should
 * be. But dark is a relationship between tones, and there is no relationship
 * inside a bucket a fifth of the frame is crushed into. The hemisphere light
 * here is the canopy bounce — the green light a forest floor is actually lit
 * by, since almost no sun reaches it — and it was set far too low for that
 * job. */
export const CONDITIONS = [
  {
    id: 'morning',
    label: '晨光',
    /* The original: sun high enough to reach the floor, mist thick enough to
     * carry the shafts. */
    sun: { elevation: 38, azimuth: 152 },
    hemi: { sky: 0x82a081, ground: 0x63513a, intensity: 1.6 },
    fog: { color: 0x1b2718, density: 0.028 },
    air: { turbidity: 5.5, haze: 0x475538 },
    environmentIntensity: 1.0,
    exposureScale: 1.00,
  },
  {
    id: 'highsun',
    label: '正午穿顶',
    /* Sun almost overhead. The beams shorten to near-vertical columns and most
     * of the light arrives as sunflecks on the floor instead — which is the
     * single most characteristic thing about a tropical forest at midday, and
     * the reason the understorey is shaped the way it is. Less mist, because
     * the morning's has burned off, so the shafts are crisper and fewer. */
    sun: { elevation: 74, azimuth: 188 },
    hemi: { sky: 0x9ec0a2, ground: 0x6e5c42, intensity: 1.8 },
    fog: { color: 0x22301e, density: 0.024 },
    air: { turbidity: 4.2, haze: 0x51603f },
    environmentIntensity: 1.10,
    exposureScale: 0.86,
  },
  {
    id: 'mist',
    label: '晨雾',
    /* Heavy river mist before it lifts. Contrast collapses, distance closes to
     * almost nothing, and the shafts become the loudest thing in the frame
     * because there is so much water for them to scatter off. Exposure has to
     * come UP — mist is bright, and a fog that renders dark is a fog being
     * lit as though it were smoke. */
    sun: { elevation: 22, azimuth: 138 },
    hemi: { sky: 0xa8bcae, ground: 0x6d6350, intensity: 2.27 },
    fog: { color: 0x44513f, density: 0.070 },
    air: { turbidity: 8.5, haze: 0x6b7860 },
    environmentIntensity: 0.92,
    exposureScale: 1.18,
  },
  {
    id: 'overcast',
    label: '阴雨',
    /* No direct sun at all, which removes every shaft in the level and is
     * exactly why it belongs in the set: it is the only condition where the
     * forest has to work as MASS and silhouette rather than as beams. Light
     * comes from the whole sky, so the understorey actually gets more of it
     * than usual while the canopy gets less contrast. Wet, cool, green. */
    sun: { elevation: 12, azimuth: 210 },
    hemi: { sky: 0x8fa6a4, ground: 0x4e5340, intensity: 2.73 },
    fog: { color: 0x2b3529, density: 0.050 },
    air: { turbidity: 9.5, haze: 0x55604e, sunScale: 3.2, sunMax: 2.4 },
    environmentIntensity: 0.80,
    exposureScale: 1.05,
  },
];

export function pick(hashOrSearch) { return pickCondition(CONDITIONS, hashOrSearch); }
export { applyCondition };
