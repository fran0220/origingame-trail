/* What there is to find on this shore.
 *
 * No tablets. The jungle's second collection line was rubbings from carved
 * stone, which belongs to a place someone built; nobody built the Mackenzie.
 * What replaces it is not a substitute mechanic but the same one aimed at
 * living things — this level is a field notebook, and everything in it is
 * native.
 *
 * "Native" is doing real work in that sentence, and it costs the level its
 * most famous image. The purple lupins that fill every photograph of Lake
 * Tekapo are Russell lupin, a North American garden escape that is actively
 * destroying the braided-river gravels the black stilt breeds on. A level that
 * collects New Zealand's own species cannot also be a level with lupins in it.
 * What is left is the real basin: tawny snow tussock, grey shingle, blue-grey
 * greywacke, and a very small number of animals that are genuinely only here.
 *
 * The tables are filled in as their subjects are built — species in P3,
 * animals in P4. The shape is fixed now because the save format and the
 * notebook both read it, and an empty collection has to be a legal state
 * rather than a crash.
 */

/* This level has no rubbings. The field stays, and stays empty, because the
 * run state and the notebook both count two collections and a level that
 * simply omitted one would be asking every reader of those tables to special
 * case it. Generalising them to N collections is worth doing once there is
 * something to put in the second one here. */
export const GLYPHS = [];

/** Native plants and animals, photographed. Filled in P3 and P4. */
export const SUBJECTS = [];

export const CHAPTERS = [
  { t: 0.00, id: 'moraine', name: '冰碛台地' },
  { t: 0.20, id: 'shingle', name: '砾石滩' },
  { t: 0.45, id: 'fan', name: '冲积扇' },
  { t: 0.70, id: 'open-shore', name: '开阔湖岸' },
  { t: 0.88, id: 'head', name: '湖首三角洲' },
];

export function chapterAt(t) {
  let c = CHAPTERS[0];
  for (const ch of CHAPTERS) if (t >= ch.t) c = ch;
  return c;
}

export const TOTAL_RECORDS = GLYPHS.length + SUBJECTS.length;

export const content = { GLYPHS, SUBJECTS, CHAPTERS, chapterAt, TOTAL_RECORDS };
