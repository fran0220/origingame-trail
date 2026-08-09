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
import { shoreX } from './basin.js';

/* This level has no rubbings. The field stays, and stays empty, because the
 * run state and the notebook both count two collections and a level that
 * simply omitted one would be asking every reader of those tables to special
 * case it. Generalising them to N collections is worth doing once there is
 * something to put in the second one here. */
export const GLYPHS = [];

const fauna = (id, species, title, hint, text, radius=.65, range=[1.2,28]) => ({
  id, title, group:'原生动物', hint, text, at:{kind:'fauna',species}, radius, range, up:0,
});
const plant = (id, species, title, hint, text, t) => ({
  id, title, group:'原生植物', hint, text, at:{kind:'plant',species,t,off:8,search:1000}, radius:1.15, range:[1.5,30], up:.65,
});

/** Twenty stable field-notebook records: eight animals and twelve landscapes/plants. */
export const SUBJECTS = [
  fauna('kea','kea','啄羊鹦鹉','留意冰碛台地上盘旋的橄榄绿大鸟。','高山鹦鹉以好奇和橙红色翼下覆羽闻名。',.8,[2,34]),
  fauna('karearea','karearea','新西兰隼','抬头寻找贴着山风滑翔的猎手。','新西兰特有猛禽，短翼与长尾适合高速追猎。',.75,[2,38]),
  fauna('black-fronted-tern','black-fronted-tern','黑额燕鸥','砾石滩上方有灰白色尖翼。','南岛辫状河床的特有燕鸥，黑额与红喙醒目。',.68,[1.5,32]),
  fauna('black-billed-gull','black-billed-gull','黑嘴鸥','在扇缘岸边寻找步行的白色鸥鸟。','全球最受威胁的鸥类之一，细长黑喙是身份标记。',.72,[1.4,26]),
  fauna('paradise-shelduck','paradise-shelduck','黑翅麻鸭','开阔湖岸近水处寻找栗白相间的水鸟。','新西兰特有的大型麻鸭，常成对活动。',.85,[2,32]),
  fauna('nz-scaup','nz-scaup','新西兰潜鸭','湖首近岸有一只深色小潜鸭。','新西兰唯一特有潜鸭，圆头紧凑，擅长潜水。',.7,[1.5,27]),
  fauna('southern-grass-skink','southern-grass-skink','南方草石龙子','湖首草丛脚边有短距离穿行的小蜥蜴。','南岛干燥草地的原生石龙子，以日照暖身。',.3,[.7,9]),
  fauna('dragonfly','dragonfly','原生蜻蜓','冲积扇湿草上方寻找悬停的蓝绿色小影。','近岸湿地的空中猎手，透明双翼不断修正位置。',.3,[.8,10]),

  /* The two mountain subjects are 1330 m further up-valley than they were.
     They are aimed at the distant ranges, and distance.js translates that whole
     backdrop by BACKDROP_Z so the road cannot drive into it — an anchor left
     behind points a viewfinder at empty sky beside the peak it names. Their
     range windows open with them, because the valley they are seen from is
     also longer now. */
  {id:'aoraki',title:'奥拉基／库克山',group:'山岳',hint:'沿湖向北，把最远雪峰放入取景框。',text:'奥拉基从南阿尔卑斯主脊升起，是湖面视线的终点。',at:{kind:'point',x:-597,y:1450,z:-10530},radius:520,idealFill:.25,range:[7000,11500],up:0},
  {id:'alps-layers',title:'南阿尔卑斯层峦',group:'山岳',hint:'从路线望向湖首，寻找蓝灰色重叠山脊。',text:'空气透视把三层山体依距离洗向天空色。',at:{kind:'point',x:650,y:430,z:-5630},radius:470,idealFill:.36,range:[3300,6400],up:0},
  {id:'glacial-turquoise',title:'冰川蓝',group:'湖色',hint:'在开阔岸段俯看不透明的蓝绿湖面。',text:'悬浮的冰川岩粉散射短波光，形成特卡波独有的蓝。',at:{kind:'point',x:shoreX(-405)-22,y:.1,z:-405},radius:12,idealFill:.35,range:[12,130],up:0},
  {id:'shingle-wet-edge',title:'砾石湿线',group:'地貌',hint:'下到第一段水边，拍摄浪缘深色砾带。',text:'波浪反复淘洗并按粒径分选灰岩砾石。',at:{kind:'point',x:shoreX(-150)+1.5,z:-150},radius:4,range:[5,30],up:.15},
  {id:'lateral-moraine',title:'侧碛台地',group:'地貌',hint:'起点附近回望脚下笔直的高台。',text:'旧冰缘堆下的冰碛形成高于现湖岸的长凳状台地。',at:{kind:'trail',t:.08,off:8},radius:7,range:[8,45],up:2},
  {id:'alluvial-fan',title:'冲积扇',group:'地貌',hint:'路线中段登上向湖面展开的浅凸砾坡。',text:'侧溪离开陡壁后失速，把沉积物铺成扇面。',at:{kind:'trail',t:.50,off:12},radius:9,range:[10,55],up:2},
  {id:'head-delta',title:'湖首三角洲',group:'地貌',hint:'在终段拍摄低平、分汊的湖首岸线。',text:'融水在入湖处卸下细砾，持续推进三角洲。',at:{kind:'trail',t:.93,off:-9},radius:10,range:[10,60],up:1},
  plant('silver-tussock','silver-tussock','银叶丛生草','在台地寻找银黄叶束。','细叶从基部成簇，在高地风中保住温度。',.12),
  plant('matagouri','matagouri','野爱荆','冲积扇上寻找深色多刺灌丛。','硬刺与细小叶片适应麦肯齐盆地的干风。',.48),
  plant('flax','flax','新西兰麻','近水湿地寻找剑形深绿叶扇。','叶丛为湿岸鸟类和昆虫提供遮蔽。',.72),
  plant('toetoe','toetoe','南岛香蒲草','湿岸寻找高举浅色羽状花序的草丛。','原生香蒲草的柔软花穗在湖风中标出风向。',.78),
  plant('raoulia-cushion','raoulia-cushion','劳尔氏垫状草','在湖首砾地贴近地面寻找灰绿植物垫。','紧贴地面的垫状形态抵御强风和干旱。',.90),
];

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
