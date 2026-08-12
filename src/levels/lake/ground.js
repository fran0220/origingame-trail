/* The basin's surface shader.
 *
 * Same construction as the jungle's — a stock MeshStandardMaterial with its
 * surface fetches replaced, so three's lighting, shadow, fog and tone-mapping
 * chunks keep working — but a much simpler blend, because this ground has less
 * happening on it and the things it does have are different.
 *
 * The channels are the basin's: aSplat.x is how gravelly the ground is,
 * .y is wetness at the waterline, .z is concavity, .w is metres of water over
 * the point. Only the first three are read here; the fourth belongs to the
 * water pass.
 */
import * as THREE from 'three';
import { bakeSurface } from '../../gfx/bake.js';
import { SSTEP } from '../../gfx/glsl.js';
import { SHINGLE, TUSSOCK_MAT, GREYWACKE, MACRO_HI } from './groundTex.js';

/* Every surface in this file is baked in code from levels/lake/groundTex.js.
 *
 * It did not used to be. A scanned ambientCG grass set and a Poly Haven gravel
 * set were loaded here and passed in as `meadowAssets`, with the procedural
 * bakes demoted to "a deterministic fallback for tools and old cached builds".
 * That is backwards for this project: the README's first line is zero external
 * art assets, and every texture, mesh and sound generated in code. A scan is a
 * photograph of someone else's ground, it has to ship as 57 MB beside the game,
 * and it is the reason the deploy allowlist silently broke.
 *
 * The bakes were always here and always worked. What the scans bought was a
 * head start on grass structure, and that job now belongs to the sward in
 * flora.js — real blades with real silhouettes — which is a better answer than
 * a photograph of blades on a flat plane anyway.
 */

