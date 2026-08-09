/* The seal, its markings, and the furniture that lines it.
 *
 * The terrain carve in basin.js already levelled a formation and shaped its
 * batters, so the ground under the car is correct without this file existing
 * at all. What this file adds is the thing that makes the formation read as a
 * *road* rather than as a suspiciously flat strip of gravel, and that is
 * almost entirely about two ideas.
 *
 * The first is that a road is a different material from the ground, not a
 * different colour of it. New Zealand rural state highway is chipseal: a film
 * of bitumen with a single graded layer of greywacke chip rolled into it. It
 * is much rougher than European hot-mix asphalt, it is grey rather than black
 * because the chip is showing and the binder has oxidised, and — the part that
 * actually matters in a frame — it is *directionally* rough. Grazing sunlight
 * catches the chip and turns the whole surface pale; light from behind the
 * camera does not. A road painted as flat dark grey loses that completely and
 * is the single clearest tell of a game road.
 *
 * The second is that the markings carry the geometry. At any speed the lines
 * are how a driver reads the corner ahead, so they are drawn from the road's
 * own longitudinal and lateral coordinates rather than from a texture that has
 * been stretched around the curve: a dashed centreline whose dashes stay 3 m
 * long through a bend, and continuous edge lines that stay exactly where the
 * seal ends. Getting this from a wrapped texture is possible and it always
 * shows, because the dash period stretches on the outside of every corner.
 *
 * The ribbon is one merged mesh with a lateral coordinate in uv.x measured in
 * metres from the centreline and a longitudinal one in uv.y measured in metres
 * along, which is what makes both of the above cheap.
 */
import * as THREE from 'three';
import { SSTEP } from '../../gfx/glsl.js';
import { Noise2D, clamp, lerp, smoothstep } from '../../world/noise.js';
import {
  ROAD_HALF, ROAD_SHOULDER, ROAD_CROSSFALL, LAKE_Y,
} from './basin.js';

/* Longitudinal sampling of the ribbon, in metres.
 *
 * Two metres, and the constraint that sets it is not the shape of the road but
 * the shading of it. The seal is flat and its normal barely changes, so a
 * coarse mesh describes the *surface* perfectly well; what a coarse mesh does
 * not describe is the crown catching a highlight through a curve, because that
 * highlight is a function of the tangent direction and a 6 m chord through a
 * 120 m radius sweeper visibly polygonises it. At 2 m the chordal error on the
 * tightest bend in this alignment is under 4 mm.
 */
const SEG = 2.0;

/* The cross-section, as offsets from the centreline in metres.
 *
 * Written out rather than generated because the widths are not a progression:
 * each one is a real edge with a real reason, and two of them have to land
 * exactly on a painted line or the paint will crawl across the seal as the
 * mesh is tessellated. Mirrored below, so this is the right-hand half.
 */
const SECTION = [0, 0.9, 2.0, 3.1, ROAD_HALF - 0.35, ROAD_HALF, ROAD_HALF + 0.55, ROAD_SHOULDER];

/** Height of the seal above the carved formation. See build(). */
const LIFT = 0.045;

export class LakeRoad {
  /**
   * @param {import('./basin.js').Basin} terrain
   * @param {import('../../world/path.js').Trail} trail
   * @param {string} tier
   */
  constructor(terrain, trail, tier = 'high') {
    this.terrain = terrain;
    this.trail = trail;
    this.tier = tier;
    this.root = new THREE.Group();
    this.root.name = 'road';
    this.materials = [];
    this._noise = new Noise2D(0x51ea0a);

    this._buildSeal();
    this._buildFurniture();
  }

  /* ── the seal ──────────────────────────────────────────────────────────── */

