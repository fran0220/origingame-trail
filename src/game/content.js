/* Authored content: what is left at Karangahake, and what grows over it.
 *
 * THE SITE IS REAL AND SO ARE THE RUINS. The first version of these texts was
 * a lost civilisation — priests, masons, people who counted the rain — and it
 * was the last tropical thing in a level that had otherwise been made a New
 * Zealand one. It also left the stone unexplainable: there are no temple ruins
 * in this country.
 *
 * There ARE stone ruins in New Zealand bush and they are industrial. The
 * Karangahake Gorge carries the concrete and masonry of the Woodstock and
 * Talisman gold batteries, their tramways and their tunnels, standing in
 * regenerating native forest a century after the last shift walked out in
 * 1920. Every structure this level already builds — walls, terraces, a hall,
 * a spillway, a tramway — is something that site actually has, so nothing had
 * to be rebuilt. Only the story was wrong.
 *
 * The inscriptions are therefore what a working site leaves behind: a mining
 * district boundary post, a tally clerk's returns, a stonemason counting his
 * own blocks, and the last shift.
 *
 * Nothing here invents a place. Every anchor is either a point on the trail
 * curve — which is the one coordinate system the whole level is built around —
 * or a constant lifted from the system that built the thing being pointed at,
 * so a subject cannot drift away from the geometry it names when that geometry
 * is retuned. Plant subjects go one step further and name a *species and an
 * anchor* rather than a position, because an individual plant's coordinates
 * are a placement result and not something a content table can know.
 */
import { SWALLOW, brookOffset } from '../levels/jungle/brook.js';
import { IMPACT, LIP } from '../levels/jungle/water.js';

/* Trail-relative placement. `off` is a signed lateral offset in metres using
 * the same convention as Trail.nearest().side — negative left of the walking
 * direction, positive right — so a value read off the debug overlay can be
 * pasted straight in here. */
const onTrail = (t, off) => ({ kind: 'trail', t, off });
const atPoint = (x, z, y = null) => ({ kind: 'point', x, z, y });
/* Nearest instance of `species` to a trail anchor. Falls back to the anchor
 * itself when the scatter happened not to put one there. */
const nearPlant = (species, t, off, search = 14) => ({ kind: 'plant', species, t, off, search });

/* ------------------------------------------------------------- inscriptions */

/**
 * Twelve carved tablets, read in any order.
 *
 * Six sit within a couple of metres of the tread and six are far enough off it
 * that they can only be found by leaving the path — that split is the entire
 * incentive structure of the game, so it is authored rather than noised. The
 * `off` values below are checked against Trail.widthAt() at boot; a tablet
 * that would land on the walkable dirt is a placement bug, not a surprise.
 */