export function makeBasinMaterial(renderer) {
  const shingle = bakeSurface(renderer, SHINGLE, { size: 1024, normalStrength: 2.1 });
  const mat_ = bakeSurface(renderer, TUSSOCK_MAT, { size: 1024, normalStrength: 2.4 });
  const rock = bakeSurface(renderer, GREYWACKE, { size: 1024, normalStrength: 3.6 });
  const macro = bakeSurface(renderer, MACRO_HI, { size: 256, normal: false, orm: false });

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1.0, metalness: 0.0,
    map: mat_.map, normalMap: mat_.normalMap, roughnessMap: mat_.ormMap,
    normalScale: new THREE.Vector2(1, 1),
    /* An order of magnitude more than the jungle's 0.30, and this is the
     * single biggest lighting difference between the two levels. A forest
     * floor sees a few degrees of sky through a hole in the canopy. Open
     * high-country ground sees the entire hemisphere, and at this altitude
     * that hemisphere is very bright and very blue — which is exactly why
     * shadows in the mountains are blue and shadows in a forest are green. */
    envMapIntensity: 0.62,
  });

  const U = {
    tGrvA: { value: shingle.map }, tGrvN: { value: shingle.normalMap }, tGrvO: { value: shingle.ormMap },
    tMatA: { value: mat_.map }, tMatN: { value: mat_.normalMap }, tMatO: { value: mat_.ormMap },
    tRokA: { value: rock.map }, tRokN: { value: rock.normalMap }, tRokO: { value: rock.ormMap },
    tMacro: { value: macro.map },
    uWetTint: { value: new THREE.Color(0x2b3238) },
    uMossTint: { value: new THREE.Color(0x234b1d) },
    uDebug: { value: 0 },
    uTime: { value: 0 },
  };
  mat.userData.uniforms = U;
  mat.userData.groundTextures = [
    shingle.map, shingle.normalMap, shingle.ormMap,
    mat_.map, mat_.normalMap, mat_.ormMap,
    rock.map, rock.normalMap, rock.ormMap,
    macro.map,
  ];
  /* Named so tools/atlas.mjs can dump any of them to a PNG. Judging a ground
   * texture from a frame confuses "no detail was authored" with "the detail is
   * there and the blend threw it away". */
  mat.userData.maps = {
    shingle: shingle.map, shingleN: shingle.normalMap, shingleO: shingle.ormMap,
    tussock: mat_.map, tussockN: mat_.normalMap, tussockO: mat_.ormMap,
    rock: rock.map, rockN: rock.normalMap, rockO: rock.ormMap,
    macro: macro.map,
  };

  /* Injected source must be reflected in the program cache key, or three will
   * hand this material a program compiled for a different one whose stock
   * parameters happen to match. Leaving it off did exactly that: the basin
   * shared a program with the player body roughly one boot in three — two
   * fewer programs in renderer.info — and the frame came out with the sun
   * apparently switched off and hard-edged black across the valley side. It
   * looked like a flaky rasteriser because it was bimodal and load-dependent;
   * it was a compile-order race. */
  mat.customProgramCacheKey = () => 'basin-splat-v7';

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
      uniform sampler2D tGrvA, tGrvN, tGrvO;
      uniform sampler2D tMatA, tMatN, tMatO;
      uniform sampler2D tRokA, tRokN, tRokO;
      uniform sampler2D tMacro;
      uniform vec3 uWetTint, uMossTint;
      uniform float uDebug;
      /* Held for the debug output below. Reading the blended albedo *before*
       * any light touches it is the only way to tell "the textures are wrong"
       * apart from "the lighting is wrong", and those two look identical in a
       * finished frame. */
      vec3 gSurf = vec3(0.0);
      vec3 gGrvO, gMatO, gRokO;
      float gAO, gDamp;
      varying vec4 vSplat;
      varying vec3 vWPos;
      varying vec3 vWNrm;

      /* Tile breakup at a *constant* physical scale.
       *
       * One scale over open ground two hundred metres deep tiles visibly no
       * matter how good the texture is; the eye finds a 1 m period in a
       * gradient far more easily than it finds one in clutter, and this level
       * is nothing but gradients. So the period has to be broken. But this
       * used to break it by mixing the same map at p*0.5 and p*0.137 — a 3.6x
       * scale jump, at 40% weight — and that is only safe for a surface that
       * is noise all the way down. The shingle bake describes *objects* of a
       * known physical size, and compositing a 3.6x copy over them destroys
       * the only absolute scale cue the ground has: every cobble shipped with
       * a 1.2 m ghost of itself, and the gravel track read as flagstone
       * paving rather than as river gravel.
       *
       * Break the lattice by *selecting* between two rotated and offset taps
       * of the same scale, on a low-frequency field, instead of by blending
       * scales. The selector band is deliberately narrow: a 50/50 blend of two
       * rotations averages toward the map's mean, which flattens the surface
       * and is the other way to lose the stones. The soft boundary that
       * remains reads as a deposit edge, which is what a beach actually has.
       */
      vec3 tap2(sampler2D t, vec2 p){
        float sel = sstep(0.45, 0.55, texture2D(tMacro, p * 0.021).y);
        vec3 a = texture2D(t, p).rgb;
        vec3 b = texture2D(t, mat2(0.80, -0.60, 0.60, 0.80) * p + vec2(0.37, 0.71)).rgb;
        return mix(a, b, sel);
      }
    ` + sh.fragmentShader;

    /* Albedo. The three surfaces are chosen by the splat and by slope: gravel
     * where the basin says gravel, rock wherever the ground is too steep to
     * hold anything, tussock mat everywhere else. */
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `
      /* The Poly Haven scan covers two physical metres. Keep that measured
       * scale instead of enlarging a procedural stone cell until the foreshore
       * reads as paving. Meadow and rock can share the same coordinates; only
       * shingle needs the half-frequency tap below. */
      vec2 tuv = vWPos.xz * 0.85;
      vec2 grvUv = vWPos.xz * 0.50;
      /* A bank cannot use a top-down UV: at 60 degrees the scan stretches
       * into a vertical smear, which is the retaining-wall look every shore
       * frame showed. Cheap half-triplanar, same as Tongariro. */
      float wall = sstep(0.22, 0.55, 1.0 - abs(vWNrm.y));
      vec2 tuvW = abs(vWNrm.x) > abs(vWNrm.z)
                ? vec2(vWPos.z, vWPos.y) * 0.85
                : vec2(vWPos.x, vWPos.y) * 0.85;
      vec2 grvUvW = abs(vWNrm.x) > abs(vWNrm.z)
                  ? vec2(vWPos.z, vWPos.y) * 0.50
                  : vec2(vWPos.x, vWPos.y) * 0.50;
      /* Fine shingle and thatch are useful at the player's feet and alias into
       * a screen-door pattern on a hillside hundreds of metres away. Mipmaps
       * cannot remove the pattern completely because this shader combines two
       * independently rotated scales after sampling them. Fade each material
       * toward its measured middle value over distance, and flatten the normal
       * below by the same amount, so the far basin carries landform and macro
       * colour rather than sub-pixel gravel. */
      /* Faded on the pixel's footprint, not on its distance.
       *
       * This was 22..150 m, pulled in from 55..210 m when the uv scale went
       * from a 4 m period to a 1.18 m one — correct reasoning, since the
       * distance at which a texel goes sub-pixel scales with the texture's
       * world period. But distance is only a proxy for footprint, and on this
       * level it is a bad one: the ground is a basin seen at a shallow angle,
       * so a hillside 40 m away across the valley has a far smaller footprint
       * per pixel than the verge 25 m ahead down the road. Fading on distance
       * therefore washed the texture off ground that could still resolve it,
       * and the whole mid-distance basin read as smooth brown paper — which is
       * what made the near field look bare enough to want a grass layer over
       * it. It did not need one; it needed its own texture back.
       *
       * fwidth() of world position is the footprint directly, and the
       * geometric mean of the two derivatives is what an anisotropic filter
       * with a capped sample ratio actually resolves — the same correction,
       * and for the same reason, as the chipseal in road.js. The tussock tap
       * has a 1.18 m period over a 1K map, so a texel is about 1.2 mm and the
       * two-tap blend starts breaking up once a pixel spans a few centimetres
       * of ground. Distance is kept only as a far backstop for the kilometre
       * scales where the derivative itself becomes unreliable. */
      float gpx = sqrt(max(fwidth(vWPos.x), 1e-5) * max(fwidth(vWPos.z), 1e-5));
      float farDetail = max(sstep(0.018, 0.075, gpx),
                            sstep(260.0, 700.0, distance(cameraPosition, vWPos)));
      float grv = clamp(vSplat.x, 0.0, 1.0);
      float wet = clamp(vSplat.y, 0.0, 1.0);
      float hol = clamp(vSplat.z, 0.0, 1.0);
      /* Slope, and the threshold is high. In a till landscape almost nothing
       * is bare rock until it is genuinely steep — the whole basin floor is
       * covered in what the ice left. Bare rock on a 25-degree slope is what
       * makes procedural terrain look like a video game. */
      float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
      float rok = sstep(0.42, 0.72, slope);

      vec3 cGrv = mix(tap2(tGrvA, grvUv), tap2(tGrvA, grvUvW), wall);
      vec3 cMat = mix(tap2(tMatA, tuv), tap2(tMatA, tuvW), wall);
      vec3 cRok = mix(tap2(tRokA, tuv * 0.7), tap2(tRokA, tuvW * 0.7), wall);

      /* ── the biome ─────────────────────────────────────────────────────
       * The tussock bake is authored green-dominant, which is what a
       * fertilised temperate sward looks like and is not what this basin is.
       * Left alone it made every frame read as Irish farmland with a snowfield
       * behind it, which is a stronger and more immediate signal than any
       * amount of correct native flora standing on top of it.
       *
       * The Mackenzie is short-tussock grassland in a rain shadow: Festuca and
       * Poa on thin, stony, glacial soil, dormant and straw-coloured for most
       * of the year, and famous for exactly that tawny-gold ground reading
       * against turquoise water and grey rock. Its albedo is warm and
       * red-dominant — near (0.14, 0.105, 0.05) — which is very nearly the
       * inverse of the scan's channel order.
       *
       * So recolour rather than replace. Luminance carries all of the scan's
       * physical information — blade structure, self-shadowing, soil showing
       * through — and none of its hue, so keeping luminance and substituting
       * the chromaticity preserves every measured centimetre while moving the
       * biome. A flat multiply cannot do this: multiplying a green-dominant
       * albedo toward tawny requires a gain above one on a channel that is
       * nearly zero, which amplifies the scan's blue noise into mottling.
       *
       * The basin is not uniformly dry, and pretending it is replaces one flat
       * wrong colour with another. Damp swales, the deposits along the fans
       * and the ground near the waterline hold green well into summer, so the
       * two states are mixed on the same broad fields that already drive the
       * rest of this shader. */
      {
        float lum = dot(cMat, vec3(0.2126, 0.7152, 0.0722));
        /* Chromaticities, each normalised so that dotting it with the
         * luminance weights gives 1. That normalisation is what makes this a
         * hue substitution instead of a brightness change: whatever is
         * selected below, lum * hue has exactly the luminance the scan
         * measured. */
        /* Green first, gold second — the opposite weighting to before.
         *
         * The basin was authored as a rain-shadow tussock flat, all dormant
         * straw, on the argument that the Mackenzie is dry country. That is
         * true of the high terraces in late summer and it is not what this
         * lake looks like from the road: the shore benches and the fans are
         * grazed pasture and they are green, which is why every photograph of
         * Tekapo has a green foreground under a snow range. The gold is still
         * here — it belongs on the dry crowns and the wind-scalded ridges —
         * but it is now the accent rather than the field. */
        const vec3 TAWNY = vec3(1.462, 0.876, 0.412);   // dry crown, wind-scalded
        const vec3 SWARD = vec3(0.610, 1.235, 0.545);   // grazed pasture green
        vec3 bioA = texture2D(tMacro, vWPos.xz * 0.0055).rgb;
        vec3 bioB = texture2D(tMacro, vWPos.xz * 0.041 + 0.37).rgb;
        /* Dry unless there is a reason to be green. Terraces and crowns dry
         * out; hollows, the wet margin and the fan deposits do not. */
        float dry = sstep(0.30, 0.72, bioA.y * 0.54 + bioB.x * 0.46);
        dry *= 1.0 - sstep(0.30, 0.85, hol);
        dry = clamp(dry * (1.0 - wet * 0.85), 0.0, 1.0);
        /* Never fully one or the other. Real grassland at this scale is a
         * mosaic, and a hard 0/1 field paints continents. */
        vec3 hue = mix(SWARD, TAWNY, mix(0.04, 0.52, dry));
        /* Tussock is also *paler* than pasture as well as warmer — dead leaf
         * reflects more than living leaf — so the luminance is lifted a little
         * where the ground is driest. */
        cMat = lum * hue * mix(1.06, 1.16, dry);
      }
      /* These are the *measured* means of each bake, not chosen colours: a fade
       * to anything else makes the surface change value with camera distance,
       * which is far more visible than the aliasing it is there to prevent. */
      /* The mean of the *recoloured* mat. This constant and the biome block
       * above have to be kept in step: fading to a mean measured before the
       * correction puts a green band across every hill beyond 150 m while the
       * ground at the player's feet is tawny, which reads as fog with the
       * wrong colour in it. */
      cGrv = mix(cGrv, vec3(0.081, 0.080, 0.075), farDetail);
      /* The mean of the recoloured mat, which is now green-dominant. Kept in
       * step with the biome block above, or every hill past the fade distance
       * goes a different colour from the ground at the player's feet. */
      cMat = mix(cMat, vec3(0.106, 0.163, 0.062), farDetail);
      cRok = mix(cRok, vec3(0.380, 0.388, 0.377), farDetail);

      vec3 surf = mix(cMat, cGrv, grv);
      surf = mix(surf, cRok, rok);

      /* Jungle's successful ground is a material-state field, not one colour
       * noise multiplier. Give the basin the same hierarchy: a broad value
       * field, a 20–30 m deposit field and damp organic pockets correlated
       * with concavity. This is what makes the texture belong to the landform
       * instead of looking wrapped around it. */
      vec3 macro = texture2D(tMacro, vWPos.xz * 0.0055).rgb;
      vec3 mid = texture2D(tMacro, vWPos.xz * 0.041 + 0.37).rgb;
      float broadLight = sstep(0.38,0.76,macro.y*.62+macro.z*.38);
      surf *= macro.x * 1.12 * mix(.92,1.10,broadLight);
      float deposit = sstep(0.42, 0.78, mid.y) * (1.0 - grv) * (1.0 - rok);
      gDamp = sstep(0.52, 0.86, mid.z) * (0.32 + hol * 0.68)
            * (1.0 - grv) * (1.0 - rok);
      /* Living spring mat under the sward. The scan already supplies the
       * physical green; these broad state fields tie it to damp hollows and
       * glacial deposits without recolouring it into dead tussock. */
      float living = (1.0 - grv) * (1.0 - rok);
      /* Broad spring turf states. The scan supplies the centimetres; these
       * twenty-to-hundred-metre fields stop every hill becoming one sampled
       * green mean. Damp swales stay cool and deep, exposed crowns are warmer
       * and brighter, and neither state changes the physical blade scale. */
      /* Broad turf states, now expressed within the tussock palette rather
       * than across it. These were a green pair — (.78,.96,.70) to
       * (1.10,1.12,.76) — chosen when the ground was pasture, and left in
       * place they would fight the biome correction above for control of the
       * hue. What they are for is variation *within* a state: cooler and
       * greyer where the sward is denser, warmer and brighter on the exposed
       * crowns the wind has dried. */
      float turfState = sstep(0.30, 0.74, macro.y * .56 + mid.x * .44);
      vec3 turfTint = mix(vec3(.90, .93, .92), vec3(1.10, 1.03, .84), turfState);
      surf *= mix(vec3(1.0), turfTint, living * .34);
      /* Glacial deposit: greyer and cooler than the tussock around it, which
       * is what freshly weathered greywacke silt is, rather than greener. */
      surf = mix(surf, surf * vec3(0.92, 0.94, 0.98), deposit * 0.32);
      surf = mix(surf, uMossTint * (0.46 + macro.z * 0.62), gDamp * 0.40);
      surf = mix(surf, surf * vec3(1.02, 1.00, 0.92), living * 0.12);
      surf = mix(surf, surf * 0.74, hol * 0.34);
      /* Freshly sorted dry strandline stone is lighter than both wet shingle
       * and the darker soil-bearing track. The path tops out at grv≈.64, so a
       * high gravel threshold isolates the beach without duplicating shoreX()
       * inside GLSL. This creates a dry grey berm behind the wet charcoal lip. */
      float strandDry = sstep(.68, .96, grv) * (1.0 - wet);
      surf = mix(surf, surf * 1.62 + vec3(.030,.033,.035), strandDry * .68);
      /* Crushed track gravel occupies a deliberately lower splat interval than
       * wave-sorted beach stone. Give that middle interval its own dry state so
       * the route reads as grey aggregate rather than a black painted ribbon;
       * the narrow upper gate keeps this correction off the strandline. */
      float treadDry = sstep(.48, .58, grv) * (1.0 - sstep(.65, .69, grv)) * (1.0 - wet);
      surf = mix(surf, surf * 1.27 + vec3(.012,.013,.012), treadDry * .56);
      /* Wet shingle. Water on stone does two things and both matter: it drops
       * the albedo hard and it drops the roughness harder. Darkening alone
       * gives a beach that looks stained rather than wet. On dark greywacke
       * the residual *0.58 was too mild once lit, so the wet-margin station
       * still read as dry cobble meeting cyan water. */
      /* Keep the wet lip dark but not black: a missing-looking polygon is not
       * a useful moisture cue, especially beside a saturated turquoise body. */
      surf = mix(surf, surf * 0.54 + uWetTint * 0.10, wet);

      gGrvO = tap2(tGrvO, grvUv);
      gMatO = tap2(tMatO, tuv);
      gRokO = tap2(tRokO, tuv * 0.7);
      gAO = mix(mix(gMatO.r, gGrvO.r, grv), gRokO.r, rok);
      /* AO belongs primarily in indirect light. Multiplying scanned albedo by
       * the raw packed channel a second time made every gravel hollow nearly
       * black and turned a photoscan back into a high-contrast printed pattern.
       * Keep only a restrained contact modulation here; the lighting path below
       * still applies the full cavity signal to reflected light. */
      surf *= mix(0.88, 1.0, pow(clamp(gAO, 0.0, 1.0), 0.75));

      diffuseColor.rgb *= surf;
      gSurf = surf;
      if (uDebug > 0.5 && uDebug < 1.5) { diffuseColor.rgb = vec3(grv, wet, rok); }
      `
    );

    /* uDebug 2 replaces the shaded result outright, after tone mapping has
     * been declined for this pixel, so what lands on screen is the albedo the
     * blend actually produced. */
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `if (uDebug > 1.5) gl_FragColor = vec4(gSurf, 1.0);
       #include <dithering_fragment>`
    );

    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      /* Grass004's scan contains very dark roughness values from moist blade
       * fragments. Used raw across a terrain those fragments become kilometre
       * scale glossy patches and sun-facing hills turn white like plastic.
       * Preserve map variation inside physically plausible outdoor floors;
       * only the authored wet shoreline is allowed to become truly smooth. */
      float rGrv = 0.78 + gGrvO.g * 0.20;
      float rMat = 0.72 + gMatO.g * 0.24;
      float rRok = 0.68 + gRokO.g * 0.28;
      float roughnessFactor = roughness * mix(mix(rMat, rGrv, grv), rRok, rok);
      roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.90, gDamp * 0.65);
      roughnessFactor = mix(roughnessFactor, 0.14, wet);
      `
    );

    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <aomap_fragment>',
      `float surfaceAO = pow(clamp(gAO, 0.0, 1.0), 1.25);
       reflectedLight.indirectSpecular *= surfaceAO;
       reflectedLight.directSpecular *= mix(0.58, 1.0, surfaceAO);
       /* Wet stone picks up a hard sheen. On already-dark greywacke the albedo
        * drop alone is a mute stain; the sheen is what sells "just washed"
        * against the dry cobble behind the camera in the wet-margin station. */
       reflectedLight.directSpecular += diffuseColor.rgb * wet * 0.55;
       reflectedLight.indirectSpecular += vec3(0.18, 0.22, 0.24) * wet * 0.35;`
    );

    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      vec3 nGrv = tap2(tGrvN, grvUv) * 2.0 - 1.0;
      vec3 nMat = tap2(tMatN, tuv) * 2.0 - 1.0;
      vec3 nRok = tap2(tRokN, tuv * 0.7) * 2.0 - 1.0;
      vec3 mapN = normalize(mix(mix(nMat, nGrv, grv), nRok, rok));
      mapN = normalize(mix(mapN, vec3(0.0, 0.0, 1.0), farDetail * 0.92));
      // Wet stone reads smooth: the water fills the microrelief.
      mapN = mix(mapN, vec3(0.0, 0.0, 1.0), wet * 0.5);
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);
      `
    );
  };

  return mat;
}
