/* Geometric specular antialiasing.
 *
 * A field of grass is millions of blades a few millimetres wide. At any
 * distance each blade covers well under a pixel, so the surface normal inside
 * one pixel is not a normal at all — it is a wide distribution of them. The
 * shader picks one sample from that distribution and evaluates a specular lobe
 * with it, and when that sample happens to line up with the sun the pixel goes
 * to white on its own while its neighbours stay dark.
 *
 * That is the field of hard white sparkles across the hillsides. It is not a
 * material being too glossy — the flora here is already at 0.90-0.99 roughness
 * and zero metalness, and turning roughness up further only makes the grass
 * look like felt while leaving the sparkles, because the problem is the NORMAL
 * variance, not the lobe width.
 *
 * The fix is standard and cheap: widen the roughness by how fast the normal is
 * changing across the pixel. dFdx/dFdy of the shading normal measure exactly
 * the sub-pixel spread the shader cannot otherwise see, and folding that
 * variance into the roughness turns "one lucky sample" back into "the average
 * of the distribution", which is what the pixel should have contained all
 * along. Distant grass gets rougher automatically; close-up grass, where a
 * blade really does cover many pixels, is untouched.
 *
 * It is applied after the normal is known and before lighting, which is why it
 * hooks lights_physical_fragment rather than the roughness map chunk — that
 * one runs before normals exist.
 */

const PATCH = `
  {
    /* Squared magnitude of the normal's screen-space derivative: the
     * sub-pixel normal variance, in the only units available here. */
    vec3 sgDx = dFdx(normal);
    vec3 sgDy = dFdy(normal);
    float sgVar = max(dot(sgDx, sgDx), dot(sgDy, sgDy));
    /* Clamped, because a silhouette pixel has an enormous derivative and
     * would otherwise be forced to fully rough, which reads as a dark fringe
     * around every leaf. */
    float sgKernel = min(sgVar * 0.85, 0.28);
    roughnessFactor = min(1.0, sqrt(roughnessFactor * roughnessFactor + sgKernel));
  }
`;

/**
 * Add specular antialiasing to a material, preserving any patch already on it.
 *
 * Composes rather than replaces: several of these materials already carry a
 * wind shader and a normal-bias patch, and clobbering onBeforeCompile would
 * silently drop them — the grass would stop moving and nobody would connect it
 * to a change about highlights.
 */
export function addSpecularAA(material, keySuffix = 'spec-aa') {
  if (!material || material.userData.__specAA) return material;
  material.userData.__specAA = true;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function patched(shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    if (shader.fragmentShader.includes('#include <lights_physical_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        `${PATCH}\n#include <lights_physical_fragment>`);
    }
  };

  /* The cache key has to change too. Two materials that compile to different
   * programs but report the same key get the same program, and the second one
   * silently loses its patch. */
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = function key() {
    return `${prevKey ? prevKey.call(this) : ''}|${keySuffix}`;
  };
  material.needsUpdate = true;
  return material;
}
