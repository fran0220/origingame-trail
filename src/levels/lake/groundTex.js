/* Ground surfaces for a Mackenzie basin.
 *
 * Three tiling PBR sets: wave-graded lake shingle, the thin grey-brown soil
 * the tussock grows out of, and greywacke bedrock for the fans and anything
 * steep.
 *
 * The colours are the point, and they are not the colours a jungle uses. New
 * Zealand's Southern Alps are greywacke — a hard, poorly-sorted grey
 * sandstone that fractures into angular, flat-faced pieces and weathers to a
 * cool blue-grey with a faint olive cast where lichen has taken. There is no
 * warm brown anywhere in this landscape except in the tussock itself, which is
 * why an ochre-based palette lifted from a temperate scene reads as instantly
 * wrong here: high-country ground is *cold*, and the only warmth is the grass.
 *
 * Each export is the body of a `surf()` as described in gfx/bake.js.
 *
 * TILING CONTRACT — as in world/groundTex.js: everything works in a common
 * cell space `p = uv * 8`, and every noise call passes a period exactly equal
 * to the scale applied to p.
 */

const HELP = /* glsl */ `
float contrast(float x, float k){
  x = clamp(x, 0.0, 1.0);
  return x <= 0.5 ? 0.5 * pow(2.0 * x, k) : 1.0 - 0.5 * pow(2.0 * (1.0 - x), k);
}
float unit(float x){ return x * 0.5 + 0.5; }
`;

/* ── Lake shingle ───────────────────────────────────────────────────────────
 * Wave-sorted greywacke cobbles. Two properties do all the work and both are
 * consequences of the sorting rather than decoration:
 *
 * The stones are *flat and stacked*. Wave action lays discs shingle-fashion,
 * overlapping down-beach, so the surface is a mosaic of near-circular faces
 * with dark slots between them — not a heap of spheres. A Worley field read as
 * cell interiors gives exactly that; read as distance-to-point it gives peas.
 *
 * The size is graded, and mixed. A real beach has a scatter of larger cobbles
 * sitting proud of a matrix of smaller stuff, so two Worley octaves at
 * different scales are composited rather than one being used alone.
 */
export const SHINGLE = HELP + /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 8.0;

  // Big cobbles, sparse; small stones, dense. Both as cell interiors.
  vec2 big = pworley(p * 3.0, 24.0);
  vec2 small = pworley(p * 9.0, 72.0);
  float bigFace = sstep(0.02, 0.30, big.y - big.x);
  float smallFace = sstep(0.02, 0.26, small.y - small.x);

  // Which cobbles are the proud ones. Sparse, so the beach is mostly matrix.
  float proud = sstep(0.62, 0.92, unit(pfbm(p * 3.0, 24.0, 3)));

  float slot = 1.0 - bigFace * proud - smallFace * (1.0 - proud) * 0.7;
  float grain = unit(pfbm(p * 26.0, 208.0, 3));

  height = 0.5 + bigFace * proud * 0.34 + smallFace * (1.0 - proud) * 0.16
         - slot * 0.10 + grain * 0.05;

  /* Greywacke: cool blue-grey. Individual stones vary a lot in tone — that
   * variation between adjacent cobbles is most of what makes shingle read as
   * shingle rather than as a grey noise field — so the per-cell hash drives a
   * lightness spread rather than a uniform colour. */
  float cellTone = unit(pfbm(p * 3.0 + 17.0, 24.0, 2));
  vec3 pale = vec3(0.475, 0.492, 0.505);
  vec3 dark = vec3(0.198, 0.212, 0.232);
  vec3 stone = mix(dark, pale, contrast(cellTone, 1.4));

  // A faint olive where lichen has taken on the drier stones up the beach.
  vec3 lichen = vec3(0.395, 0.418, 0.318);
  float lich = sstep(0.70, 0.95, unit(pfbm(p * 1.5, 12.0, 3))) * 0.30;

  albedo = mix(stone, lichen, lich);
  albedo *= 0.80 + 0.20 * bigFace;
  // Wet-looking slots: water sits between stones long after the faces dry.
  albedo = mix(albedo, albedo * 0.55, slot * 0.45);

  rough = 0.90 - bigFace * 0.16 + slot * 0.06;
  ao = 1.0 - slot * 0.55;
}
`;

/* ── Tussock ground ─────────────────────────────────────────────────────────
 * Not soil, and that distinction is the whole texture. Between the tussocks of
 * a high-country basin there is very little bare earth: there is a mat of dead
 * leaf bases, moss, lichen crust, small cushion plants and stone. The dominant
 * colour is a pale tawny grey — the colour of last season's dead tussock
 * leaves — and it is much lighter and much less saturated than any soil.
 *
 * This is the surface the level spends most of its frame area on, so its
 * value is set to sit *below* the living tussock geometry that stands in it;
 * ground brighter than the plants makes a grassland look like a mown lawn.
 */
export const TUSSOCK_MAT = HELP + /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 8.0;

  float mass = unit(pfbm(p * 0.5, 4.0, 3));
  float thatch = unit(pfbm(vec2(p.x * 1.5, p.y * 9.0), vec2(12.0, 72.0), 4));
  float crust = unit(pfbm(p * 5.0, 40.0, 4));

  // Stones pushed up through the mat by frost, which this ground is full of.
  vec2 st = pworley(p * 7.0, 56.0);
  float stones = sstep(0.20, 0.02, st.y - st.x)
               * sstep(0.66, 0.88, unit(pfbm(p * 7.0 + 5.0, 56.0, 2)));

  height = 0.5 + thatch * 0.20 + crust * 0.10 + stones * 0.26 - 0.1;

  vec3 tawny = vec3(0.452, 0.398, 0.268);   // dead tussock leaf
  vec3 grey  = vec3(0.372, 0.372, 0.340);   // lichen crust
  vec3 moss  = vec3(0.245, 0.288, 0.192);   // damp hollows
  vec3 rock  = vec3(0.400, 0.412, 0.428);

  albedo = mix(grey, tawny, contrast(thatch, 1.3));
  albedo = mix(albedo, moss, sstep(0.62, 0.92, mass) * 0.45);
  albedo = mix(albedo, rock, stones * 0.85);

  rough = 0.95 - stones * 0.14;
  ao = 1.0 - sstep(0.5, 0.0, thatch) * 0.30 - stones * 0.10;
}
`;

