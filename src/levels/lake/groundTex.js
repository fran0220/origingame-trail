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

/* Range expansion, and the absence of it is why this whole file used to bake
 * to flat grey.
 *
 * pfbm() is normalised gradient noise: it is theoretically +/-1 but a
 * multi-octave sum almost never leaves +/-0.28, so unit() lands in roughly
 * 0.36..0.64 with the overwhelming mass at 0.5. Every feature here was then
 * gated on sstep(0.64, 0.88, ...) or higher — thresholds the field reaches on
 * a fraction of a percent of texels. The cobbles, the frost chips, the lichen
 * crusts and the tonal spread were all written, all correct, and all switched
 * off; what got baked was the fallback colour of each blend, which is one
 * constant. A dump of the map (tools/atlas.mjs shingle --level lake) showed a
 * literally uniform 512x512 grey and a literally uniform normal map.
 *
 * So: pass the *raw* pfbm through fld() to get a field that actually covers
 * 0..1, and reserve unit() for places where a gentle mix factor is wanted. */
float fld(float n){ return clamp(n * 2.4 + 0.5, 0.0, 1.0); }
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
/* One layer of close-packed, water-worn discs.
 *
 * Returned: x = face mask, y = dome (1 at the stone's centre, 0 at its rim),
 * z = that stone's own random, w = distance to the join with its neighbour.
 *
 * Factored out because the map needs four of these at different sizes and the
 * per-layer arithmetic is identical; what differs is only the cell count and
 * how much of the tile the layer is allowed to cover.
 *
 * cells is the number of stones across the 2 m world tile, so it *is* the
 * physical size: 4 cells is a 50 cm boulder, 80 cells a 2.5 cm pebble.
 *
 * The warp exists because close packing clips each disc against its own
 * Voronoi boundary, turning the face into a polygon — and on an unwarped
 * lattice those polygons have dead-straight spans meeting at clean 3-way
 * vertices, which is the unmistakable signature of Worley rather than of stone.
 * A water-worn cobble is clipped too, but along a curve.
 *
 * Both the warp's frequency and its amplitude are derived from the layer's cell
 * count rather than fixed, and getting that wrong is what wasted two rounds.
 * Fixed values are only ever right for one layer: at a coarse cell count a
 * fixed frequency has a wavelength of a fraction of a cell, so it roughens the
 * edge into fuzz instead of bending it, while a fixed amplitude is a negligible
 * fraction of a cell width; at a fine cell count the same numbers slide whole
 * groups of stones sideways and scramble the lattice. What has to be constant
 * is the warp measured *in cells*: about a third of a cell per cycle, about a
 * tenth of a cell of displacement. Hence freq and amp both scale with cells,
 * and the period stays integral (a non-integral period stops mod() landing on
 * lattice points and the map seams). */
vec4 stoneLayer(vec2 p, float cells, float wCells, float rLo, float rHi, float rk){
  float wf = wCells / 8.0;
  vec2 warp = vec2(pfbm(p * wf, wCells, 2), pfbm(p * wf + 7.3, wCells, 2))
            * (0.85 / cells);
  vec3 w = pworleyId((p + warp) * (cells / 8.0), cells);
  // Floored because the grade field takes the boulder layer's scale to zero
  // over most of the tile, and an unfloored radius divides by it below.
  float r = max(mix(rLo, rHi, w.z) * rk, 1e-3);
  float u = min(w.x / r, 1.0);
  return vec4(sstep(r, r - 0.055, w.x),
              sqrt(max(0.0, 1.0 - u * u)),
              w.z,
              w.y - w.x);
}

/* Which rock this particular clast is, as a multiplier on the grey palette.
 * fract() of the cell random decorrelates it from the tone, so a stone's rock
 * type and its lightness are independent — as they are on a beach, where a pale
 * stone is as likely to be buff as blue. */