  _buildSeal() {
    const trail = this.trail, terrain = this.terrain;
    const N = Math.max(2, Math.round(trail.length / SEG));
    const cols = SECTION.length * 2 - 1;      // mirrored, sharing the centreline

    const pos = new Float32Array((N + 1) * cols * 3);
    const nrm = new Float32Array((N + 1) * cols * 3);
    const uv = new Float32Array((N + 1) * cols * 2);
    const idx = [];

    const P = new THREE.Vector3(), T = new THREE.Vector3();
    /* Lateral offsets, left to right, so uv.x runs monotonically across the
     * ribbon and the marking shader can use it directly as a signed distance
     * from the centreline. */
    const off = [...SECTION.slice(1).reverse().map(v => -v), ...SECTION];

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      trail.pointAt(t, P);
      trail.tangentAt(t, T);
      /* Right-hand normal in the ground plane. The road is flat in section
       * apart from the crown, so a full Frenet frame would only add roll that
       * a road does not have. */
      const nx = T.z, nz = -T.x;
      const s = t * trail.length;

      for (let k = 0; k < cols; k++) {
        const o = off[k];
        const x = P.x + nx * o;
        const z = P.z + nz * o;
        /* The design surface, from the same function the carve used, so the
         * ribbon and the formation cannot disagree. Past the seal the shoulder
         * keeps falling at the steeper rate the carve gave it. */
        const y = terrain.roadY(t, o)
          - Math.max(0, Math.abs(o) - ROAD_HALF) * ROAD_CROSSFALL * 1.9
          + LIFT;

        const b = (i * cols + k) * 3;
        pos[b] = x; pos[b + 1] = y; pos[b + 2] = z;
        /* The crown's normal, analytically. It is a very shallow roof — a 3%
         * fall — but it is the whole reason the two lanes shade differently
         * under a low sun, so it is worth being exact about. */
        const fall = ROAD_CROSSFALL * (Math.abs(o) > ROAD_HALF ? 1.9 : 1) * Math.sign(o || 1);
        const n = new THREE.Vector3(-nx * fall, 1, -nz * fall).normalize();
        nrm[b] = n.x; nrm[b + 1] = n.y; nrm[b + 2] = n.z;

        const u = (i * cols + k) * 2;
        uv[u] = o; uv[u + 1] = s;
      }

      if (i > 0) {
        for (let k = 0; k < cols - 1; k++) {
          const a = (i - 1) * cols + k, b = a + 1, c = i * cols + k, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

    this.sealMat = makeSealMaterial();
    this.materials.push(this.sealMat);
    const mesh = new THREE.Mesh(geo, this.sealMat);
    mesh.name = 'seal';
    /* The seal receives shadows — marker posts and the car sit on it and both
     * would float without one — but does not cast: it is a 45 mm film lying on
     * ground that is already in the shadow map, so casting from it only buys
     * acne along its own edge. */
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.root.add(mesh);
    this.mesh = mesh;
    this.tris = idx.length / 3;
  }

  /* ── the furniture ─────────────────────────────────────────────────────── */

  /* Edge marker posts, and they are doing more work than they look like they
   * are doing.
   *
   * On a real open road these are what tells you where the road goes when the
   * road itself is over a crest or around a spur — the seal disappears and the
   * posts do not. In a frame they do the same job for the player and one more
   * for the picture: they are the only object in this basin at a known,
   * regular, human-made spacing, so they are the thing that gives the
   * kilometre of empty tussock either side of the road a legible scale.
   *
   * NZ practice: white posts on the left in the direction of travel, with a
   * white reflector, and yellow reflectors on the right. Nominal spacing on
   * open road curves is 50 m, closing through bends.
   */
  _buildFurniture() {
    const trail = this.trail, terrain = this.terrain;
    const SPACING = 50;
    const n = Math.max(2, Math.round(trail.length / SPACING));
    const P = new THREE.Vector3(), T = new THREE.Vector3();

    const postGeo = new THREE.BoxGeometry(0.10, 1.05, 0.055);
    postGeo.translate(0, 0.525, 0);
    const capGeo = new THREE.BoxGeometry(0.105, 0.12, 0.06);
    capGeo.translate(0, 0.90, 0);

    const postMat = new THREE.MeshStandardMaterial({
      color: 0xd9d9d2, roughness: 0.78, metalness: 0.0,
    });
    /* The reflector is emissive at a very low level rather than merely white.
     * A retroreflector under a sun that is not behind the camera is *not*
     * bright — it is a slightly luminous patch — and a pure white unlit square
     * reads as a hole punched in the post. */
    const reflWhite = new THREE.MeshStandardMaterial({
      color: 0xf2f2ee, roughness: 0.35, metalness: 0.0,
      emissive: 0xffffff, emissiveIntensity: 0.12,
    });
    const reflYellow = new THREE.MeshStandardMaterial({
      color: 0xe8c34a, roughness: 0.35, metalness: 0.0,
      emissive: 0xffcc44, emissiveIntensity: 0.14,
    });
    this.materials.push(postMat, reflWhite, reflYellow);

    /* Named. Unnamed, these three were an anonymous bucket in the solidity
     * audit — 178 instances of "something" with no collider, which the audit
     * could neither pass nor explain. They are edge marker posts and their
     * reflectors: frangible by design, correctly not solid, and now able to
     * say so. */
    const posts = new THREE.InstancedMesh(postGeo, postMat, n * 2);
    posts.name = 'road:marker-posts';
    const capsW = new THREE.InstancedMesh(capGeo, reflWhite, n);
    capsW.name = 'road:marker-reflector-white';
    const capsY = new THREE.InstancedMesh(capGeo, reflYellow, n);
    capsY.name = 'road:marker-reflector-yellow';
    for (const m of [posts, capsW, capsY]) { m.castShadow = true; m.receiveShadow = false; }

    const M = new THREE.Matrix4(), Q = new THREE.Quaternion();
    const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
    const V = new THREE.Vector3();
    let pi = 0;

    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      trail.pointAt(t, P);
      trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;
      const yaw = Math.atan2(T.x, T.z);
      Q.setFromAxisAngle(UP, yaw);

      /* Just outside the shoulder, where a real post stands: clear of the
       * grader and clear of a wheel that has run wide. */
      const o = ROAD_SHOULDER + 0.45;
      for (const side of [-1, 1]) {
        const x = P.x + nx * o * side, z = P.z + nz * o * side;
        const y = terrain.height(x, z);
        V.set(x, y - 0.04, z);
        M.compose(V, Q, ONE);
        posts.setMatrixAt(pi++, M);
        (side < 0 ? capsW : capsY).setMatrixAt(i, M);
      }
    }
    posts.count = pi;
    posts.instanceMatrix.needsUpdate = true;
    capsW.instanceMatrix.needsUpdate = true;
    capsY.instanceMatrix.needsUpdate = true;
    this.root.add(posts, capsW, capsY);
    this.posts = n * 2;
  }

  setTier(tier) { this.tier = tier; }
  update() {}
  cullAround() {}
  stats() { return { tris: this.tris, posts: this.posts }; }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of this.materials) {
      for (const k of ['map', 'normalMap', 'roughnessMap']) m[k]?.dispose?.();
      m.dispose();
    }
  }
}

