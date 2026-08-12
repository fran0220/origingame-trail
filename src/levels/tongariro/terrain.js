/* The shape of the Crossing, and the ground it is made of.
 *
 * One height function drives everything, and it was written and MEASURED
 * before any mesh existed — see tools/tprofile.mjs — because the whole
 * argument for this level is topological. What the ground does either side of
 * the track is different in every stage, and that, not the texture, is what
 * makes a stage recognisable:
 *
 *   VALLEY: walls rise on both sides. You are in something.
 *   STAIRCASE: a face you climb, rising to one side, falling behind.
 *   SOUTH CRATER: dead flat in every direction to a distant rim. The only
 *     place in any of the three levels with no near geometry at all, and the
 *     emptiness IS the content.
 *   RED CRATER RIDGE: the ground falls away on BOTH sides — 70 m into the
 *     crater, 33 m down the outer face. The lake managed 1.14 m and the jungle
 *     0.23 m, and two set-pieces died for it.
 *   SCREE: one wall, one long fall at the angle of repose.
 */
import * as THREE from 'three';
import { Noise2D, clamp, smoothstep, lerp } from '../../world/noise.js';
import { Heightfield } from '../../world/heightfield.js';
import { trackElevation, STAGES, BOUNDS, DATUM, VERT, crossSection, POOLS } from './route.js';

/* SLOPES ARE CAPPED AT ABOUT 45 DEGREES, and the cap is a property of the
 * MESH, not of the mountain. Worked out before the second render rather than
 * after the third: a heightfield cell that rises more than its own width has
 * no way to draw the face except as a stretched quad, and with LOD stitching
 * across chunks that is exactly the vertical fluting the first build showed —
 * the crater rim was at 71 degrees, the crater wall and the valley walls at 64.
 *
 * So every cross-slope run was widened until its steepest point is at or under
 * 1.0 rise per run. That is also truer: a scree slope sits at the angle of
 * repose, about 35 degrees, and nothing on this mountain except the odd lava
 * bluff is steeper than 45. The drop survives the change intact — 25 m on both
 * sides of the ridge within 60 m, against 1.14 m on the lake. */
/* How far in from the bounds the mountain has come down to the plateau, and
 * the height it comes down to. 150 m of run for up to 550 m of fall is steep —
 * about 75 degrees at the worst — but this band is outside anywhere the player
 * can walk and its only job is to close the shape honestly. */
/* 420 m, not 150. The mountain has to come down to the plateau at its own
 * boundary or the level is a slab, but doing it in 150 m means up to 550 m of
 * fall over 150 of run — a 75 degree face all the way round, which from the
 * South Crater floor is a hard black wall standing on the horizon with a
 * straight edge across the top. Widening the band to 420 m brings that to
 * about 40 degrees, which is a mountainside.
 *
 * AND IT MUST BE SHORTER THAN THE LEVEL'S HALF-WIDTH. Tried at 420 first and
 * the crater floor tilted: the field is 660 m across, so a 420 m band from
 * both sides overlaps in the middle and the whole level gets lerped toward the
 * plateau — at the centreline it was still 10% plateau, and the dead-flat ash
 * pan that the level is built around acquired a slope. 280 leaves 50 m of
 * untouched ground at the narrowest point. */
export const EDGE_FALL = 280;
export const PLATEAU_Y = -25;

/* RED CRATER IS ALREADY HERE, AND CARVING A SECOND ONE DID NOTHING.
 *
 * The level is named around that crater and appeared not to have it, so a
 * 210 m bowl 70 m deep was gouged into the ridge with a dike standing across
 * it. Measured across the finished terrain, the ground on that side falls
 * monotonically from 264 m at the track to -25 m at 340 m out and the bowl
 * left NO trace: crossSection's redRidge case already drops 118 m on the
 * crater side, and the mountain then keeps falling to the plateau. A 70 m hole
 * cut inside a 290 m hole is invisible.
 *
 * The crater side of the ridge IS the crater. What it was missing was never
 * the hole — it is colour and a dike, and both belong in the surface and the
 * rockfield rather than in the heightfield. Removed rather than left in:
 * geometry that cannot be shown to change a pixel is the irrigator again.
 */

