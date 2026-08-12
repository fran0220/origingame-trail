/* The four surfaces of an andesite volcano.
 *
 * The whole case for a third level is that it looks like nowhere else in this
 * game, and that is decided here rather than by any object standing on the
 * ground. The lake is green tussock and turquoise water; the bush is green
 * canopy over black litter. NOTHING HERE IS GREEN. Above the saddle the
 * Crossing is ash, oxidised scoria, black lava and sulphur, and those four
 * cover the entire visible world.
 *
 * They are also genuinely different MATERIALS, not one rock in four tints,
 * which is what makes a splat blend read as geology rather than as a stain:
 * ash is fine and matte and holds footprints, scoria is coarse and porous and
 * catches light on every edge, lava is dense and glassy and stays dark even in
 * full sun, and sulphur is a crust that grows rather than a rock that sits.
 */
const HELP = /* glsl */ `
float contrast(float x, float k){
  x = clamp(x, 0.0, 1.0);
  return x <= 0.5 ? 0.5 * pow(2.0 * x, k) : 1.0 - 0.5 * pow(2.0 * (1.0 - x), k);
}
float unit(float x){ return x * 0.5 + 0.5; }
`;

/* ── Ash ────────────────────────────────────────────────────────────────────
 * The floor of South Crater. Volcanic ash walked flat by two hundred thousand
 * pairs of boots a year: a fine grey pan, almost featureless at arm's length,
 * with the coarse lapilli that the wind cannot move left proud on the surface.
 *
 * The temptation is to make it interesting. It must not be — a kilometre of
 * flat grey nothing is the single strongest thing this level has, and detail
 * scattered evenly across it would turn an unnerving emptiness into carpet.
 */
export const ASH = HELP + /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 8.0;
  float mass  = unit(pfbm(p * 0.4, 3.0, 3));
  float fine  = unit(pfbm(p * 6.0, 48.0, 3));
  /* Lapilli: sparse coarse grains, second-nearest worley so they read as
   * separate stones rather than as a cell pattern. */
  /* Lapilli at 24 cells were 12 cm stones lying on the ash pan; the real ones
   * the wind cannot move are 2 to 4 cm. */
  vec2 lap = pworley(p * 9.0, 72.0);
  float stones = sstep(0.16, 0.02, lap.y - lap.x);
  stones *= step(0.55, unit(pfbm(p * 3.0, 24.0, 2)));

  height = 0.5 + fine * 0.10 + stones * 0.22 - mass * 0.06;

  vec3 pale = vec3(0.302, 0.276, 0.248);
  vec3 dark = vec3(0.188, 0.172, 0.156);
  albedo = mix(dark, pale, contrast(mass, 1.2));
  albedo = mix(albedo, vec3(0.338, 0.304, 0.268), stones * 0.55);
  /* Ash is the matte end of everything here: no glass in it at all. */
  rough = 0.97 - stones * 0.06;
  ao = 1.0 - stones * 0.10;
}
`;

/* ── Scoria ─────────────────────────────────────────────────────────────────
 * The red. Basaltic andesite full of gas bubbles, oxidised by its own heat on
 * the way out, and it is the colour people remember Red Crater by.
 *
 * The vesicles are the whole texture: every one is a hole with a lit rim and a
 * shadowed floor, so the surface reads as bright speckle over dark at any
 * distance and never as flat paint. That is why worley and not fbm.
 */
export const SCORIA = HELP + /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 8.0;
  /* VESICLES ARE MILLIMETRES, NOT CENTIMETRES. At 48 cells across a texture
   * that tiles every 2.9 m each bubble was 6 cm across, which reads as a golf
   * ball rather than as gas trapped in cooling rock — and on a mountain with
   * no grass or trees to interrupt it, that is the whole surface. 160 cells
   * puts them at 18 mm, which is the size they are. */
  vec2 ves = pworley(p * 20.0, 160.0);
  float bubble = sstep(0.34, 0.0, ves.x);          // the holes
  /* CLASTS ARE RUBBLE, NOT PAVING. Once the vesicles came down to 18 mm this
   * took over the surface: 16 cells across a 2.9 m tile is an 18 cm polygon,
   * and a field of those reads as cracked mud or a tiled floor. Broken scoria
   * is 3 to 10 cm, so the frequency goes up and the joint darkening comes
   * down — the lumps should be felt, not outlined. */
  vec2 big = pworley(p * 5.5, 44.0);
  float clast = sstep(0.22, 0.03, big.y - big.x);  // edges between lumps
  float grit = unit(pfbm(p * 18.0, 144.0, 3));
  float mass = unit(pfbm(p * 0.6, 5.0, 4));

  height = 0.5 - bubble * 0.34 - clast * 0.14 + grit * 0.12;

  /* Iron red where it oxidised, purple-black in the shadow of every vesicle,
   * and a rust bloom on the broad masses so the field is not one hue. */
  vec3 rust = vec3(0.520, 0.148, 0.052);
  vec3 deep = vec3(0.210, 0.062, 0.038);
  vec3 bloom = vec3(0.610, 0.230, 0.078);
  albedo = mix(deep, rust, contrast(grit, 1.3));
  albedo = mix(albedo, bloom, contrast(mass, 1.6) * 0.45);
  albedo *= 1.0 - bubble * 0.55;
  albedo *= 1.0 - clast * 0.15;

  rough = 0.92 - bubble * 0.10;
  ao = 1.0 - bubble * 0.55 - clast * 0.20;
}
`;

