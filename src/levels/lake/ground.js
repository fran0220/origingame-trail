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

export function makeBasinMaterial(renderer) {
  const shingle = bakeSurface(renderer, SHINGLE, { size: 1024, normalStrength: 3.4 });
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
    envMapIntensity: 1.0,
  });

  const U = {
    tGrvA: { value: shingle.map }, tGrvN: { value: shingle.normalMap }, tGrvO: { value: shingle.ormMap },
    tMatA: { value: mat_.map }, tMatN: { value: mat_.normalMap }, tMatO: { value: mat_.ormMap },
    tRokA: { value: rock.map }, tRokN: { value: rock.normalMap }, tRokO: { value: rock.ormMap },
    tMacro: { value: macro.map },
    uWetTint: { value: new THREE.Color(0x2b3238) },
    uDebug: { value: 0 },
    uTime: { value: 0 },
  };
  mat.userData.uniforms = U;

  /* Injected source must be reflected in the program cache key, or three will
   * hand this material a program compiled for a different one whose stock
   * parameters happen to match. Leaving it off did exactly that: the basin
   * shared a program with the player body roughly one boot in three — two
   * fewer programs in renderer.info — and the frame came out with the sun
   * apparently switched off and hard-edged black across the valley side. It
   * looked like a flaky rasteriser because it was bimodal and load-dependent;
   * it was a compile-order race. */
  mat.customProgramCacheKey = () => 'basin-splat-v1';

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
      uniform vec3 uWetTint;
      uniform float uDebug;
      /* Held for the debug output below. Reading the blended albedo *before*
       * any light touches it is the only way to tell "the textures are wrong"
       * apart from "the lighting is wrong", and those two look identical in a
       * finished frame. */
      vec3 gSurf = vec3(0.0);
      varying vec4 vSplat;
      varying vec3 vWPos;
      varying vec3 vWNrm;

      /* Two tap scales per surface, the coarse one rotated.
       *
       * One scale over open ground two hundred metres deep tiles visibly no
       * matter how good the texture is; the eye finds a 1 m period in a
       * gradient far more easily than it finds one in clutter, and this level
       * is nothing but gradients. Compositing the same map at two scales, with
       * the second turned so its lattice does not line up with the first,
       * costs one extra fetch and removes the period entirely. */
      vec3 tap2(sampler2D t, vec2 p){
        vec3 a = texture2D(t, p * 0.5).rgb;
        vec3 b = texture2D(t, mat2(0.80, -0.60, 0.60, 0.80) * p * 0.137).rgb;
        return mix(a, b, 0.4);
      }
    ` + sh.fragmentShader;

    /* Albedo. The three surfaces are chosen by the splat and by slope: gravel
     * where the basin says gravel, rock wherever the ground is too steep to
     * hold anything, tussock mat everywhere else. */
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 tuv = vWPos.xz * 0.5;
      float grv = clamp(vSplat.x, 0.0, 1.0);
      float wet = clamp(vSplat.y, 0.0, 1.0);
      float hol = clamp(vSplat.z, 0.0, 1.0);
      /* Slope, and the threshold is high. In a till landscape almost nothing
       * is bare rock until it is genuinely steep — the whole basin floor is
       * covered in what the ice left. Bare rock on a 25-degree slope is what
       * makes procedural terrain look like a video game. */
      float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
      float rok = sstep(0.42, 0.72, slope);

      vec3 cGrv = tap2(tGrvA, tuv);
      vec3 cMat = tap2(tMatA, tuv);
      vec3 cRok = tap2(tRokA, tuv * 0.7);

      vec3 surf = mix(cMat, cGrv, grv);
      surf = mix(surf, cRok, rok);

      // Macro break-up, and a darkening in the hollows where fines collect.
      surf *= texture2D(tMacro, vWPos.xz * 0.006).rgb * 1.15;
      surf = mix(surf, surf * 0.86, hol * 0.4);
      /* Wet shingle. Water on stone does two things and both matter: it drops
       * the albedo hard and it drops the roughness harder. Darkening alone
       * gives a beach that looks stained rather than wet. */
      surf = mix(surf, surf * 0.42 + uWetTint * 0.10, wet * 0.85);

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
      float rGrv = tap2(tGrvO, tuv).g;
      float rMat = tap2(tMatO, tuv).g;
      float rRok = tap2(tRokO, tuv * 0.7).g;
      float roughnessFactor = roughness * mix(mix(rMat, rGrv, grv), rRok, rok);
      roughnessFactor = mix(roughnessFactor, 0.18, wet * 0.8);
      `
    );

    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      vec3 nGrv = tap2(tGrvN, tuv) * 2.0 - 1.0;
      vec3 nMat = tap2(tMatN, tuv) * 2.0 - 1.0;
      vec3 nRok = tap2(tRokN, tuv * 0.7) * 2.0 - 1.0;
      vec3 mapN = normalize(mix(mix(nMat, nGrv, grv), nRok, rok));
      // Wet stone reads smooth: the water fills the microrelief.
      mapN = mix(mapN, vec3(0.0, 0.0, 1.0), wet * 0.5);
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);
      `
    );
  };

  return mat;
}