export const STEP = 1.45;
export const CHUNK = 40;
export { BOUNDS };

export { DATUM };

export class Terrain extends Heightfield {
  constructor(trail, seed = 20260810) {
    super(trail, BOUNDS, { step: STEP, chunk: CHUNK, lod: [80, 175], skirt: 4.0 });
    /* Pool centres in world space, resolved once so evalHeight is not doing
     * curve lookups for four basins at every one of half a million cells. */
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    this.basins = POOLS.map((sp) => {
      trail.pointAt(sp.t, P); trail.tangentAt(sp.t, T);
      return { x: P.x + T.z * sp.off, z: P.z - T.x * sp.off,
               r: sp.r, depth: sp.depth, name: sp.name };
    });
    this.n1 = new Noise2D(seed);
    this.n2 = new Noise2D(seed ^ 0x9e3779b9);
    this.n3 = new Noise2D(seed ^ 0x85ebca6b);
    this.buildField();
    this.solve();
  }

  /* Ridged noise: a volcano is creases and spurs, like an eroded valley. fbm
   * alone gives lumps, and lumps read as ground nothing has ever moved across. */
  _ridged(x, z, f) { return 1 - Math.abs(this.n1.n(x * f, z * f)); }

  evalHeight(x, z, q) {
    this.sampleField(x, z, q);
    const t = clamp(q.t, 0, 1);
    let h = crossSection(t, q.side >= 0 ? 1 : -1, q.dist);
    /* Relief, and it is added here rather than inside crossSection because it
     * needs world coordinates and crossSection is deliberately a function of
     * the route alone — that is what lets tools/tprofile.mjs measure the
     * TOPOLOGY without instantiating a terrain or a trail. */
    /* RELIEF IS FADED OUT OVER THE WALKED CORRIDOR.
     *
     * The noise is up to 9 m of local relief, and on the Devil's Staircase —
     * already a 24 degree base grade — it produced 46 DEGREE sections in the
     * built heightfield. A walker ran into one at t = 0.31 and stopped dead
     * for the remaining fifteen minutes of the test.
     *
     * tools/tprofile.mjs could not see it: that samples crossSection, which is
     * the smooth analytic design, not the terrain that gets built on top of
     * it. Measuring the drawing instead of the building is the whole of why
     * this survived four rounds of gradient work.
     *
     * A formed track IS graded — that is what forming one means — so the
     * relief fades to nothing across the tread and comes back within about
     * fifteen metres, which is close enough that nobody standing on the path
     * sees a smooth ribbon running over rough ground. */
    /* 6 to 34 m, not 2.5 to 16. At the tighter fade the residual noise still
     * put 38 degree steps on the tread and the walker stopped at t=0.35. A
     * formed bench is graded well beyond the width of the tread itself. */
    const rough = smoothstep(6, 34, q.dist);
    if (!(t >= STAGES.southCrater[0] && t < STAGES.southCrater[1])) {
      h += this._ridged(x, z, 0.018) * 7.5 * rough;
      h += this.n3.n(x * 0.045, z * 0.045) * 1.9 * rough;
      /* Old lava terraces in the valley: long, slightly tilted sheets
       * rather than isotropic lumps. They stay off the graded tread. */
      if (t < STAGES.staircase[0]) {
        const sheet = this.n2.n(x * 0.0065, z * 0.0028);
        const step = Math.floor((sheet * 0.5 + 0.5) * 4.0) / 4.0;
        h += (step * 2.4 + sheet * 0.55) * rough;
      }
    } else {
      h += this.n2.n(x * 0.010, z * 0.010) * 0.5;
    }
    if (t >= STAGES.redRidge[0] && t < STAGES.redRidge[1]) {
      h += this._ridged(x, z, 0.055) * 3.2 * (1 - smoothstep(0, 26, q.dist)) * rough;
    }
    /* The tread is cut in, the same argument as the jungle's: a path you walk
     * IN reads as a place, a stripe on the ground reads as a texture.
     * Shallower here because this is rock and scoria, not soft forest floor. */
    const hw = this.trail.widthAt(t);
    h -= (1 - smoothstep(hw * 0.6, hw * 2.4, q.dist)) * 0.45;

    /* CARVE THE CRATER BASINS. Each pool gets a bowl a little wider than the
     * water so there is a shore, deepest at the centre and flat-bottomed
     * rather than conical — these are shallow pans of mineral mud, not funnels.
     * Done in the heightfield rather than by sinking the disc afterwards,
     * which is the difference between a lake IN the ground and a lake ON it. */
    for (const b of this.basins) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d > b.r * 1.35) continue;
      let bowl = 1 - smoothstep(b.r * 0.55, b.r * 1.35, d);
      /* THE BASIN RESPECTS THE TRACK. Carving without this dug a pit through
       * the tread at every pool close enough to see — the walk dropped into
       * the crater and the water measured 0% of frame from inside it. Pushing
       * the pools far enough out to miss the track instead cost their
       * visibility: 9.6% became 2.9%. The answer is neither, it is to dig the
       * hole and leave the path, which is what the ground does on the mountain
       * because the route was chosen to go between them. */
      const corridor = this.trail.widthAt(t) + 3.5;
      bowl *= smoothstep(corridor, corridor + 6, q.dist);
      h -= bowl * b.depth;
    }

    /* THE MOUNTAIN COMES DOWN TO THE PLATEAU AT ITS OWN EDGE.
     *
     * Without this the field simply stops at the bounds and the whole level is
     * a rectangular slab standing 500 m above nothing — which is exactly what
     * it was, and I spent five attempts trying to hide it with a skirt of
     * distant geometry instead of fixing the shape. Rendering the terrain on
     * its own, with everything else hidden, showed a mesa with vertical sides
     * in one frame; every ground-level guess before that was wrong.
     *
     * Falling to a constant plateau height also makes the apron's job trivial:
     * it no longer has to match a varying seam, it meets a single number all
     * the way round. A hard problem replaced with none. */
    const edge = Math.min(
      (x - BOUNDS.x0) / EDGE_FALL, (BOUNDS.x1 - x) / EDGE_FALL,
      (BOUNDS.z0 - z) / EDGE_FALL, (z - BOUNDS.z1) / EDGE_FALL);
    const k = smoothstep(0, 1, clamp(edge, 0, 1));
    return lerp(PLATEAU_Y, h, k);
  }

  /* WHERE EACH SURFACE GOES — ash, scoria, lava, and the fourth channel spare.
   *
   * Height and slope only, because on a volcano that is what actually decides
   * it. The consequence worth having is that the ground turns red UNDER the
   * player over the two hundred metres of the Devil's Staircase, rather than
   * at a line someone drew, so the climb is legible as progress without a
   * single word of UI. */
  evalChannels(x, z, y, q, out) {
    const slope = this.slopeAt ? this.slopeAt(x, z) : 0;
    /* KEYED TO REAL ALTITUDE, NOT TO MODEL HEIGHT. These were smoothstep(300,
     * 560, y) against a field that ran 0 to 766 m. Scaling the model vertically
     * by 0.38 to make the track walkable capped it at 291 — so the threshold
     * never fired and the entire level came out grey, losing the one thing it
     * exists for. Third time this session that correcting one dimension
     * without re-checking what depended on it has broken something.
     *
     * Written as the altitude a walker would read off a map, and converted, so
     * the next person changing VERT does not have to find this. The scoria
     * comes in from about 1600 m and owns everything above 1800 — which is
     * where it is on the mountain. */
    const realY = y / VERT + DATUM;
    let red = smoothstep(1520, 1760, realY) * lerp(0.42, 1.0, smoothstep(0.06, 0.38, slope));
    /* RED CRATER IS RED, and this is where that belongs — not in a carved
     * hole. The crater side of the ridge already drops 118 m, so the landform
     * was always there; what was missing is the reason it has a name. The
     * oxidised scoria on those walls is the most saturated thing on the
     * mountain and it is confined to the crater itself, so it is keyed to the
     * stage AND the side rather than to altitude, which cannot tell one flank
     * from the other. */
    const t2 = clamp(q.t, 0, 1);
    /* The ridge itself — both flanks and the tread — has to carry the colour.
     * Gating on side >= 0 and dist > 4 left the walked crest grey and the
     * outer face tan, so every ridge photograph of a level named for Red
     * Crater showed beige. */
    if (t2 >= STAGES.redRidge[0] - 0.02 && t2 < STAGES.redRidge[1] + 0.04) {
      const along = smoothstep(STAGES.redRidge[0] - 0.02, STAGES.redRidge[0] + 0.04, t2)
                  * (1 - smoothstep(STAGES.redRidge[1] - 0.04, STAGES.redRidge[1] + 0.04, t2));
      const craterWall = q.side >= 0 ? smoothstep(2, 28, q.dist) : 0;
      const crest = 1 - smoothstep(0, 18, q.dist);
      const outerFlush = q.side < 0 ? smoothstep(2, 36, q.dist) * 0.55 : 0;
      red = clamp(red + along * (0.55 * crest + 0.95 * craterWall + outerFlush), 0, 1);
    }
    if (t2 >= STAGES.scree[0] && t2 < STAGES.scree[1]) {
      red = clamp(red + (1 - smoothstep(0, 70, q.dist)) * 0.35, 0, 1);
    }
    let black = smoothstep(0.44, 0.80, slope);
    /* Mangatepopo is old lava under tussock, not a meadow. Long dark
     * tongues break the lawn without another ten thousand rocks. */
    if (t2 < STAGES.staircase[0]) {
      const tongue = this.n2.n(x * 0.0022, z * 0.00085);
      const ribbon = this.n3.n(x * 0.0075 + 11, z * 0.0026);
      black = clamp(black
        + smoothstep(0.02, 0.28, tongue) * 0.92
        + smoothstep(0.28, 0.62, ribbon) * 0.62, 0, 1);
    }
    const ash = clamp(1 - red - black, 0, 1);
    out[0] = ash;
    out[1] = clamp(red * (1 - black), 0, 1);
    out[2] = clamp(black, 0, 1);
    let wet = 0;
    for (const b of this.basins) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < b.r * 1.55) {
        wet = Math.max(wet, 1 - smoothstep(b.r * 0.92, b.r * 1.55, d));
      }
    }
    out[3] = wet;
  }

  /* THE FIVE METHODS THE ENGINE REQUIRES OF ANY TERRAIN are height, normal,
   * hollowAt, sampleField and wetAt. Heightfield supplies the first four; this
   * is the fifth, and it is a real answer rather than a stub.
   *
   * Nothing on this mountain above the valley floor is wet. There is no
   * surface water on the Crossing at all between Soda Springs and the Emerald
   * Lakes — that is most of why it is dangerous — and the ground is scoria and
   * ash, which does not hold water for the same reason a gravel drive does
   * not. Returning zero is the truth here, not a placeholder. */
  wetAt(x, z) {
    /* Mineral mud around each pool, and nowhere else. The mountain above
     * the valley does not hold water; the crater lakes do, in a narrow band
     * the shader can darken so the waterline is a wet shore, not a ruled cut. */
    for (const b of this.basins) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < b.r * 1.55) {
        return clamp(1 - smoothstep(b.r * 0.92, b.r * 1.55, d), 0, 1);
      }
    }
    return 0;
  }

  /** Local slope, 0 flat to 1 vertical, from the finished field. */
  slopeAt(x, z) {
    const d = STEP;
    const hx = this.height(x + d, z) - this.height(x - d, z);
    const hz = this.height(x, z + d) - this.height(x, z - d);
    const g = Math.hypot(hx, hz) / (2 * d);
    return clamp(g / (g + 1), 0, 1);
  }

  /** Which stage a world point belongs to, for anything placing objects. */
  stageAtPoint(x, z, q = {}) {
    this.sampleField(x, z, q);
    const t = clamp(q.t, 0, 1);
    for (const [name, [s, e]] of Object.entries(STAGES)) {
      if (t >= s && t < e) return name;
    }
    return 'blueLake';
  }
}