export const GLYPHS = [
  {
    id: 'boundary', t: 0.055, at: onTrail(0.055, 2.4),
    title: '界桩',
    hint: '小径起点右侧',
    text: '此处以下为塔利斯曼矿区。\n未持证者不得进入隧道。\n——奥克兰矿务局，一八九六',
  },
  {
    id: 'counters', t: 0.13, at: onTrail(0.13, -7.6),
    title: '计量员',
    hint: '离开小径，左侧林下',
    text: '本周碎石一千一百四十吨。\n汞板回收金一百零三盎司。\n差额照旧记在"损耗"一栏。',
  },
  {
    id: 'first-channel', t: 0.22, at: onTrail(0.22, 2.9),
    title: '第一条水渠',
    text: '我们没有搬走这座山。\n只是劝水改道，去推那台水轮。',
  },
  {
    id: 'mason', t: 0.31, at: onTrail(0.31, -9.4),
    title: '砌石工的抱怨',
    hint: '窄道前，左侧深处',
    text: '第四百块。掌心裂了三回。\n工头说这堵墙会立一百年。\n他没说会不会有人记得是谁砌的。',
  },
  {
    id: 'naming', t: 0.44, at: onTrail(0.44, 2.2),
    title: '给雨命名',
    text: '细雨叫"打湿引信"。\n横雨叫"停工"。\n下三天不停的那种，矿工不给它起名字。',
  },
  {
    id: 'terrace', t: 0.57, at: onTrail(0.57, 11.5),
    title: '捣矿机台面',
    hint: '离开小径，右侧平台',
    text: '三十道捣杆，日夜不停，每分钟九十下。\n峡谷两英里外都听得见。\n停下来的时候，人反而睡不着。',
  },
  {
    id: 'into-the-hall', t: 0.68, at: onTrail(0.68, -2.6),
    title: '进入厂房',
    text: '这里曾有屋顶、皮带、以及一百二十匹马力。\n现在只剩混凝土的骨架，\n和从窗洞里长进来的树。',
  },
  {
    id: 'dry-year', t: 0.76, at: onTrail(0.76, -10.8),
    title: '枯水年',
    hint: '窄道深处，左侧',
    text: '一九〇八年夏，水位太低，水轮转不动。\n没有水就没有电，没有电就没有捣矿。\n那年整个峡谷都停了工。',
  },
  {
    id: 'the-crack', t: 0.84, at: atPoint(5.9, -313.4),
    title: '裂缝',
    hint: '门址附近的石堆',
    text: '基座上这道裂缝比矿场还老。\n他们在上面浇了混凝土，\n混凝土也裂在同一条线上。',
  },
  {
    id: 'spillway', t: 0.90, at: atPoint(9.8, -359.8),
    title: '尾水道',
    hint: '潭东，水消失的地方',
    text: '水从这里回到河里，带着它推过的一切。\n下游的河床至今是灰白色的。',
  },
  {
    /* Moved two metres south and one east off (-8.2, -365.0).
     *
     * A tablet's dressed face is aimed at the nearest point on the trail
     * rather than authored, so where it stands decides where it looks and
     * therefore where a reader has to stand to read it. Until Trail.indexAt()
     * landed, "nearest point" was computed in arc length and then looked up as
     * a sample index, which pointed this tablet's face about twenty metres up
     * the route from the place it was supposed to address. Correcting that
     * swung it round to face the pool squarely — and revealed that the ground
     * 1.6 m in front of it, where a reader would have to be, is 2.9 m below
     * its base and under water.
     *
     * So the placement was always wrong and the old bug was hiding it. This
     * spot is still west of the pool and still off the trail at 7 m, which is
     * what the hint promises, but the reader stands on level ground. */
    id: 'abandon', t: 0.93, at: atPoint(-7.0, -374.0),
    title: '弃殿',
    hint: '潭西的石阶下',
    text: '不是一夜之间。\n是一年比一年少几个人，\n直到最后一个数水者把刻刀放下。',
  },
  {
    id: 'last', t: 0.975, at: atPoint(LIP.x - 4.2, IMPACT.z + 3.4),
    title: '最后一班',
    hint: '瀑布脚下',
    text: '一九二〇年十一月，塔利斯曼停产。\n最后一班人把工具留在原处，走出隧道。\n树用了一百年，把这里收了回去。',
  },
];

/* ------------------------------------------------------------------ subjects */

/**
 * Twelve photographic subjects.
 *
 * `radius` is the subject's own size in metres and is what the framing score
 * is measured against — it decides how much of the frame a well-taken shot
 * fills, so a fern and a waterfall can be judged by the same rule. `range` is
 * the distance band the subject reads at: outside it the shot is refused
 * rather than scored badly, because a waterfall photographed from two metres
 * away is not a bad photograph of a waterfall, it is a photograph of foam.
 */
