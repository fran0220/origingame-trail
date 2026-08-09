/* Conditions, the mechanism.
 *
 * The lake grew a set of four skies and the jungle needs the same idea with a
 * completely different set of knobs — one has cloud cover over an open basin,
 * the other has mist under a closed canopy — so the TABLE belongs to the level
 * and only the machinery belongs here.
 *
 * The rule a condition table has to obey is the same in both places and is
 * worth stating once: A SUN ANGLE ALONE IS NOT A CONDITION. Moving the sun and
 * leaving the atmosphere gives a scene lit warm from one side and cool from
 * above with nothing joining them, which reads as a lighting bug rather than
 * as a time of day. An entry carries sun, hemisphere, fog, exposure and
 * whatever air terms its level uses, tuned together.
 */

/**
 * Choose an entry from a table.
 *
 * `?cond=<id>` pins one, which every capture tool depends on — an instrument
 * whose subject changes between runs is not an instrument. Otherwise it
 * rotates by day: a player returning tomorrow gets a different world, while
 * one restarting to compare a run against their last does not have the light
 * move underneath them mid-session.
 */
export function pickCondition(table, hashOrSearch = '') {
  const m = /(?:^|[?&#])cond=([a-z-]+)/i.exec(hashOrSearch);
  if (m) {
    const hit = table.find((c) => c.id === m[1].toLowerCase());
    if (hit) return hit;
  }
  const day = Math.floor(Date.now() / 86_400_000);
  return table[day % table.length];
}

/**
 * Fold a condition into a level's mood block.
 *
 * `air` is MERGED rather than replaced, because a level's air block carries
 * physical constants — scattering coefficients, sun scale — that describe the
 * atmosphere itself and have nothing to do with the time of day. A condition
 * that replaced the whole block would silently drop them. The inverse mistake
 * is just as easy: cloud cover lives INSIDE air on the lake, and writing it to
 * the root does nothing at all, which is the quietest kind of bug there is.
 */
export function applyCondition(mood, cond) {
  const out = { ...mood };
  if (cond.sun) out.sun = { ...cond.sun };
  if (cond.hemi) out.hemi = { ...cond.hemi };
  if (cond.fog) out.fog = { ...cond.fog };
  if (cond.environmentIntensity !== undefined) {
    out.environmentIntensity = cond.environmentIntensity;
  }
  if (cond.air) out.air = { ...mood.air, ...cond.air };
  if (cond.exposureScale !== undefined) {
    out.exposure = (mood.exposure ?? 1) * cond.exposureScale;
  }
  out.conditionId = cond.id;
  out.conditionLabel = cond.label;
  return out;
}
