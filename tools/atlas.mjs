/* Dump a baked texture to a PNG.
 *
 * Every map in this project is generated on the GPU at boot and never touches
 * the disk, which is the point — but it also means there is no file to open
 * when a material looks wrong, and the only view of it is whatever the scene
 * happens to show. That is a bad way to judge a texture: detail that is
 * obvious in the map can be invisible on a leaf twelve metres away, and the
 * two failures — "the detail is not there" and "the detail is there and too
 * small to matter" — call for opposite fixes.
 *
 *   node tools/atlas.mjs leafMap [--size 1024] [--alpha] [--rgb]
 *   node tools/atlas.mjs terrain.litter.map
 *   node tools/atlas.mjs shingle --level lake
 *
 * `--rgb` ignores the alpha channel entirely and shows what colour is actually
 * stored in the transparent region. That is not idle curiosity: bilinear taps
 * and every mip level mix those texels into the visible ones, so a cutout whose
 * "invisible" side is black wears a dark rim at every distance — and the
 * default composite hides exactly that, because it multiplies the same alpha
 * back in before you look at it.
 *
 * The pixels are read back out of a render target rather than screenshotted.
 * The first version drew the texture to the default framebuffer and let
 * Playwright grab the canvas, which raced the render loop and reliably
 * returned a picture of the game instead — the one thing this tool exists to
 * avoid looking at.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './harness.mjs';
import { finish } from './tame.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const which = args[0] && !args[0].startsWith('--') ? args[0] : 'leafMap';
const flag = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const SIZE = +flag('size', 1024);
const SHOW_ALPHA = args.includes('--alpha');
const SHOW_RGB = args.includes('--rgb');

const LEVEL = flag('level', '');

await run({ width: 640, height: 400,
            hash: 'manual&tier=high' + (LEVEL ? '&level=' + LEVEL : '') }, async ({ page }) => {
  const res = await page.evaluate(([which, showAlpha, size, showRgb]) => {
    const g = window.__game, THREE = window.THREE;
    const dig = (root) => which.split('.').reduce((o, k) => o && o[k], root);
    const src = dig(g.veg) || dig(g.terrainMat?.userData?.maps) || dig(g);
    if (!src || !src.isTexture) return { err: 'no such texture: ' + which };

    const rt = new THREE.WebGLRenderTarget(size, size, {
      colorSpace: THREE.SRGBColorSpace,
      type: THREE.UnsignedByteType,
    });
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: {
        t: { value: src },
        a: { value: showAlpha ? 1 : 0 },
        raw: { value: showRgb ? 1 : 0 },
      },
      vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D t; uniform float a; uniform float raw; varying vec2 v;
        void main(){
          vec4 c = texture2D(t, v);
          // Checkerboard behind the cutout, so an alpha edge is legible
          // against it rather than dissolving into a black background.
          float ch = mod(floor(v.x * 32.0) + floor(v.y * 32.0), 2.0) * 0.22 + 0.10;
          vec3 rgb = a > 0.5 ? vec3(c.a)
                   : raw > 0.5 ? c.rgb
                   : mix(vec3(ch), c.rgb, c.a);
          gl_FragColor = vec4(rgb, 1.0);
        }`,
      depthTest: false,
    })));

    const prev = g.renderer.getRenderTarget();
    g.renderer.setRenderTarget(rt);
    g.renderer.render(scene, cam);
    const buf = new Uint8Array(size * size * 4);
    g.renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    g.renderer.setRenderTarget(prev);
    rt.dispose();

    // Render targets are bottom-up; flip into image order on the way out.
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const s = (size - 1 - y) * size * 4, d = y * size * 4;
      img.data.set(buf.subarray(s, s + size * 4), d);
    }
    ctx.putImageData(img, 0, 0);

    /* Mean and spread of the map, in linear light.
     *
     * Two numbers this project has repeatedly needed and repeatedly guessed at.
     * The mean is what a distance fade has to converge to: the basin fades the
     * shingle to a flat colour past the point where the texture aliases, and if
     * that constant is not the map's own mean the ground changes value as the
     * camera moves. The spread is the flat-bake alarm — the first version of
     * this file baked a literally uniform grey because every feature was gated
     * above the range its noise could reach, and a printed sigma of 0.00 would
     * have caught it before a gallery render did.
     *
     * Linear, not sRGB: the fade constant is consumed by the shader, which
     * works in linear light, and averaging sRGB values is meaningless anyway. */
    const s2l = (u) => { const c = u / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const lut = new Float64Array(256);
    for (let i = 0; i < 256; i++) lut[i] = s2l(i);
    const sum = [0, 0, 0], sq = [0, 0, 0], n = size * size;
    for (let i = 0; i < buf.length; i += 4)
      for (let c = 0; c < 3; c++) {
        const v = lut[buf[i + c]];
        sum[c] += v; sq[c] += v * v;
      }
    const mean = sum.map((s) => s / n);
    const sigma = sq.map((s, c) => Math.sqrt(Math.max(0, s / n - mean[c] * mean[c])));
    return { url: cv.toDataURL('image/png'), mean, sigma };
  }, [which, SHOW_ALPHA, SIZE, SHOW_RGB]);

  if (res.err) { console.error(res.err); process.exitCode = 1; return; }
  const out = path.join(ROOT, 'shots',
    `atlas-${which}${SHOW_ALPHA ? '-a' : SHOW_RGB ? '-rgb' : ''}.png`);
  fs.writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
  console.log('  → ' + path.relative(ROOT, out));
  if (res.mean) {
    const f = (a) => '[' + a.map((v) => v.toFixed(4)).join(', ') + ']';
    console.log('  linear mean  ' + f(res.mean));
    console.log('  linear sigma ' + f(res.sigma)
      + (Math.max(...res.sigma) < 0.01 ? '   <-- FLAT: the map carries no detail' : ''));
  }
});

finish(process.exitCode || 0);