/* ── Lava ───────────────────────────────────────────────────────────────────
 * Old flows in the Mangatepopo valley and the steep faces everywhere else.
 * Dense, dark, and the one surface here with any specular life: fresh andesite
 * has glass in it and catches a hard highlight on every broken face, which is
 * what stops black rock reading as a hole in the frame.
 */
export const LAVA = HELP + /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 8.0;
  /* Ropy pahoehoe folds, domain warped so the ridges wander like a skin that
   * wrinkled while it moved rather than like a corrugation. */
  float warp = pfbm(p, 8.0, 4) * 1.9;
  float ropes = pfbm(vec2(p.x * 0.7, p.y * 2.6 + warp), vec2(6.0, 20.0), 4);
  vec2 blk = pworley(p * 1.6, 13.0);
  float joints = sstep(0.24, 0.02, blk.y - blk.x);
  float rubble = unit(pfbm(p * 9.0, 72.0, 3));

  height = 0.5 + ropes * 0.24 - joints * 0.38 + rubble * 0.07;

  vec3 black = vec3(0.062, 0.058, 0.058);
  vec3 grey  = vec3(0.134, 0.128, 0.126);
  vec3 warm  = vec3(0.150, 0.108, 0.086);
  albedo = mix(black, grey, contrast(unit(ropes), 1.5));
  albedo = mix(albedo, warm, rubble * 0.22);
  albedo *= 1.0 - joints * 0.40;

  /* Glass: the highlight lives on the crests of the ropes, so roughness has
   * to be driven by the same field the height is, not by an independent one. */
  rough = 0.86 - contrast(unit(ropes), 2.0) * 0.30;
  ao = 1.0 - joints * 0.42;
}
`;

/* ── Macro ──────────────────────────────────────────────────────────────────
 * One low-frequency field, tiled far larger than the others, multiplied over
 * everything. Without it a splat terrain repeats visibly at about fifteen
 * metres no matter how good the individual surfaces are, because the eye finds
 * the tile long before it finds the grain.
 */
export const MACRO = HELP + /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 2.0;
  float a = unit(pfbm(p, 2.0, 5));
  float b = unit(pfbm(p * 2.7 + 11.3, 6.0, 4));
  float v = mix(a, b, 0.4);
  albedo = vec3(0.5 + (v - 0.5) * 0.62);
  height = 0.5; rough = 0.5; ao = 1.0;
}
`;
