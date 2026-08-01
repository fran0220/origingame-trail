/* The inscription atlas.
 *
 * One 4x4 grid of 256-pixel panels: twelve carved tablet faces and four blank
 * weathered ones for the sides and back of the slab, so a whole tablet is one
 * mesh with one material and the atlas cell is chosen by UV rather than by
 * swapping a texture per stone.
 *
 * The script is invented and generated, not authored. Every cell of a panel's
 * grid hashes to a small set of chisel strokes with an occasional ring, which
 * is enough structure that the eye reads a writing system — repeated forms,
 * consistent stroke width, alignment to rules — without anyone having had to
 * design a glyph. Carving is subtracted from the same height field the stone's
 * own weathering is built from, so a groove sits in the rock rather than on it,
 * and the erosion mask runs *over* the carving: a tablet that has been in the
 * rain for centuries has strokes that come and go, and strokes of a uniform
 * depth are the single loudest sign of a decal.
 */
export const TABLET_ATLAS = /* glsl */ `
float unit01(float v){ return clamp(v * 0.5 + 0.5, 0.0, 1.0); }
float hash1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float segDist(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(1e-5, dot(ba, ba)), 0.0, 1.0);
  return length(pa - ba * h);
}

/* One panel's worth of script. Returns distance to the nearest stroke. */
float scriptDist(vec2 iu, float pid){
  vec2 cells = vec2(5.0, 8.0);
  vec2 ci = floor(iu * cells);
  vec2 cf = fract(iu * cells);
  /* The cell is taller than it is wide, so a stroke measured in cell space
   * would be thicker horizontally than vertically. Working in a squared-up
   * space and only compressing at the end keeps the chisel one width. */
  cf.x = (cf.x - 0.5) * (cells.y / cells.x) * 0.42 + 0.5;

  float d = 1e3;
  for (int k = 0; k < 3; k++) {
    float fk = float(k) * 3.7 + pid * 7.3;
    float h1 = hash1(ci + vec2(fk, 1.3));
    float h2 = hash1(ci + vec2(fk, 9.1));
    float h3 = hash1(ci + vec2(fk, 17.7));
    float h4 = hash1(ci + vec2(fk, 23.3));
    /* Sparse on purpose. A grid in which every cell is full reads as a
     * texture; one with gaps reads as words. */
    if (h1 > 0.74) continue;
    vec2 a = vec2(0.26 + h1 * 0.44, 0.16 + h2 * 0.66);
    vec2 b = vec2(0.26 + h3 * 0.44, 0.16 + h4 * 0.66);
    // Snapped to an axis most of the time: a chisel is held square to the rule.
    if (h3 < 0.42) b.x = a.x;
    else if (h4 < 0.42) b.y = a.y;
    d = min(d, segDist(cf, a, b));
  }
  float hr = hash1(ci + vec2(pid * 13.0, 41.0));
  if (hr > 0.87) d = min(d, abs(length(cf - vec2(0.5, 0.5)) - 0.19));
  return d;
}

void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 grid = vec2(4.0, 4.0);
  vec2 gi = floor(uv * grid);
  float pid = gi.y * grid.x + gi.x;
  vec2 lu = fract(uv * grid);

  /* Stone, in the same three states the ruin masonry uses: a cool fresh core,
   * a warm weathering rind that has been open to the rain, and iron oxide in
   * the pits. Its noise is driven by the *atlas* coordinate, not the panel
   * one, so no two panels share a pattern. */
  vec2 p = uv * 9.0;
  float bed = unit01(pfbm(p * vec2(0.6, 2.4), 9.0, 4));
  float grain = unit01(pfbm(p * 5.0, 9.0, 3));
  float pit = smoothstep(0.62, 0.92, unit01(pworley(p * 3.2, 9.0).x * 2.0 - 1.0));
  float rind = clamp((bed - 0.5) * 1.9 + 0.5, 0.0, 1.0);

  vec3 core = vec3(0.150, 0.156, 0.153);
  vec3 buff = vec3(0.238, 0.200, 0.142);
  vec3 iron = vec3(0.170, 0.099, 0.055);
  vec3 moss = vec3(0.086, 0.116, 0.058);

  albedo = mix(core, buff, rind * 0.86);
  albedo = mix(albedo, iron, pit * 0.55);
  albedo *= 0.86 + 0.30 * unit01(pfbm(p * 0.55, 9.0, 3));
  albedo *= 1.0 - grain * 0.18;

  height = 0.55 + bed * 0.13 - pit * 0.38 - grain * 0.05;
  rough = mix(0.82, 0.95, rind);
  ao = 1.0 - pit * 0.5 - grain * 0.10;

  // Panels 12-15 are blank stone: the sides, back and top of the slab.
  if (pid >= 12.0) return;

  /* The dressed face. A tablet was flattened before it was cut, so the panel
   * is smoother and less pitted than the rough stone around it, and it carries
   * a border groove that stops short of the edges. */
  vec2 inner0 = vec2(0.115, 0.135);
  vec2 iu = (lu - inner0) / (1.0 - 2.0 * inner0);
  float onFace = step(0.0, iu.x) * step(iu.x, 1.0) * step(0.0, iu.y) * step(iu.y, 1.0);

  float dressed = smoothstep(0.02, 0.09, min(min(lu.x, 1.0 - lu.x), min(lu.y, 1.0 - lu.y)));
  height += dressed * 0.05;
  rough = mix(rough, rough * 0.93, dressed);

  // Border groove, just outside the script block.
  float bx = min(iu.x + 0.055, 1.055 - iu.x);
  float by = min(iu.y + 0.045, 1.045 - iu.y);
  float border = 1.0 - smoothstep(0.0, 0.016, min(bx, by));

  float carve = 0.0;
  if (onFace > 0.5) {
    float d = scriptDist(iu, pid);
    carve = 1.0 - smoothstep(0.028, 0.058, d);
  }
  carve = max(carve, border * dressed);

  /* Erosion over the carving, not under it. The mask is a slow field, so a
   * tablet loses whole phrases to one weathered patch rather than losing every
   * stroke a little — which is what the ruins actually look like, and it is
   * also what makes the legible parts read as legible. */
  float wear = smoothstep(0.24, 0.74, unit01(pfbm(p * vec2(1.7, 1.1), 9.0, 4)));
  carve *= 0.30 + 0.70 * wear;

  height -= carve * 0.42;
  ao -= carve * 0.55;
  albedo = mix(albedo, albedo * 0.42, carve * 0.85);
  // Moss and dust collect in a groove, which is the only reason old carving
  // is readable at a distance at all.
  albedo = mix(albedo, moss, carve * smoothstep(0.45, 0.95, unit01(pfbm(p * 2.1, 9.0, 3))) * 0.55);
  rough = mix(rough, 0.99, carve * 0.6);
  ao = clamp(ao, 0.0, 1.0);
}
`;

/** Atlas layout, shared by the baker and the mesh that maps UVs into it. */
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
export const BLANK_PANEL = 12;
