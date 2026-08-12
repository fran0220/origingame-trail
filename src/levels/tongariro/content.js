/* What there is to find on the Crossing.
 *
 * No inscriptions. The jungle's collection line is rubbings from carved stone,
 * which belongs to a place someone built. The summits of Tongariro, Ngauruhoe
 * and Ruapehu were gifted to the nation by Te Heuheu Tukino IV in 1887 so they
 * could not be sold or carved up, and they are tapu. A mechanic that asked the
 * player to walk up and take rubbings off them would be the one genuinely
 * offensive thing in this project.
 *
 * The walk itself is what people come here to look at. The notebook therefore
 * records views along the poled route — the emptiness of South Crater, the
 * colour of Red Crater, the mineral lakes — not objects taken from a summit.
 */
import { STAGES } from './route.js';

export const GLYPHS = [];

const onTrail = (t, off = 0) => ({ kind: 'trail', t, off });

export const SUBJECTS = [
  {
    id: 'mangatepopo', title: '芒加提波波谷', group: '谷地',
    at: onTrail(0.10, 0), radius: 18, range: [12, 80], up: 4,
    hint: '起步后回望两侧熔岩墙',
    text: '旧熔岩流铺满谷底。红草丛只活在林线以下，再往上什么都不长。',
  },
  {
    id: 'staircase', title: '魔鬼阶梯', group: '攀登',
    at: onTrail(0.34, 0), radius: 14, range: [10, 70], up: 8,
    hint: '坡度突然变陡的那段',
    text: '两百米的爬升压进六百米的路。脚下的灰开始被赤渣替换，颜色就是高度。',
  },
  {
    id: 'south-crater', title: '南火口', group: '火口',
    at: onTrail(0.55, 0), radius: 40, range: [20, 160], up: 2,
    hint: '登上平坦灰盘后环顾',
    text: '一公里的死灰，几乎没有近处的东西。空本身就是内容。',
  },
  {
    id: 'ngauruhoe', title: '纳乌鲁霍', group: '火山',
    at: { kind: 'point', x: -2100, y: 1220, z: -1500 },
    radius: 420, idealFill: 0.32, range: [1400, 4200], up: 0,
    hint: '南火口西望，把对称的锥体放入取景框',
    text: '两千五百年的安山岩锥。它看起来像小孩画的火山，正因为还太年轻，来不及被蚀出沟壑。',
  },
  {
    id: 'red-crater', title: '红火口脊', group: '火口',
    at: onTrail(0.70, 4), radius: 22, range: [8, 90], up: 3,
    hint: '脊线上，俯看氧化赤渣的内壁',
    text: '脊的一侧坠入火口七十米。氧化的火山渣是整座山最饱和的颜色，也是它得名的原因。',
  },
  {
    id: 'fumaroles', title: '硫气孔', group: '地热',
    at: onTrail(0.70, -6), radius: 8, range: [6, 48], up: 8,
    hint: '红火口缘上，被风扯斜的白柱',
    text: '蒸汽先竖直升起一两米，再被鞍部的风带走。山还活着的唯一软边。',
  },
  {
    id: 'emerald-lakes', title: '翡翠湖', group: '火口湖',
    at: onTrail(0.895, -29), radius: 28, range: [18, 120], up: 1,
    hint: '碎石坡下，三汪矿物绿水',
    text: '颜色是化学，不是风景滤镜。水在沥出热液地面里的矿物，所以发绿，所以有硫磺味，所以不能喝。',
  },
  {
    id: 'blue-lake', title: '蓝湖', group: '火口湖',
    at: onTrail(0.955, -52), radius: 36, range: [20, 140], up: 1,
    hint: '穿越尽头那面更大、更冷的蓝',
    text: '比翡翠湖更深更冷。穿越在此转向，山开始往下走。',
  },
];

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

export const TOTAL_RECORDS = GLYPHS.length + SUBJECTS.length;

export const content = { GLYPHS, SUBJECTS, CHAPTERS, chapterAt, TOTAL_RECORDS };
