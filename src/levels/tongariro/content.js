/* What there is to find on the Crossing.
 *
 * No inscriptions and no field notebook, and both absences are deliberate
 * rather than unfinished.
 *
 * The jungle's collection line is rubbings from carved stone, which belongs to
 * a place someone built. The lake's is a field notebook of native species,
 * which belongs to a place that is alive. This mountain is neither: above the
 * saddle nothing has been built and almost nothing lives, and the two things
 * it does have — Ngati Tuwharetoa's tapu on the summits, and the fact that the
 * ground is actively venting sulphur — are both reasons NOT to go collecting.
 *
 * The summits of Tongariro, Ngauruhoe and Ruapehu were gifted to the nation by
 * Te Heuheu Tukino IV in 1887 precisely so they could not be sold or carved up,
 * and they are tapu. A mechanic that asks the player to walk up and take
 * rubbings off them would be the one genuinely offensive thing in this project.
 *
 * So the level's content is the walk. CHAPTERS still names the stages, because
 * knowing you have reached South Crater is worth having; there is simply
 * nothing to pick up.
 */
import { STAGES } from './route.js';

export const GLYPHS = [];
export const SUBJECTS = [];

export const CHAPTERS = [
  { t: STAGES.valley[0],      name: '芒加提波波谷' },
  { t: STAGES.soda[0],        name: '苏打泉' },
  { t: STAGES.staircase[0],   name: '魔鬼阶梯' },
  { t: STAGES.southCrater[0], name: '南火口' },
  { t: STAGES.redRidge[0],    name: '红火口脊' },
  { t: STAGES.scree[0],       name: '碎石坡' },
  { t: STAGES.blueLake[0],    name: '蓝湖' },
];

export function chapterAt(t) {
  let best = CHAPTERS[0];
  for (const c of CHAPTERS) if (t >= c.t) best = c;
  return best;
}

export const TOTAL_RECORDS = 0;

export const content = { GLYPHS, SUBJECTS, CHAPTERS, chapterAt, TOTAL_RECORDS };