/* ── the surface ────────────────────────────────────────────────────────────
 *
 * Three materials on one volcano, chosen by HEIGHT AND SLOPE rather than
 * painted, because on a volcano they genuinely are a function of height and
 * slope. Ash collects where it is flat and low. Scoria is oxidised where it
 * has been exposed high on the ridge. Lava is what is left wherever it is too
 * steep for anything to sit on.
 *
 * That is also why the climb changes colour UNDER you rather than at a line:
 * the red comes in with altitude over two hundred metres of ascent, which is
 * a thing the player feels as progress without ever being told.
 */
import { bakeSurface } from '../../gfx/bake.js';
import { ASH, SCORIA, LAVA, MACRO } from './groundTex.js';
import { SSTEP } from '../../gfx/glsl.js';

export function makeTerrainMaterial(renderer) {
  const ash = bakeSurface(renderer, ASH, { size: 1024, normalStrength: 2.4 });
  const scoria = bakeSurface(renderer, SCORIA, { size: 1024, normalStrength: 4.4 });
  const lava = bakeSurface(renderer, LAVA, { size: 1024, normalStrength: 3.2 });
  const macro = bakeSurface(renderer, MACRO, { size: 256, normal: false, orm: false });

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1.0, metalness: 0.0,
    /* Assigning these does nothing visually — every fetch is replaced below —
     * but three only compiles the map/normal/roughness paths when the slot is
     * non-null, and those paths are what the injection hooks into. */
    map: ash.map, normalMap: ash.normalMap, roughnessMap: ash.ormMap,
    normalScale: new THREE.Vector2(1, 1),
    envMapIntensity: 0.34,
  });

  const U = {
    tAshA: { value: ash.map }, tAshN: { value: ash.normalMap }, tAshO: { value: ash.ormMap },
    tScoA: { value: scoria.map }, tScoN: { value: scoria.normalMap }, tScoO: { value: scoria.ormMap },
    tLavA: { value: lava.map }, tLavN: { value: lava.normalMap }, tLavO: { value: lava.ormMap },
    tMacro: { value: macro.map },
  };

  mat.customProgramCacheKey = () => 'tongariro-ground-v5';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    mat.userData.shader = sh;

    sh.vertexShader = `
      attribute vec4 aSplat;
      varying vec4 vSplat;
      varying vec3 vWPos;
      varying vec3 vWNrm;
    ` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vSplat = aSplat;
       vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
       vWNrm = normalize(mat3(modelMatrix) * normal);`
    );

    sh.fragmentShader = SSTEP + `
      uniform sampler2D tAshA, tAshN, tAshO;
      uniform sampler2D tScoA, tScoN, tScoO;
      uniform sampler2D tLavA, tLavN, tLavO;
      uniform sampler2D tMacro;
      varying vec4 vSplat;
      varying vec3 vWPos;
      varying vec3 vWNrm;
      vec3 gW; vec2 gUv; vec2 gUvW; float gWall; vec3 gMacro; float gFade;

      /* Weights once, into globals, because albedo, normal and roughness all
       * need the same three and computing them three times is three times the
       * texture fetches for an identical answer. */
      void groundWeights(){
        /* WRONG LEVER, TRIED AND REVERTED. The scoria read as a printed
         * pattern on the ridge, so I halved this to 0.17 to double the tile
         * period from 2.9 m to 5.9 — and it got worse, because the visible
         * feature was never the TILE, it was the vesicles inside it. Doubling
         * the period doubled them too and turned 6 cm bubbles into 12 cm golf
         * balls. The fix belongs in the texture, not in its scale: the worley
         * frequency in groundTex.js went up instead. */
        gUv = vWPos.xz * 0.34;
        /* A wall cannot use a top-down UV: at 70 degrees the projection
         * stretches the texture into vertical smears, and this level is mostly
         * walls. The second set projects along whichever horizontal axis the
         * face points least at, which is the cheap half of triplanar and the
         * half that matters. */
        gUvW = abs(vWNrm.x) > abs(vWNrm.z)
             ? vec2(vWPos.z * 0.34, vWPos.y * 0.34)
             : vec2(vWPos.x * 0.34, vWPos.y * 0.34);
        gWall = sstep(0.62, 0.90, 1.0 - abs(vWNrm.y));
        gMacro = texture2D(tMacro, vWPos.xz * 0.0085).rgb;
        vec3 w = vec3(vSplat.x, vSplat.y, vSplat.z);
        gW = w / max(1e-4, w.x + w.y + w.z);
        /* Fade grain on the pixel's footprint, not on camera distance.
         * Grazing alpine slopes put centimetres of ground in one pixel long
         * before they are far away; leaving full vesicle frequency there is
         * the comb that read as a grid over every Tongariro frame. */
        float gpx = sqrt(max(fwidth(vWPos.x), 1e-5) * max(fwidth(vWPos.z), 1e-5));
        gFade = max(sstep(0.022, 0.090, gpx),
                    sstep(180.0, 520.0, distance(cameraPosition, vWPos)));
      }
      vec3 gFetch(sampler2D a, sampler2D b, sampler2D c){
        vec3 fa = mix(texture2D(a, gUv).rgb, texture2D(a, gUvW).rgb, gWall);
        vec3 fb = mix(texture2D(b, gUv).rgb, texture2D(b, gUvW).rgb, gWall);
        vec3 fc = mix(texture2D(c, gUv).rgb, texture2D(c, gUvW).rgb, gWall);
        return fa * gW.x + fb * gW.y + fc * gW.z;
      }
    ` + sh.fragmentShader;

    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `groundWeights();
       vec3 surfCol = gFetch(tAshA, tScoA, tLavA);
       /* Macro breakup, multiplied not added: a terrain that repeats visibly
        * at fifteen metres is the default outcome of splat blending however
        * good the individual surfaces are, because the eye finds the tile long
        * before it finds the grain. */
       surfCol *= 0.74 + 0.38 * gMacro.r + 0.16 * gMacro.g;
       /* Hard alpine light needs a slope term the hemisphere cannot give:
        * faces that turn from the sun go iron-dark, benches stay pale ash. */
       float face = clamp(dot(normalize(vWNrm), vec3(0.42, 0.78, 0.46)), 0.0, 1.0);
       surfCol *= mix(0.62, 1.08, face);
       /* Mean of the three surfaces, so far pixels keep geology and lose
        * the vesicle comb. Scoria stays iron-red rather than fading to grey. */
       vec3 meanCol = vec3(0.210, 0.168, 0.142) * gW.x
                    + vec3(0.360, 0.132, 0.062) * gW.y
                    + vec3(0.092, 0.084, 0.080) * gW.z;
       surfCol = mix(surfCol, meanCol, gFade);
       /* Wet mineral mud at each pool. Darker and slightly greener, so the
        * waterline is a shore rather than a polygon cut. */
       float wet = clamp(vSplat.w, 0.0, 1.0);
       surfCol = mix(surfCol, surfCol * vec3(0.42, 0.50, 0.46), wet);
       diffuseColor.rgb *= surfCol;`
    );

    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `vec3 nTex = gFetch(tAshN, tScoN, tLavN) * 2.0 - 1.0;
       nTex = mix(nTex, vec3(0.0, 0.0, 1.0), gFade * 0.94);
       vec3 nB = normalize(vec3(nTex.xy * 1.15, max(0.15, nTex.z)));
       vec3 nUp = abs(normal.y) > 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
       vec3 tg = normalize(cross(nUp, normal));
       vec3 bt = cross(normal, tg);
       normal = normalize(tg * nB.x + bt * nB.y + normal * nB.z);`
    );

    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
       {
         vec3 orm = gFetch(tAshO, tScoO, tLavO);
         /* g is roughness in the ORM packing this project bakes. */
         roughnessFactor = clamp(orm.g, 0.05, 1.0);
       }`
    );
  };

  mat.userData.dispose = () => {
    for (const s of [ash, scoria, lava, macro]) {
      s.map?.dispose(); s.normalMap?.dispose(); s.ormMap?.dispose();
    }
  };
  return mat;
}