/* ── Greywacke ──────────────────────────────────────────────────────────────
 * The rock everything here is made of. Greywacke has no bedding you can see at
 * this scale and no crystal grain either; what it has is *fracture*. It breaks
 * into angular blocks along two near-orthogonal joint sets, and every exposed
 * face is a flat plane meeting other flat planes at hard edges. Rendering it
 * with the rounded, banded look of a sedimentary rock is the usual mistake and
 * it makes New Zealand mountains look like Utah.
 */
export const GREYWACKE = HELP + /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 8.0;

  // Two joint sets, near-orthogonal, giving angular blocks.
  vec2 j1 = pworley(vec2(p.x * 2.0 + p.y * 0.35, p.y * 2.0), 16.0);
  vec2 j2 = pworley(vec2(p.x * 3.5 - p.y * 0.20, p.y * 3.5 + 9.0), 28.0);
  float joint = max(sstep(0.16, 0.0, j1.y - j1.x), sstep(0.12, 0.0, j2.y - j2.x));

  // Shattered chips in the joints, which is where frost gets in.
  float chip = unit(pfbm(p * 14.0, 112.0, 3));
  float face = unit(pfbm(p * 2.0, 16.0, 3));

  height = 0.5 + face * 0.16 - joint * 0.42 + chip * 0.07;

  vec3 fresh = vec3(0.330, 0.348, 0.372);   // freshly broken: blue-grey
  vec3 weath = vec3(0.452, 0.442, 0.398);   // weathered face: warmer, paler
  vec3 lich  = vec3(0.560, 0.575, 0.505);   // crustose lichen, pale yellow-green

  albedo = mix(fresh, weath, contrast(face, 1.5));
  albedo = mix(albedo, lich, sstep(0.66, 0.94, unit(pfbm(p * 1.2, 8.0, 3))) * 0.42);
  albedo = mix(albedo, fresh * 0.72, joint * 0.6);

  rough = 0.86 + joint * 0.08 - face * 0.06;
  ao = 1.0 - joint * 0.70;
}
`;

/* ── Macro ──────────────────────────────────────────────────────────────────
 * Low-frequency multiplier over everything, to break the tile repeat at the
 * scale a whole hillside is seen at. Larger and gentler than the jungle's,
 * because there is nothing here to hide a repeat behind: a basin is open
 * ground seen out to two hundred metres, and the tiling of a 1 m texture over
 * that distance is the single most visible artefact available.
 */
export const MACRO_HI = HELP + /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 8.0;
  float a = unit(pfbm(p * 0.25, 2.0, 4));
  float b = unit(pfbm(p * 0.75, 6.0, 3));
  float v = mix(a, b, 0.4);
  albedo = vec3(0.80 + 0.30 * v);
  height = 0.5; rough = 0.5; ao = 1.0;
}
`;