export const SUBJECTS = [
  {
    id: 'buttress-tree', title: '板根巨木', group: '林木',
    at: nearPlant('tree', 0.12, -6.0), radius: 2.8, range: [8, 30], up: 4.0,
    hint: '小径前段，一株撑开板根的大树',
    text: '雨林的土层薄得可怜，几十厘米之下就是死的。树没法向下扎，只好向外摊开，把自己钉在地面上。',
  },
  {
    id: 'closed-canopy', title: '闭合树冠', group: '林木',
    at: onTrail(0.20, 0), radius: 3.6, range: [8, 30], up: 16.0,
    hint: '在小径上抬头',
    text: '头顶这层叶子截走了九成以上的光。脚下之所以能走人，正是因为几乎没有东西能在这种暗处长起来。',
  },
  {
    id: 'the-narrows', title: '窄道', group: '地貌',
    at: onTrail(0.38, 0), radius: 2.8, range: [7, 28], up: 2.2,
    hint: '小径最窄的一段',
    text: '路在这里只剩一步宽。不是有人修窄了它，是两侧的下层植被一直在往回收。',
  },
  {
    id: 'fallen-giant', title: '倒木', group: '林木',
    at: nearPlant('log', 0.47, 5.5), radius: 1.8, range: [4, 20], up: 1.0,
    hint: '中段小径旁倒下的树干',
    text: '一棵倒下的树在林冠上开了个洞。那个洞底下会长出一片几乎走不过去的密丛，十五米外却什么都没有。',
  },
  {
    id: 'brook', title: '溪流', group: '水',
    /* The channel's own offset curve, not a guessed number. It closes to about
     * four metres from the tread at one point and opens to fourteen at
     * another, so an authored constant would put this subject in the trees for
     * most of the trail's length. */
    at: onTrail(0.62, brookOffset(0.62)), radius: 1.6, range: [3, 18], up: 0.7,
    hint: '小径左侧，循着水声离开小径',
    text: '这条溪最后会汇进潭里。它比神庙老得多，也会比神庙留得更久。',
  },
  {
    id: 'light-shaft', title: '光柱', group: '光',
    at: onTrail(0.79, -3.2), radius: 4.0, range: [8, 36], up: 9.0,
    hint: '林子开始变亮的地方',
    text: '看得见的光柱意味着空气里有东西——水汽、孢子、被踩起来的浮尘。晴朗的空气不会给你这个。',
  },
  {
    id: 'gateway', title: '门址', group: '遗迹',
    at: atPoint(5.6, -313.2), radius: 3.2, range: [8, 32], up: 3.0,
    hint: '走出林子后的第一处石构',
    text: '门是整座建筑最先被看见的部分，也是最先塌的部分。它承的重量最少，可它两侧什么也没有。',
  },
  {
    id: 'colonnade', title: '柱列', group: '遗迹',
    at: atPoint(-6.9, -337.2), radius: 3.0, range: [7, 30], up: 3.2,
    hint: '台地上，一列断柱',
    text: '柱身是一段段垒起来的鼓形石。塌了以后它们会顺着地势滚开，滚的方向能告诉你墙是朝哪边倒的。',
  },
  {
    id: 'terrace', title: '台地', group: '遗迹',
    at: atPoint(-15.0, -341.0), radius: 5.5, range: [14, 48], up: 3.0,
    hint: '整片高出地面的平台',
    text: '他们先把地做平，再在上面盖房子。地基比墙费的工多，可地基还在，墙没了。',
  },
  {
    id: 'plunge-pool', title: '深潭', group: '水',
    at: atPoint(0, -356), radius: 5.1, range: [12, 52], up: 1.2,
    hint: '清空处尽头的水面',
    text: '潭底是瀑布几千年砸出来的。水落下的地方永远比周围深，这个坑一直在长。',
  },
  {
    id: 'swallow', title: '落水洞', group: '水',
    /* Anchored at the rim rather than at the bed. The ground here is cut
     * nearly three metres below the pool surface, so a ground-level focus
     * point sits underneath the terrain and the visibility march would refuse
     * every shot of it. */
    at: atPoint(SWALLOW.x, SWALLOW.z), radius: 2.0, range: [4, 22],
    up: SWALLOW.depth + 0.6,
    hint: '潭东侧，水消失进地下的地方',
    text: '潭没有出口，水却没有涨。它从这里下去，进了石灰岩里的某条路。碑上说，扔下去的东西没有浮起来过。',
  },
  {
    id: 'falls', title: '瀑布', group: '水',
    at: atPoint(IMPACT.x, IMPACT.z, IMPACT.y), radius: 7.9, range: [16, 70],
    up: (LIP.y - IMPACT.y) * 0.55,
    hint: '路的尽头',
    text: '崖顶到潭面的落差把水打散成雾，雾又把光散开。你听见的低频来自水砸进水里，高频来自还在空中的那部分。',
  },
];

/** Chapters, used for the HUD label and for progression telemetry nodes. */
export const CHAPTERS = [
  { t: 0.00, id: 'trailhead', name: '小径起点' },
  { t: 0.18, id: 'closed-canopy', name: '闭合林冠' },
  { t: 0.42, id: 'the-narrows', name: '窄道' },
  { t: 0.62, id: 'rising-ground', name: '抬升的地面' },
  { t: 0.80, id: 'ruins', name: '遗迹' },
  { t: 0.90, id: 'the-falls', name: '瀑布' },
];

export function chapterAt(t) {
  let c = CHAPTERS[0];
  for (const ch of CHAPTERS) if (t >= ch.t) c = ch;
  return c;
}

/** Total records the player can collect. Drives the sun and the finale gate. */
export const TOTAL_RECORDS = GLYPHS.length + SUBJECTS.length;

/* Everything above, as the one object the game layer is handed.
 *
 * The run state, the HUD and the session used to `import { GLYPHS, SUBJECTS }`
 * from this file directly, which quietly made three general-purpose modules
 * into modules about *this* level: a notebook that can only count this level's
 * two collections, and a save that can only be restored against this level's
 * ids. None of those three files has an opinion about jungles; they were only
 * ever reaching for whatever tables happened to be here. Handed the tables
 * instead, they work for any level that can produce a pair, and this file
 * becomes what it always described itself as — one level's content.
 */
export const content = { GLYPHS, SUBJECTS, CHAPTERS, chapterAt, TOTAL_RECORDS };