/* ── the chipseal shader ───────────────────────────────────────────────────
 *
 * A stock MeshStandardMaterial with its surface fetches replaced, exactly as
 * the basin's ground does it, so three's lighting, shadows, fog and tone
 * mapping keep working and the road is lit by the same sun and the same sky as
 * everything else.
 *
 * Everything below is a function of `vUv`, which this mesh carries in metres:
 * x is signed distance from the centreline, y is distance along the road. That
 * is the entire reason the markings behave.
 */
function makeSealMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0.0,
    /* Seal is a dielectric with a real specular lobe — a wet-looking sheen at
     * a grazing angle is correct for chipseal and is most of what sells it —
     * but it sees far less of the sky than the surrounding tussock because it
     * is a dark surface with a high albedo sky above it. */
    envMapIntensity: 0.42,
  });

  mat.customProgramCacheKey = () => 'lake-chipseal-v2';

  mat.onBeforeCompile = (sh) => {
    mat.userData.shader = sh;
    /* A switch for the crack repairs, so the layer can be measured the way a
     * mesh layer is measured — turned off, the frame diffed, and the result
     * reported as a percentage. Detail that lives in a shader is otherwise
     * invisible to every instrument this project has, which is the same
     * argument as naming a mesh. */
    sh.uniforms.uRepair = { value: 1.0 };

    /* This material assigns no map, so three never defines USE_UV and `vUv`
     * does not exist in the fragment stage. The ribbon's uv is not a texture
     * coordinate anyway — it is a pair of distances in metres — so carry it
     * under its own name rather than switching on a texture nobody samples. */
    sh.vertexShader = `
      varying vec3 vRoadPos;
      varying vec2 vRoad;
    ` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vRoadPos = (modelMatrix * vec4(position, 1.0)).xyz;
       vRoad = uv;`
    );

    sh.fragmentShader = SSTEP + `
      uniform float uRepair;
      varying vec3 vRoadPos;
      varying vec2 vRoad;

      float h21(vec2 p){
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      /* Value noise, and it is used here for one specific thing: the *chip*.
       * Chipseal is a single layer of 6-14 mm stones, so the surface has a
       * genuine characteristic size, and a fractal noise would smear that into
       * a scale-free mush. One octave at one frequency is not a limitation
       * here, it is the physical description. */
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1,0)), f.x),
                   mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y);
      }
      float fbm2(vec2 p){
        return 0.6 * vnoise(p) + 0.3 * vnoise(p * 2.07 + 11.3)
             + 0.1 * vnoise(p * 4.13 + 27.1);
      }
    ` + sh.fragmentShader;

    /* ── albedo ─────────────────────────────────────────────────────────── */
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `
      float lat = vRoad.x;              // metres from the centreline, signed
      float along = vRoad.y;            // metres along the road
      float alat = abs(lat);

      /* How big a pixel is, in metres of road, right here.
       *
       * The first cut faded the chip out on camera *distance*, and that is the
       * wrong variable — it is a proxy for the thing that actually matters and
       * it is a bad one on a road. A road is seen almost edge-on: the ground
       * fifteen metres ahead of a windscreen is at a few degrees of incidence,
       * so one pixel covers centimetres across the road and a third of a metre
       * along it. A distance-based fade keeps full-amplitude 11 mm noise in
       * that pixel and the result is the comb pattern that ran up the middle
       * of every driving frame: not a texture, an aliasing artefact of one.
       *
       * fwidth() answers the question directly, because it is the screen-space
       * derivative of the world position and therefore the footprint of this
       * pixel on the ground, and it collapses correctly for both distance and
       * grazing angle at once. Chip cells are 1/90 m across, so anything past
       * about half that in a single pixel cannot be resolved and must be
       * replaced by its mean rather than sampled. This is mipmapping, done by
       * hand, for a texture that has no mip chain because it is a function. */
      /* The geometric mean of the two derivatives, not the larger of them.
       * On a road seen edge-on the footprint is a long thin sliver — a
       * centimetre across the carriageway and a third of a metre along it —
       * and taking the major axis throws away detail the minor axis can still
       * resolve, which is why the first version of this fade left the near
       * seal completely smooth. The geometric mean is what an anisotropic
       * filter with a capped sample ratio actually resolves, and it keeps the
       * chip at the player's feet while still killing the comb up the road. */
      /* Weighted toward the major axis rather than the plain geometric mean.
       * From a bonnet camera the road is seen at a few degrees of incidence, so
       * the footprint is an extreme sliver — centimetres across the seal and a
       * third of a metre along it. An even geometric mean lets the minor axis
       * keep detail the major axis cannot resolve, and what arrives is the comb
       * again: streaks running up the road. Real anisotropic filtering caps its
       * sample ratio for the same reason, and this is that cap. */
      float pxA = max(fwidth(vRoadPos.x), 1e-5), pxB = max(fwidth(vRoadPos.z), 1e-5);
      float pxMin = min(pxA, pxB), pxMax = max(pxA, pxB);
      float px = pow(pxMin, 0.35) * pow(pxMax, 0.65);
      float chipFade = sstep(0.0035, 0.016, px);
      float fade = max(sstep(30.0, 190.0, distance(cameraPosition, vRoadPos)), chipFade);

      /* Chip. 90 cells per metre puts a cell at about 11 mm, which is a
       * grade 3 chip — the common NZ rural size. */
      /* Faded to its own mean rather than left to alias. fbm2 of value noise
       * averages to 0.5, so that is what a pixel too small to resolve a chip
       * must see. */
      float chip = mix(fbm2(vRoadPos.xz * 90.0), 0.5, chipFade);
      /* Aggregate colour spread. Greywacke chip is not one grey: it runs from
       * near-black wet-looking pieces to pale weathered ones, and that spread
       * is most of what stops a seal reading as flat paint. */
      float agg = mix(h21(floor(vRoadPos.xz * 90.0)), 0.5, chipFade);

      /* Measured chipseal albedo, and it is much paler than intuition says.
       * "Asphalt is black" is a memory of wet hot-mix at night; a weathered
       * greywacke chipseal in mountain sun is a mid grey around 0.16-0.20
       * linear, because what the eye sees is the stone, not the binder. The
       * first cut of this shader used 0.055-0.132 — physically defensible for
       * fresh bitumen and, under this level's 0.50 exposure, a black hole in
       * the middle of the frame with no readable surface in it at all. */
      vec3 seal = mix(vec3(0.126, 0.128, 0.133), vec3(0.232, 0.228, 0.219), agg);
      seal *= 0.88 + 0.24 * chip;

      /* Wheel paths. Two 0.9 m bands centred 1.85 m either side of the crown,
       * which is a 1.85 m track — the average of everything that drives this
       * road. They are *polished*: the binder is worn off the chip and the
       * stone faces are ground flat, so they go slightly paler and much
       * smoother, and they are the strongest single cue that a road is used.
       * The centre strip between them stays rough and picks up the fine
       * gravel that the tyres sweep out of the wheel paths. */
      float wheelL = 1.0 - sstep(0.30, 0.62, abs(lat + 1.85));
      float wheelR = 1.0 - sstep(0.30, 0.62, abs(lat - 1.85));
      float wheel = max(wheelL, wheelR);
      seal = mix(seal, seal * 1.22 + 0.012, wheel * 0.75);

      /* The seal's own long-wavelength history: patches, a seal joint down the
       * middle where the two halves were laid in different years, and general
       * blotching from bleeding binder. Real roads are never one tone for
       * 1.3 km and a road that is reads as extruded geometry. */
      float blotch = fbm2(vRoadPos.xz * 0.075);
      seal *= 0.90 + 0.22 * blotch;
      float joint = 1.0 - sstep(0.05, 0.35, alat);
      seal *= 1.0 - joint * 0.10;

      /* ── crack sealing and patches ──────────────────────────────────────
       * The blotch above is called patches in its comment but it is a smooth
       * multiplier — it makes the road non-uniform, which is not the same as
       * giving it a HISTORY. What a rural seal actually carries is repairs,
       * and they are the difference between a road that was extruded and one
       * that has been maintained for thirty years.
       *
       * TAR SNAKES. Cracks are sealed by pouring hot bitumen along them, and
       * the result is a black band 30-50 mm wide that wanders. It is drawn
       * here as a CONTOUR of a noise field rather than as drawn lines,
       * because a contour is what a crack is: the level set where the seal
       * failed. It wanders, it branches where the field is flat, and it never
       * repeats — none of which is true of any line primitive.
       *
       * They are the darkest thing on the road by a long way. Fresh bitumen
       * has no chip in it at all, so where the seal is 0.13-0.23 these run
       * near 0.045, and that contrast is the whole point: it is the only
       * hard-edged dark detail in the middle of the frame. */
      float crackField = fbm2(vRoadPos.xz * vec2(0.55, 0.21) + 4.7);
      float crackDist = abs(crackField - 0.5);
      /* Width in field units, widened as the pixel footprint grows so a
       * 40 mm line converges to its own coverage instead of aliasing into a
       * dashed mess at distance — the same argument, and the same fix, as the
       * chip fade above. */
      float crackW = 0.016 + chipFade * 0.055;
      float snake = 1.0 - sstep(crackW * 0.55, crackW, crackDist);
      /* Not every crack has been sealed, and a road where they all have looks
       * machine-made. A second, much slower field gates whole stretches. */
      snake *= sstep(0.42, 0.58, fbm2(vRoadPos.xz * 0.035 + 19.0));
      /* Bitumen is poured proud of the surface and stays glossy for years, so
       * it is both darker and smoother than what it sits on. */
      seal = mix(seal, vec3(0.045, 0.044, 0.048), snake * 0.88 * uRepair);

      /* PATCHES. A dig-out is cut with a saw in a rectangle, filled with hot
       * mix, and it never matches: different aggregate, no chip, laid at a
       * different time. Cells in ROAD space rather than world space, because
       * the crew cuts along the road, not along north. */
      vec2 pcell = vec2(lat * 0.32, along * 0.055);
      vec2 pid = floor(pcell);
      vec2 pf = fract(pcell);
      float pr = h21(pid + 3.1);
      /* About one cell in nine, and inset so the patch does not fill its cell
       * and tile visibly. */
      float isPatch = step(0.885, pr);
      float inset = 0.10 + 0.22 * h21(pid + 7.7);
      float pmask = isPatch
        * sstep(inset, inset + 0.02, pf.x) * (1.0 - sstep(1.0 - inset - 0.02, 1.0 - inset, pf.x))
        * sstep(inset, inset + 0.02, pf.y) * (1.0 - sstep(1.0 - inset - 0.02, 1.0 - inset, pf.y));
      /* Hot mix is finer and darker than chipseal and it weathers paler with
       * age, so each patch gets its own tone from its own cell hash. */
      vec3 patchCol = mix(vec3(0.088, 0.086, 0.090), vec3(0.170, 0.166, 0.162),
                          h21(pid + 12.9));
      seal = mix(seal, patchCol * (0.94 + 0.12 * chip), pmask * 0.92 * uRepair);

      /* Ravelling at the edge. The outer 0.5 m of a chipseal loses its chip
       * to the shoulder and gains gravel and dust off it, so the boundary
       * between seal and shoulder is a gradient, never a cut line. */
      float edgeWear = sstep(${(ROAD_HALF - 0.7).toFixed(2)}, ${ROAD_HALF.toFixed(2)}, alat);
      seal = mix(seal, vec3(0.206, 0.196, 0.172), edgeWear * (0.45 + 0.35 * chip));

      /* ── the shoulder ───────────────────────────────────────────────────
       * Beyond the seal this same ribbon becomes compacted gravel. It is drawn
       * here rather than left to the terrain because the terrain's shingle is
       * wave-graded lake cobble and a road shoulder is crushed and rolled,
       * which is a visibly different material — finer, paler, and dusty. */
      vec3 gravel = mix(vec3(0.212, 0.202, 0.180), vec3(0.318, 0.305, 0.276),
                        mix(fbm2(vRoadPos.xz * 26.0), 0.5,
                            sstep(0.012, 0.055, px)));
      gravel *= 0.88 + 0.24 * fbm2(vRoadPos.xz * 1.7);
      float onShoulder = sstep(${ROAD_HALF.toFixed(2)}, ${(ROAD_HALF + 0.6).toFixed(2)}, alat);
      vec3 surf = mix(seal, gravel, onShoulder);

      /* ── the markings ───────────────────────────────────────────────────
       * Drawn last, in the road's own metres, which is what keeps a 3 m dash
       * 3 m long through a corner.
       *
       * NZ open-road centreline is a 3 m mark in a 12 m cycle, white, 100 mm
       * wide. Edge lines are continuous white, also 100 mm, set so their outer
       * face is at the edge of the seal.
       *
       * Paint is not white. Thermoplastic on a road weathers to a light warm
       * grey within a season, it is worn away entirely in the wheel paths
       * where it crosses them, and it is thick enough to have its own
       * roughness — it is smoother than the chip around it, which is why a
       * marking catches the sun a moment before the seal does. */
      float dash = step(fract(along / 12.0), 0.25);
      float centre = (1.0 - sstep(0.035, 0.055, alat)) * dash;
      float edge = 1.0 - sstep(0.045, 0.062,
                               abs(alat - ${(ROAD_HALF - 0.11).toFixed(2)}));
      /* Wear. The paint is oldest and thinnest where traffic crosses it, and
       * a low-frequency field breaks up the rest so no line is uniform. */
      float paintWear = 0.62 + 0.38 * sstep(0.30, 0.75, fbm2(vRoadPos.xz * 0.9));
      float paint = clamp(centre + edge, 0.0, 1.0) * paintWear * (1.0 - edgeWear * 0.35);

      vec3 paintCol = vec3(0.640, 0.628, 0.580);
      surf = mix(surf, paintCol, paint);

      /* Distance fade to each material's own mean, for the same reason the
       * basin's ground does it: an 11 mm chip is sub-pixel by 40 m and turns
       * into a crawling screen-door pattern up the road otherwise. The
       * markings deliberately do *not* fade — they are the geometry cue and
       * they are what a driver looks at furthest ahead. */
      vec3 meanSeal = mix(vec3(0.168, 0.166, 0.164), vec3(0.262, 0.251, 0.226), onShoulder);
      surf = mix(surf, mix(meanSeal, paintCol, paint), fade * 0.85);

      diffuseColor.rgb *= surf;
      `
    );

    /* ── roughness ──────────────────────────────────────────────────────────
     * Chipseal's roughness is not constant and the variation is the material.
     * Polished wheel paths are markedly smoother than the coarse strip between
     * them, paint is smoother than either, and the gravel shoulder is fully
     * rough. Without this the road is one uniform sheen and looks like plastic
     * under any sun that is not straight overhead. */
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      float roughnessFactor = roughness;
      {
        float alat2 = abs(vRoad.x);
        /* Same footprint fade as the albedo. An unfaded roughness at a grazing
         * angle is worse than an unfaded albedo, because roughness drives a
         * specular lobe and the sun is low: the comb pattern arrives as a
         * glitter rather than as a tint. */
        float a2 = max(fwidth(vRoadPos.x), 1e-5), b2 = max(fwidth(vRoadPos.z), 1e-5);
        float px2 = pow(min(a2,b2), 0.35) * pow(max(a2,b2), 0.65);
        float chip2 = mix(fbm2(vRoadPos.xz * 90.0), 0.5, sstep(0.0035, 0.016, px2));
        float wheel2 = max(1.0 - sstep(0.30, 0.62, abs(vRoad.x + 1.85)),
                           1.0 - sstep(0.30, 0.62, abs(vRoad.x - 1.85)));
        float dash2 = step(fract(vRoad.y / 12.0), 0.25);
        float paint2 = clamp((1.0 - sstep(0.035, 0.055, alat2)) * dash2
                     + 1.0 - sstep(0.045, 0.062, abs(alat2 - ${(ROAD_HALF - 0.11).toFixed(2)})),
                       0.0, 1.0);
        float shoulder2 = sstep(${ROAD_HALF.toFixed(2)}, ${(ROAD_HALF + 0.6).toFixed(2)}, alat2);
        roughnessFactor = 0.94 - 0.10 * chip2;
        roughnessFactor -= wheel2 * 0.20;
        roughnessFactor = mix(roughnessFactor, 0.62, paint2);
        roughnessFactor = mix(roughnessFactor, 0.98, shoulder2);

        /* CRACK SEALING AND PATCHES ARE A ROUGHNESS FEATURE FIRST.
         *
         * They went into the albedo block alone to begin with, at 0.045
         * against a seal of 0.13-0.23 — a four-fold contrast that should have
         * been the darkest thing on the road. It was invisible, and the
         * instrument said why: masking the road by hiding every other mesh
         * and then forcing the ENTIRE seal albedo to black moved the median
         * road pixel from 114 to 109. Five levels out of 114 for a total loss
         * of albedo.
         *
         * That is not a bug, it is this material working as designed. The
         * comment on the material says the grazing sheen is most of what
         * sells a chipseal, and it is right — but the consequence is that at
         * driving angles the road's brightness is carried by its specular
         * lobe and almost none of it by its colour. Painting detail into the
         * albedo of a surface seen at three degrees is painting under the
         * varnish.
         *
         * Bitumen's real signature is not that it is darker. It is that it is
         * SMOOTHER: poured as a liquid, it sets to a skin with no chip in it,
         * and on a road it shows up as a glossy line that flares when the sun
         * is behind it and goes dark when it is not. That is a roughness
         * difference, and roughness is the channel this road actually reads
         * in. 0.94 down to 0.30 is a bigger change than any albedo could be. */
        float crackField2 = fbm2(vRoadPos.xz * vec2(0.55, 0.21) + 4.7);
        float crackW2 = 0.016 + sstep(0.0035, 0.016, px2) * 0.055;
        float snake2 = 1.0 - sstep(crackW2 * 0.55, crackW2, abs(crackField2 - 0.5));
        snake2 *= sstep(0.42, 0.58, fbm2(vRoadPos.xz * 0.035 + 19.0));
        vec2 pcell2 = vec2(vRoad.x * 0.32, vRoad.y * 0.055);
        vec2 pid2 = floor(pcell2), pf2 = fract(pcell2);
        float inset2 = 0.10 + 0.22 * h21(pid2 + 7.7);
        float pmask2 = step(0.885, h21(pid2 + 3.1))
          * sstep(inset2, inset2 + 0.02, pf2.x) * (1.0 - sstep(1.0 - inset2 - 0.02, 1.0 - inset2, pf2.x))
          * sstep(inset2, inset2 + 0.02, pf2.y) * (1.0 - sstep(1.0 - inset2 - 0.02, 1.0 - inset2, pf2.y));
        roughnessFactor = mix(roughnessFactor, 0.30, snake2 * 0.90 * uRepair);
        /* Hot mix is finer than chipseal but still a road, not a mirror. */
        roughnessFactor = mix(roughnessFactor, 0.72, pmask2 * 0.85 * uRepair);
      }
      `
    );

    /* ── normal ─────────────────────────────────────────────────────────────
     * The chip has real relief and the frame needs it, because the thing that
     * makes chipseal recognisable is that a grazing sun turns it pale and
     * grainy while the same surface is smooth and dark from the other
     * direction — and that is a normal-map effect, not an albedo one.
     * Derivatives of the same noise the albedo used, faded out with distance
     * on the same schedule so the far road does not sparkle. */
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      {
        /* Amplitude, and the first cut of this had it at 24x a finite
         * difference taken half a chip apart, which is not a rough surface, it
         * is a normal map with a gain of about twelve. The road came out as
         * black corduroy — every chip a full-contrast facet, the whole seal
         * reading as rubble rather than as a rolled surface.
         *
         * The honest number comes from the physical relief. A grade 3 chip
         * stands about 4 mm proud over an 11 mm period, so the surface slope
         * is of order 0.35 at its steepest and much less on average. The
         * difference below is taken over e metres and the noise is sampled
         * at 90 cells/m, so dividing by (e * 90) converts it to a slope in the
         * noise's own units; the remaining constant is the 4 mm relief.
         *
         * It also has to die with distance faster than the albedo does. A
         * normal that survives to where its features are sub-pixel does not
         * average out, it sparkles, and a sparkling road is worse than a flat
         * one. */
        /* The normal has to die on the footprint too, and sooner than either
         * of the others: an unresolved normal does not average to its mean, it
         * averages to a random direction per pixel, which is exactly what
         * sparkle is. */
        float a3 = max(fwidth(vRoadPos.x), 1e-5), b3 = max(fwidth(vRoadPos.z), 1e-5);
        float px3 = pow(min(a3,b3), 0.35) * pow(max(a3,b3), 0.65);
        float amp = 1.0 - sstep(0.0025, 0.010, px3);
        float shoulder3 = sstep(4.10, 4.70, abs(vRoad.x));
        amp *= mix(0.34, 0.62, shoulder3);
        float wheel3 = max(1.0 - sstep(0.30, 0.62, abs(vRoad.x + 1.85)),
                           1.0 - sstep(0.30, 0.62, abs(vRoad.x - 1.85)));
        /* Polished wheel paths are flatter as well as smoother. */
        amp *= 1.0 - wheel3 * 0.55 * (1.0 - shoulder3);
        if (amp > 0.002) {
          float e = 0.004;
          float f0 = fbm2(vRoadPos.xz * 90.0);
          float fx = fbm2((vRoadPos.xz + vec2(e, 0.0)) * 90.0);
          float fz = fbm2((vRoadPos.xz + vec2(0.0, e)) * 90.0);
          vec2 grad = vec2(fx - f0, fz - f0) / (e * 90.0);
          normal = normalize(normal + amp * vec3(-grad.x, 0.0, -grad.y) * 0.36);
        }
      }
      `
    );
  };

  return mat;
}