/* Weak, and heavily weighted towards the blue-grey. The first attempt gave the
 * three rocks a ±13% channel spread in roughly equal proportion, and the bake
 * came back as three flat paint colours — blue, buff and sage — in a mosaic,
 * which is decorative landscaping pebble, not a moraine beach. A basin's clasts
 * come overwhelmingly off the same greywacke; the buff is that same rock with an
 * iron stain and the green is a chlorite-rich minority, so the right picture is
 * a blue-grey bed with occasional stones that read *slightly* warm against
 * their neighbours. A tint you can name the colour of is already too strong. */
vec3 clast(float z){
  float h = fract(z * 97.13);
  vec3 c = mix(vec3(1.07, 1.01, 0.93), vec3(0.96, 0.99, 1.04), sstep(0.20, 0.26, h));
  return mix(c, vec3(0.98, 1.02, 0.95), sstep(0.92, 0.96, h));
}

void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  vec2 p = uv * 8.0;

  /* Individual stones, not a thresholded cell-border network.
   *
   * Reading F2-F1 made every Worley cell a pale face surrounded by a dark
   * continuous slot. In a full frame that topology is unmistakably cracked
   * mud, regardless of the grey palette painted over it. Distance to the
   * nearest site instead gives separate overlapping cobbles with matrix
   * between them — the topology a wave-sorted beach actually has. */

  /* Wave sorting grades stone size *across* a beach as well as mixing it —
   * coarse at the storm berm, fine at the swash — so the layer radii are tilted
   * by a field a couple of stones wide. Without it the four sizes are evenly
   * interleaved everywhere, which is a different kind of wrong: an even mixture
   * at every point is what a concrete aggregate looks like, whereas a real bed
   * has patches that are almost all gravel and patches armoured with cobbles.
   *
   * The tilt goes into the *radius*, not into the mask. Multiplying a finished
   * face mask by 0.45 does not remove the stone from the fine end of the beach,
   * it makes it 45% opaque, and a half-opaque disc blended over the gravel below
   * reads as a soap bubble sitting on the bed — a defect the previous version
   * showed as faint large overlapping circles. Shrinking the radius removes the
   * stone properly, and takes its dome, seam and tone with it. */
  float grade = fld(pfbm(p * 0.5, 4.0, 3));

  /* FOUR sizes spanning 20:1, and the count is the point.
   *
   * Two octaves three cell-widths apart is not a graded bed. With the coarse
   * octave close-packed it owned nearly the whole tile, so every visible stone
   * in the frame was the same 17 cm and the beach read as a laid cobbled road —
   * the defect survived the packing fix, the value fix, the warp and the contact
   * seams, because none of those touch the size distribution. A wave-worked
   * greywacke bed is *poorly sorted* by definition: sub-centimetre fines, a
   * dominant few-centimetre gravel, a scatter of cobbles resting proud of it
   * and the occasional boulder the lake could not move. That spread is what
   * gives a frame its scale cue, and it cannot be faked by one size plus noise.
   *
   * Coverage per layer is deliberately unequal — the gravel is the bed and is
   * close-packed, the cobbles are a minority sitting on it, the boulders are
   * rare — rather than every layer being pushed to 97% as before. */
  /* The coarse layer is 33 cm, not the 50 cm first tried. At 4 cells the tile
   * held sixteen boulder sites and the grade field admitted one or two of them,
   * so the map shipped a single half-metre boulder — which the 2 m tile then
   * repeats as a perfectly regular lattice of identical boulders every 2 m, a
   * far louder artefact than the missing size class. Anything genuinely bigger
   * than a cobble has to be geometry, where it can be placed once; a texture can
   * only ever offer sizes small enough that several fit in a tile. */
  vec4 bou = stoneLayer(p,  6.0,  14.0, 0.16, 0.34, smoothstep(0.35, 0.95, grade));
  vec4 cob = stoneLayer(p, 12.0,  32.0, 0.30, 0.62, mix(0.55, 1.16, grade));
  vec4 grv = stoneLayer(p, 32.0,  80.0, 0.52, 0.86, mix(1.10, 0.94, grade));
  /* The fine fill is kept well short of its Voronoi boundary. At 0.60..0.90 it
   * was clipped on every side and baked as straight-edged polygons wedged
   * together — crazy paving, and since the fill occupies most of the gaps it was
   * what the eye read first. Below about 0.8 the disc mostly survives, so the
   * fill reads as small rounded pebbles with the fines matrix visible between
   * them, which is what the bottom of the size distribution actually looks
   * like. Losing a few percent of cover to the matrix is the right trade: the
   * matrix is dark, and the dark slots are what carry the pattern at distance. */
  vec4 peb = stoneLayer(p, 80.0, 208.0, 0.44, 0.76, mix(1.06, 0.92, grade));

  float mBou = bou.x;
  float mCob = cob.x * (1.0 - mBou);
  float mGrv = grv.x * (1.0 - mBou) * (1.0 - mCob);
  float mPeb = peb.x * (1.0 - mBou) * (1.0 - mCob) * (1.0 - mGrv);
  float stoneMask = mBou + mCob + mGrv + mPeb;

  /* Whatever stone owns this texel supplies its dome, its random and its join
   * distance. Resolving ownership once and carrying three scalars forward keeps
   * the shading below written once instead of four times, and — more to the
   * point — means the expensive per-stone grain is sampled once. */
  float dome = mBou * bou.y + mCob * cob.y + mGrv * grv.y + mPeb * peb.y;
  float sid  = mBou * bou.z + mCob * cob.z + mGrv * grv.z + mPeb * peb.z;
  float sjd  = mBou * bou.w + mCob * cob.w + mGrv * grv.w + mPeb * peb.w;
  /* The join width scales with the stone, because the groove between two 50 cm
   * boulders really is wider than the one between two pebbles. Expressed in
   * cell units that means a single number, since a cell *is* a stone width. */
  float jsz = mBou * 0.105 + mCob * 0.075 + mGrv * 0.055 + mPeb * 0.042;

  /* Contact shadow where two stones meet — and this is what F2-F1 is actually
   * for. Read as *topology* it gives cracked mud, which is why the faces come
   * from the distance to the nearest site instead. But once the discs are
   * close-packed the matrix is almost entirely squeezed out, and the map was
   * left carrying its pattern purely on the tonal difference between adjacent
   * faces: a flat mosaic of grey polygons, i.e. terrazzo. What a real
   * close-packed bed has along every one of those joins is a line of shadow,
   * because the stones are rounded and the join is a groove light does not
   * reach. F2-F1 is exactly the distance to that join, so it belongs here, as a
   * multiplier on a surface that already has its own faces. It is also what
   * keeps the shingle legible once individual stones go sub-pixel — the joins
   * survive mip reduction as a darkening, the tonal scatter does not. */
  /* The width has to vary, or the network is the giveaway. At a constant width
   * every boundary in the tile darkens by the same amount over the same
   * distance, and a fully connected graph of equal-width dark lines is read as
   * cracks in one continuous surface — the cracked-mud failure again, arrived at
   * from the other direction. In a real bed some stones are jammed tight with a
   * hairline between them and others have an open slot with fines washed into
   * it. Kept narrow: a wide groove reads as mortar, and mortar is worse than
   * terrazzo. */
  float joint = mix(0.30, 1.30, fld(pfbm(p * 3.0, 24.0, 3)));
  float seam = sstep(0.0, jsz * joint, sjd);
  seam = mix(1.0, seam, stoneMask);

  float grain = fld(pfbm(p * 26.0, 208.0, 3));
  float fine  = fld(pfbm(p * 13.0, 104.0, 3));

  /* Height stacks by size: a bigger stone sits proud of the bed it rests in.
   * The domes are deliberately shallow so each face reads as a plane with a
   * rim, which is how a water-worn greywacke cobble lies — a full hemisphere
   * gives peas in gravy. */
  height = 0.06 + grain * 0.05
         + mPeb * (0.08 + peb.y * 0.08)
         + mGrv * (0.20 + grv.y * 0.14)
         + mCob * (0.44 + cob.y * 0.22)
         + mBou * (0.72 + bou.y * 0.28);

  /* Greywacke: cool blue-grey. Individual stones vary a lot in tone — that
   * variation between *adjacent* cobbles is most of what makes shingle read
   * as shingle rather than as a grey noise field — so the tone comes from the
   * cell index, not from a smooth field sampled at the cell frequency. The
   * latter varies across stones instead of between them and averages out. */
  /* Dry greywacke shingle is a mid-grey, not a pale one — the reflectance of a
   * water-worn face runs about 0.20..0.35, and an earlier 0.56 pale end put the
   * gravel track brighter than the sunlit tussock either side of it, which made
   * it read as laid flagstone rather than as the bed of a braided river.
   * Nothing in this landscape is light-coloured except snow. */
  /* Dropped again once the four layers were in. Adding sizes added stone cover,
   * and the measured linear mean of the bake went the wrong way, from 0.228 to
   * 0.249 — a whole map sitting above the value of sunlit tussock, which is
   * what makes a grey aggregate read as concrete rather than as river stone.
   * The mean is the number to aim at, not the extremes: 0.19..0.21 puts the
   * bed darker than the grass, which is how a Pukaki shingle fan photographs. */
  vec3 pale = vec3(0.296, 0.304, 0.309);
  vec3 dark = vec3(0.140, 0.152, 0.161);

  /* Tonal spread narrows and darkens with size, for a physical reason rather
   * than for variety: the small material lies down *in* the bed, so it is
   * shaded by its neighbours, stays damp longer after rain and carries the
   * dust it sits in, while a proud cobble is bleached on its exposed face.
   * Given the cobbles' range the fine material baked as near-white wedges
   * between the faces, which reads as grout in a paved surface — the strongest
   * single remaining cue that this was a texture and not a beach. */
  /* Blended by the layer masks rather than selected by a step(): the masks are
   * feathered a few texels wide at every stone edge, and switching the palette
   * on a step there puts a hard tonal discontinuity exactly where the geometry
   * is already changing, which shows up as a bright or dark fringe outlining
   * the smaller stones. */
  vec3 tone = (mPeb * mix(dark * 0.84, pale * 0.66, contrast(sid, 1.90))
             + mGrv * mix(dark,        pale * 0.84, contrast(sid, 1.50))
             + mCob * mix(dark,        pale,        contrast(sid, 1.25))
             + mBou * mix(dark * 1.05, pale,        contrast(sid, 1.10)))
            / max(stoneMask, 1e-4);

  /* Per-stone hue, and its absence was the last thing making the bake read as
   * concrete. With the sizes fixed and the value on target the map was still a
   * single grey: every clast differed from its neighbour in lightness only,
   * which is precisely what crushed aggregate looks like, because crushed
   * aggregate is one rock. A shingle bed is the opposite — the lake carried its
   * stones off several hundred square kilometres of catchment, so adjacent
   * clasts are different rocks. Greywacke basins run a fresh blue-grey, an
   * iron-stained buff where a clast has sat oxidising, and a greenish argillite,
   * and it is the *adjacency* of warm and cool stones that the eye reads as
   * stone rather than as a tinted noise field.
   *
   * Kept as a multiplier that averages to 1.0 across the three populations, so
   * the measured mean the far-fade constants are calibrated against does not
   * move. The three are crossfaded over a narrow band rather than selected by a
   * branch: a hard pick is fine while the value is per cell, but the fract()
   * that generates it amplifies any variation in its input enormously, and the
   * layer masks are feathered, so a branch would flicker through all three hues
   * within the few texels of every stone's rim.
   *
   * Sampled per layer from that layer's own cell random and blended by the
   * masks, for the same reason: fract(sid * 97) where sid is itself a blend of
   * four layers' randoms sweeps the whole hue range across every feather band. */
  tone *= (mPeb * clast(peb.z) + mGrv * clast(grv.z)
         + mCob * clast(cob.z) + mBou * clast(bou.z)) / max(stoneMask, 1e-4);

  /* A minority are freshly broken rather than bleached: colder and darker, and
   * only on the sizes big enough to fracture rather than abrade. Kept
   * near-neutral — at a 30% spread between the red and blue channels this tone
   * showed up as distinct blue blotches on the larger faces, and greywacke's
   * fresh break is a dark grey that is only faintly cool. */
  tone = mix(tone, vec3(0.190, 0.203, 0.220),
             sstep(0.74, 0.90, sid) * clamp(mCob + mBou, 0.0, 1.0));

  /* A faint olive where lichen has taken, per stone — lichen colonises a
   * cobble, not a region of the beach. Gated hard and kept weak, and now
   * restricted to the two coarse layers: crustose lichen cannot survive being
   * rolled by waves, so it exists only on the stones too heavy to be turned
   * over, which is exactly the size classes that resist the lake. */
  vec3 lichen = vec3(0.318, 0.336, 0.248);
  float lich = sstep(0.56, 0.86, fld(pfbm(p * 1.5, 12.0, 3)))
             * sstep(0.62, 0.86, sid)
             * clamp(mCob * 0.7 + mBou * 1.0, 0.0, 1.0);
  tone = mix(tone, lichen, lich * 0.34);

  /* Within-stone detail, and the map is unusable without it. Everything above
   * this line varies per *cell*, so once the discs were close-packed each face
   * baked as one constant colour and a dump of the map read as cut paper —
   * correct topology, correct palette, no material. A water-worn greywacke
   * cobble is not a flat chip: it has visible grain, it darkens slightly into
   * its own rim where grit and damp collect, and the wear is uneven across the
   * face. The dome term supplies the rim gradient for free, since it already
   * goes to zero at the stone's edge. */
  /* The grain is sampled per stone, not globally. One shared noise field laid
   * over the whole map looks like a film of sandpaper sitting on top of the
   * mosaic: it does not stop at the stone edges, so it reads as an overlay
   * rather than as the surface of each cobble. Offsetting the domain by the
   * owning cell's random gives every stone its own grain, cut off at its rim —
   * and it stays exactly tiling, because the offset comes from the *wrapped*
   * cell index, so a texel at uv and at uv+1 pick the same cell and the same
   * offset. Two fixed frequencies mixed per stone rather than one frequency
   * scaled per stone: the period passed to pfbm has to equal the scale applied
   * to p or the map seams, so the *scale* cannot carry per-stone variation.
   * Frequency is deliberately *not* tied to the layer, because grain is a
   * property of the rock at millimetre scale and does not grow with the stone. */
  float off = sid * 41.0;
  float grn = mix(fld(pfbm(p * 22.0 + off, 176.0, 3)),
                  fld(pfbm(p * 38.0 + off, 304.0, 3)), sid);
  float speck = fine * 0.40 + grn * 0.60;
  tone *= (0.83 + 0.31 * speck) * mix(0.80, 1.06, dome);

  /* Matrix: wet organic fines and grit in the slots, and it has to be a good
   * deal darker than the faces. The gap darkness is what carries the shingle
   * pattern at any distance where the individual stones are sub-pixel. */
  vec3 fines = mix(vec3(0.104, 0.110, 0.108),
                   vec3(0.238, 0.234, 0.212), fine * 0.65 + grain * 0.35);

  albedo = mix(fines, tone, stoneMask);

  // The join is a groove: darker, deeper, and rougher than either face.
  albedo *= mix(0.52, 1.0, seam);
  height -= (1.0 - seam) * 0.07;

  rough = mix(0.99, 0.72, stoneMask) - (mCob + mBou) * dome * 0.10;
  rough = mix(rough, 0.99, 1.0 - seam);
  ao = mix(0.34, 1.0, clamp(height * 1.45, 0.0, 1.0));
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

  /* Reuse the successful forest floor's hierarchy — broad state masses,
   * clumped inclusions and correlated height/AO — but not its rainforest
   * palette. The previous alpine map drew thousands of long leafField lines
   * directly into the terrain. At walking height they became metre-long
   * scratches, and no amount of colour grading could turn that topology into
   * soil. Individual blades now live in the ground-cover geometry above this
   * surface; this bake describes the compacted organic mat beneath them. */
  float mass = fld(pfbm(p * 0.50, 4.0, 4));
  float fines = fld(pfbm(p * 2.0, 16.0, 5));
  float fibre = fld(pfbm(p * 7.0, 56.0, 3));

  /* Frost-lifted greywacke is sparse and patch-gated. Nearest-site distance
   * makes separate chips; F2-F1 would reconnect every chip into cracked-mud
   * borders, the other rejected ground topology. */
  vec3 st0 = pworleyId(p * 5.0, 40.0);
  vec3 st1 = pworleyId(p * 11.0, 88.0);
  float stonePatch = sstep(0.34, 0.74, fld(pfbm(p * 1.0 + 11.0, 8.0, 3)));
  float stoneBig = sstep(mix(0.11, 0.26, st0.z), 0.03, st0.x) * stonePatch;
  float stoneSmall = sstep(mix(0.08, 0.18, st1.z), 0.02, st1.x)
                   * sstep(0.45, 0.85, fibre);
  float stone = max(stoneBig, stoneSmall * (1.0 - stoneBig));

  /* Rounded lichen/cushion crusts break the fines into centimetre-scale
   * patches without introducing a preferred line direction. */
  vec3 cr = pworleyId(p * 3.0 + 19.0, 24.0);
  float crust = sstep(mix(0.16, 0.34, cr.z), 0.06, cr.x)
              * sstep(0.28, 0.72, fld(pfbm(p + 3.1, 8.0, 3)));

  height = 0.22 + fines * 0.22 + fibre * 0.10;
  height = mix(height, 0.66 + mass * 0.12, crust);
  height = mix(height, 0.80 + fines * 0.16, stone);

  vec3 humus = vec3(0.150, 0.142, 0.098);
  vec3 dryMat = vec3(0.470, 0.432, 0.302);
  vec3 tawny = vec3(0.612, 0.488, 0.246);
  vec3 lichen = vec3(0.400, 0.455, 0.315);
  vec3 rockDark = vec3(0.300, 0.318, 0.316);
  vec3 rockPale = vec3(0.555, 0.560, 0.538);

  albedo = mix(humus, dryMat, fines);
  albedo = mix(albedo, tawny, sstep(0.40, 0.86, fibre) * 0.42);
  albedo = mix(albedo, lichen, crust * 0.68);
  albedo = mix(albedo, mix(rockDark, rockPale, contrast(st0.z, 1.2)), stone * 0.92);
  albedo *= 0.74 + mass * 0.44;

  rough = 0.97 - crust * 0.08 - stone * 0.18;
  ao = mix(0.52, 1.0, clamp(height * 1.2, 0.0, 1.0));
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
  float chip = fld(pfbm(p * 14.0, 112.0, 3));
  float face = fld(pfbm(p * 2.0, 16.0, 3));

  height = 0.5 + face * 0.16 - joint * 0.42 + chip * 0.07;

  vec3 fresh = vec3(0.330, 0.348, 0.372);   // freshly broken: blue-grey
  vec3 weath = vec3(0.452, 0.442, 0.398);   // weathered face: warmer, paler
  vec3 lich  = vec3(0.560, 0.575, 0.505);   // crustose lichen, pale yellow-green

  albedo = mix(fresh, weath, contrast(face, 1.5));
  albedo = mix(albedo, lich, sstep(0.40, 0.86, fld(pfbm(p * 1.0, 8.0, 3))) * 0.42);
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
  float a = fld(pfbm(p * 0.25, 2.0, 4));
  float b = fld(pfbm(p * 0.75 + 3.7, 6.0, 3));
  float c = fld(pfbm(p * 1.50 + 9.1, 12.0, 3));
  /* Three independent fields: broad value, deposit depth, damp/green pockets.
   * The old scalar map could vary brightness but every material state still
   * changed together, which is why the basin read as one tinted sheet. */
  albedo = vec3(0.72 + 0.34 * mix(a, b, 0.35), b, c);
  height = 0.5; rough = 0.5; ao = 1.0;
}
`;
