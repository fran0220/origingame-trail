/* Photoscanned middle-storey communities for the Lake level.
 *
 * The ground material closes the sub-pixel floor and flora.js owns named
 * native specimens. This layer fills the scale between them: fern gullies,
 * broadleaf scrub, tall pasture clumps, mossy shore stone and glacial
 * erratics. Those are the masses that remain readable across a whole frame.
 *
 * Assets are local Poly Haven CC0 scans. Placement is expressed in shoreline
 * coordinates and broad habitat probabilities, then split into longitudinal
 * chunks for culling. A scan is never sprayed uniformly over the basin.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/loaders/GLTFLoader.js';
import { BOUNDS, shoreX } from './basin.js';

const url = (path) => new URL(`../../../media/lake-assets/habitat/${path}`, import.meta.url).href;

const ASSETS = [
  {
    id: 'fern-gully', file: 'fern_02/fern_02_1k.gltf',
    alpha: 'fern_02/textures/fern_02_alpha_1k.png', habitat: 'swale',
    step: 8.5, d0: 16, d1: 104, keep: .82, cluster: [10, 18], clusterRadius: 6.8,
    scale: [1.35, 2.35], wind: .022, lift: 1.24, sink: .075,
  },
  {
    id: 'meadow-herb', file: 'shrub_03/shrub_03_1k.gltf',
    alpha: 'shrub_03/textures/shrub_03_alpha_1k.png', habitat: 'meadow',
    step: 4.2, d0: 14, d1: 136, keep: .62, cluster: [2, 4], clusterRadius: 2.8,
    scale: [2.05, 3.55], wind: .032, lift: 1.18, sink: .065,
  },
  {
    id: 'broadleaf-scrub', file: 'shrub_04/shrub_04_1k.gltf',
    alpha: 'shrub_04/textures/shrub_04_alpha_1k.png', habitat: 'scrub',
    step: 15, d0: 28, d1: 148, keep: .76, cluster: [8, 14], clusterRadius: 2.35,
    scale: [2.90, 4.80], wind: .018, lift: 1.24, sink: .13,
  },
  {
    /* This family contains complete 0.8–1.7 m bushes rather than the isolated
     * leafy stems above, but each source child is strongly one-sided. A small
     * rotated group closes that crown; ten to eighteen copies made R18's hero
     * frame a pile of overlapping two-metre branches and spent geometry without
     * improving the silhouette. */
    id: 'dense-green-scrub', file: 'shrub_02/shrub_02_1k.gltf',
    alpha: 'shrub_02/textures/shrub_02_alpha_1k.png', habitat: 'scrub',
    step: 18, d0: 32, d1: 150, keep: .88, cluster: [3, 6], clusterRadius: 1.7,
    scale: [.64, 1.12], wind: .012, lift: 1.20, sink: .095,
  },
  {
    id: 'damp-moss-clump', file: 'moss_01/moss_01_1k.gltf',
    alpha: 'moss_01/textures/moss_01_alpha_1k.png', habitat: 'damp-floor',
    step: 9.0, d0: 7, d1: 74, keep: .78, cluster: [8, 16], clusterRadius: 3.8,
    scale: [5.2, 11.5], wind: .012, lift: 1.16, sink: .035,
  },
  {
    /* A four-metre branched scan survives a landscape frame as wood. The
     * earlier straight 29 cm-wide trunk became pale ruler-like strokes after
     * scaling down and random yaw. Strandline pieces lie roughly parallel to
     * the local shore and stay rare enough to be individual events. */
    id: 'shoreline-driftwood', file: 'dead_tree_trunk_02/dead_tree_trunk_02_1k.gltf',
    habitat: 'drift', orient: 'shore-tangent', step: 42, d0: .8, d1: 8.8,
    keep: .18, scale: [.24, .46], sink: .18, castShadow: true,
  },
];

const CHUNKS = 6;

function random(seed) {
  return () => {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
}

function stableIdSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function collectTextures(material) {
  const textures = new Set();
  for (const key of [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap',
  ]) {
    if (material?.[key]) textures.add(material[key]);
  }
  return textures;
}

function prepareAsset(gltf, spec) {
  const variants = [];
  const sourceGeometries = new Set();
  const sourceMaterials = new Set();
  let sourceMaterial = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    if (spec.variantMatch && !spec.variantMatch.test(object.name)) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    sourceMaterial ||= material;
    sourceGeometries.add(object.geometry);
    if (material) sourceMaterials.add(material);

    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    geometry.translate(
      -(box.min.x + box.max.x) * .5,
      -box.min.y,
      -(box.min.z + box.max.z) * .5,
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    variants.push({
      geometry,
      triangles: (geometry.index?.count || geometry.getAttribute('position').count) / 3,
    });
  });
  return { variants, sourceMaterial, sourceGeometries, sourceMaterials };
}

function makeMaterial(source, spec, alphaMap) {
  const material = source.clone();
  material.name = `lake-habitat:${spec.id}`;
  material.roughness = Math.max(.82, material.roughness ?? .82);
  material.metalness = 0;
  material.envMapIntensity = spec.wind ? .58 : .72;
  const lift = spec.lift || 1;
  material.color.setRGB(lift, lift, lift);
  if (alphaMap) {
    material.alphaMap = alphaMap;
    material.alphaTest = .28;
    material.alphaToCoverage = true;
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
  }
  if (spec.wind) {
    const fade = new THREE.Vector2(...(
      spec.fade || (spec.id === 'meadow-herb' ? [58, 108] : [145, 235])
    ));
    const uniforms = {
      uHabitatTime: { value: 0 },
      uHabitatWind: { value: spec.wind },
      uHabitatFade: { value: fade },
    };
    material.userData.uniforms = uniforms;
    material.customProgramCacheKey = () => `lake-scanned-habitat:${spec.id}:v1`;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      material.userData.shader = shader;
      shader.vertexShader = `
        uniform float uHabitatTime, uHabitatWind;
        varying float vHabitatBase;
      ` + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vHabitatBase = smoothstep(.015, .18, position.y);
         float habitatPhase = instanceMatrix[3].x * .061 + instanceMatrix[3].z * .047;
         float habitatFlex = smoothstep(.04, .55, position.y);
         float habitatSway = sin(uHabitatTime * .78 + habitatPhase) * uHabitatWind * habitatFlex * habitatFlex;
         transformed.x += habitatSway;
         transformed.z += habitatSway * .34;`,
      );
      shader.fragmentShader = `
        uniform vec2 uHabitatFade;
        varying float vHabitatBase;
        float habitatHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      ` + shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           /* Preserve the scan's measured colour. A per-channel minimum turned
            * dark leaves mint green and erased all within-plant contrast. Sink
            * the geometry and darken its first few centimetres instead: that
            * is the local contact cue the lake's water-safe AO pass omits. */
           diffuseColor.rgb *= mix(vec3(.58, .66, .54), vec3(1.0), vHabitatBase);`,
        )
        .replace(
          '#include <lights_fragment_begin>',
          `#include <lights_fragment_begin>
           /* Thin leaves retain some sky and back-light instead of collapsing
            * to black cards when their source normal faces away from the sun. */
           float habitatBack = max(0.0, dot(normalize(vViewPosition), -geometryNormal));
           reflectedLight.directDiffuse += diffuseColor.rgb * habitatBack * .055;
           reflectedLight.indirectDiffuse += diffuseColor.rgb * .14;`,
        )
        .replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>
           float habitatFade = 1.0 - smoothstep(uHabitatFade.x, uHabitatFade.y, length(vViewPosition));
           if (habitatHash(gl_FragCoord.xy) > habitatFade) discard;`,
        );
    };
  }
  return material;
}

function slopeAt(terrain, x, z) {
  const e = .8;
  const dx = (terrain.height(x + e, z) - terrain.height(x - e, z)) / (2 * e);
  const dz = (terrain.height(x, z + e) - terrain.height(x, z - e)) / (2 * e);
  return { dx, dz, steepness: Math.hypot(dx, dz) };
}

function patchValue(x, z, phase) {
  const broad = Math.sin(x * .021 + z * .013 + phase + Math.sin(z * .006) * 2.4);
  const detail = Math.sin(x * .057 - z * .031 + phase * 1.7);
  return THREE.MathUtils.clamp(.53 + broad * .34 + detail * .13, 0, 1);
}

const COMMUNITY_KINDS = {
  'fern-gully': new Set(['swale', 'scrub']),
  'meadow-herb': new Set(['meadow', 'swale']),
  'broadleaf-scrub': new Set(['scrub']),
  'dense-green-scrub': new Set(['scrub']),
  'damp-moss-clump': new Set(['swale']),
};

/* A community is one ecological event with several storeys, not one grid per
 * species. These shared centres let moss/fern/grass occupy the same swale and
 * sward/grass/shrub occupy the same scrub edge. The empty cells are equally
 * important: they keep broad calm meadow between readable islands. */
function buildCommunityCenters(terrain) {
  const rng = random(0x7c41b5);
  const q = {};
  const centers = [];
  const step = 14.5;
  for (let z = BOUNDS.z1 + step * .5; z < BOUNDS.z0; z += step) {
    for (let d = 9; d < 151; d += step) {
      const pz = z + (rng() - .5) * step * .72;
      const pd = d + (rng() - .5) * step * .72;
      const x = shoreX(pz) + pd;
      if (x > BOUNDS.x1 - 3) continue;
      terrain.sampleField(x, pz, q);
      /* Centres may approach the route; every member still enforces the
       * species-specific clearance in placeAsset(). The former generic +9.5 m
       * exclusion ran first and made the grass/forb +1.35 m contract
       * unreachable, leaving a conspicuous mown corridor through all player
       * compositions even though the later placement code said otherwise. */
      if (q.dist < terrain.trail.widthAt(q.t) + 2.8) continue;
      const y = terrain.height(x, pz);
      if (y < -.02 || slopeAt(terrain, x, pz).steepness > .31) continue;
      const gravel = terrain.gravelAt?.(x, pz) ?? .3;
      if (gravel > .66 || rng() > .84) continue;
      const wetPatch = patchValue(x, pz, 4.83);
      const scrubPatch = patchValue(x, pz, 1.27);
      const kind = pd > 31 && scrubPatch > .57
        ? 'scrub'
        : pd < 108 && wetPatch > .61
          ? 'swale'
          : 'meadow';
      centers.push({ x, z: pz, d: pd, kind });
    }
  }
  /* Six route-wide composition beats supplement the stochastic field. They are
   * gameplay geography, not gallery coordinates: each sits just landward or
   * lakeward of a different trail chapter, so a walker repeatedly passes from
   * calm meadow into a mixed foreground frame and back out to open water. */
  const routePoint = new THREE.Vector3();
  for (const [t, offset, kind] of [
    [.16, 9, 'meadow'], [.30, 10, 'scrub'], [.43, -7, 'swale'],
    [.58, 11, 'scrub'], [.72, -6, 'swale'], [.86, 9, 'meadow'],
  ]) {
    terrain.trail.pointAt(t, routePoint);
    const z = routePoint.z;
    const d = routePoint.x - shoreX(z) + offset;
    const x = shoreX(z) + d;
    terrain.sampleField(x, z, q);
    if (x > BOUNDS.x1 - 3 || d < 4 || d > 148) continue;
    if (q.dist < terrain.trail.widthAt(q.t) + 4.5) continue;
    if (terrain.height(x, z) < -.02 || slopeAt(terrain, x, z).steepness > .31) continue;
    centers.push({ x, z, d, kind, featured: true });
  }
  return centers;
}

function habitatFit(spec, d, z, y, gravel, patch) {
  if (spec.habitat === 'drift') {
    const strand = 1 - THREE.MathUtils.smoothstep(d, 5.5, 10);
    return strand * (.48 + patch * .42 + gravel * .10);
  }
  if (spec.habitat === 'wet-rock') {
    const wet = 1 - THREE.MathUtils.smoothstep(d, 8, 29);
    return (.36 + gravel * .64) * (.32 + wet * .68);
  }
  if (spec.habitat === 'damp-floor') {
    const nearWater = 1 - THREE.MathUtils.smoothstep(d, 42, 78);
    const hollows = THREE.MathUtils.smoothstep(patch, .48, .88);
    return nearWater * hollows * (1 - gravel * .78);
  }
  if (spec.habitat === 'erratic') {
    const fans = Math.max(
      1 - THREE.MathUtils.smoothstep(Math.abs(z + 300), 42, 128),
      1 - THREE.MathUtils.smoothstep(Math.abs(z + 486), 38, 112),
    );
    return (.24 + fans * .58 + gravel * .25) * (.42 + patch * .58);
  }
  if (spec.habitat === 'swale') {
    const damp = .45 + .55 * (1 - THREE.MathUtils.smoothstep(d, 58, 112));
    return damp * THREE.MathUtils.smoothstep(patch, .44, .83) * (1 - gravel * .74);
  }
  if (spec.habitat === 'scrub') {
    const landward = THREE.MathUtils.smoothstep(d, 24, 68);
    return landward * THREE.MathUtils.smoothstep(patch, .42, .88) * (1 - gravel * .64);
  }
  const green = 1 - THREE.MathUtils.smoothstep(gravel, .24, .72);
  const height = 1 - THREE.MathUtils.smoothstep(y, 24, 35);
  return green * height * (.28 + patch * .72);
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [list[i], list[j]] = [list[j], list[i]];
  }
}

function placeAsset(owner, terrain, prepared, material, spec, communityCenters) {
  /* Asset order is not geography. An index-based seed re-rolled every rock,
   * herb and trunk after one unrelated family was removed, making visual
   * ablations impossible to interpret. IDs remain stable across additions. */
  const assetSeed = stableIdSeed(spec.id);
  const rng = random(0x5c4a11 ^ assetSeed);
  const lists = Array.from({ length: CHUNKS }, () => (
    Array.from({ length: prepared.variants.length }, () => [])
  ));
  const q = {};
  let sequence = 0;

  const sharedKinds = COMMUNITY_KINDS[spec.id];
  const candidates = sharedKinds
    ? communityCenters.filter((center) => (
      sharedKinds.has(center.kind) && center.d >= spec.d0 && center.d < spec.d1
    ))
    : null;
  const rows = candidates || (() => {
    const points = [];
    for (let z = BOUNDS.z1 + spec.step * .5; z < BOUNDS.z0; z += spec.step) {
      for (let d = spec.d0; d < spec.d1; d += spec.step) {
        points.push({
          x: shoreX(z) + d,
          z,
          d,
        });
      }
    }
    return points;
  })();

  for (const center of rows) {
      const jz = sharedKinds ? center.z : center.z + (rng() - .5) * spec.step * .90;
      const jd = sharedKinds ? center.d : center.d + (rng() - .5) * spec.step * .90;
      const x = shoreX(jz) + jd;
      if (x > BOUNDS.x1 - 3) continue;
      terrain.sampleField(x, jz, q);
      /* Grasses and forbs overlap the tread shoulder. A seven-metre generic
       * exclusion had created a mown boulevard around a path whose actual
       * half-width is barely over one metre; only woody crowns need clearance. */
      const routePad = spec.id === 'meadow-herb'
        ? 1.35
        : spec.wind ? 4.2 : 3.0;
      if (q.dist < terrain.trail.widthAt(q.t) + routePad) continue;
      const y = terrain.height(x, jz);
      if (y < -.02) continue;
      const slope = slopeAt(terrain, x, jz);
      if (slope.steepness > (spec.wind ? .34 : .47)) continue;
      const gravel = terrain.gravelAt?.(x, jz) ?? .3;
      const patch = patchValue(x, jz, assetSeed * .000013);
      const communityBoost = sharedKinds && (
        (center.kind === 'scrub' && spec.habitat === 'scrub')
        || (center.kind === 'swale' && (spec.habitat === 'swale' || spec.habitat === 'damp-floor'))
      ) ? 1.18 : 1;
      const featuredBoost = center.featured ? 1.65 : 1;
      if (rng() > Math.min(1, spec.keep * communityBoost * featuredBoost * habitatFit(spec, jd, jz, y, gravel, patch))) continue;

      /* The grid chooses community centres, never individual plants. Several
       * single-plant scans at neighbouring positions make one fern island,
       * grass tussock or complete shrub, while the larger step leaves broad
       * quiet meadow between those communities. This also turns source assets
       * made of isolated branch variants back into the bush they represent. */
      const count = spec.cluster
        ? Math.round(THREE.MathUtils.lerp(spec.cluster[0], spec.cluster[1], rng()))
        : 1;
      for (let member = 0; member < count; member++) {
        const radius = member && spec.clusterRadius
          ? Math.sqrt(rng()) * spec.clusterRadius
          : 0;
        const angle = rng() * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const pz = jz + Math.sin(angle) * radius;
        if (px > BOUNDS.x1 - 3 || pz > BOUNDS.z0 || pz < BOUNDS.z1) continue;
        terrain.sampleField(px, pz, q);
        if (q.dist < terrain.trail.widthAt(q.t) + routePad) continue;
        const py = terrain.height(px, pz);
        if (py < -.02) continue;
        const memberSlope = member ? slopeAt(terrain, px, pz) : slope;
        if (memberSlope.steepness > (spec.wind ? .34 : .47)) continue;
        /* Hash variant choice per centre/member. Round-robin assignment made
         * neighbouring islands repeat the same authored silhouette sequence. */
        const variant = Math.min(
          prepared.variants.length - 1,
          Math.floor(rng() * prepared.variants.length),
        );
        sequence++;
        const chunk = THREE.MathUtils.clamp(
          Math.floor((BOUNDS.z0 - pz) / (BOUNDS.z0 - BOUNDS.z1) * CHUNKS),
          0,
          CHUNKS - 1,
        );
        const age = Math.pow(rng(), .58);
        lists[chunk][variant].push({
          x: px, y: py - (spec.sink || .018), z: pz,
          yaw: spec.orient === 'shore-tangent'
            ? Math.atan2(-1, (shoreX(pz + 1) - shoreX(pz - 1)) * .5) + (rng() - .5) * .64
            : rng() * Math.PI * 2,
          rx: Math.atan(memberSlope.dz) * .72,
          rz: -Math.atan(memberSlope.dx) * .72,
          scale: THREE.MathUtils.lerp(spec.scale[0], spec.scale[1], age),
          wide: .78 + rng() * .54,
          tall: .86 + rng() * .30,
          deep: .78 + rng() * .54,
        });
      }
  }

  const dummy = new THREE.Object3D();
  lists.forEach((variants, chunk) => variants.forEach((list, variantIndex) => {
    if (!list.length) return;
    shuffle(list, rng);
    const mesh = new THREE.InstancedMesh(
      prepared.variants[variantIndex].geometry,
      material,
      list.length,
    );
    mesh.name = `habitat:${spec.id}:chunk-${chunk}:variant-${variantIndex}`;
    list.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(item.rx, item.yaw, item.rz);
      dummy.scale.set(
        item.scale * item.wide,
        item.scale * item.tall,
        item.scale * item.deep,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = spec.castShadow ?? Boolean(spec.wind);
    mesh.receiveShadow = true;
    mesh.userData.fullCount = list.length;
    mesh.computeBoundingSphere();
    owner.root.add(mesh);
    owner.meshes.push(mesh);
  }));
}

export class LakeHabitat {
  static async create(terrain, tier = 'high') {
    const gltfLoader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();
    const loaded = await Promise.all(ASSETS.map(async (spec) => {
      const [gltf, alpha] = await Promise.all([
        gltfLoader.loadAsync(url(spec.file)),
        spec.alpha ? textureLoader.loadAsync(url(spec.alpha)) : null,
      ]);
      if (alpha) {
        alpha.flipY = false;
        alpha.minFilter = THREE.LinearMipmapLinearFilter;
        alpha.magFilter = THREE.LinearFilter;
        alpha.needsUpdate = true;
      }
      return { spec, gltf, alpha };
    }));
    return new LakeHabitat(terrain, tier, loaded);
  }

  constructor(terrain, tier, loaded) {
    this.root = new THREE.Group();
    this.root.name = 'lake-scanned-habitat-communities';
    this.meshes = [];
    this.materials = [];
    this.geometries = [];
    this.textures = new Set();
    this.lastCull = null;
    const communityCenters = buildCommunityCenters(terrain);

    loaded.forEach(({ spec, gltf, alpha }) => {
      const prepared = prepareAsset(gltf, spec);
      const material = makeMaterial(prepared.sourceMaterial, spec, alpha);
      this.materials.push(material);
      this.geometries.push(...prepared.variants.map((variant) => variant.geometry));
      collectTextures(material).forEach((texture) => this.textures.add(texture));
      placeAsset(this, terrain, prepared, material, spec, communityCenters);
      prepared.sourceGeometries.forEach((geometry) => geometry.dispose());
      prepared.sourceMaterials.forEach((sourceMaterial) => sourceMaterial.dispose());
    });
    this.setTier(tier);
  }

  update(time) {
    this.materials.forEach((material) => {
      if (material.userData.uniforms) material.userData.uniforms.uHabitatTime.value = time;
    });
  }

  cullAround(x, z) {
    this.lastCull = [x, z];
    const range = this.tier === 'low' ? 160 : this.tier === 'medium' ? 205 : 245;
    this.meshes.forEach((mesh) => {
      const sphere = mesh.boundingSphere;
      mesh.visible = !sphere || Math.hypot(sphere.center.x - x, sphere.center.z - z) < range + sphere.radius;
    });
  }

  setTier(tier) {
    this.tier = tier;
    const density = tier === 'low' ? .38 : tier === 'medium' ? .70 : 1;
    this.meshes.forEach((mesh) => {
      mesh.count = Math.ceil(mesh.userData.fullCount * density);
    });
    if (this.lastCull) this.cullAround(...this.lastCull);
  }

  stats() {
    const perFamily = {};
    this.meshes.forEach((mesh) => {
      const family = mesh.name.split(':')[1];
      const triangles = (mesh.geometry.index?.count || mesh.geometry.getAttribute('position').count) / 3;
      perFamily[family] ||= { meshes: 0, instances: 0, triangles: 0 };
      perFamily[family].meshes += 1;
      perFamily[family].instances += mesh.count;
      perFamily[family].triangles += Math.round(triangles * mesh.count);
    });
    return {
      source: 'Poly Haven CC0 Verdant Trail, Pine Forest and Smugglers Cove scans',
      families: ASSETS.map((asset) => asset.id),
      perFamily,
      meshes: this.meshes.length,
      instances: this.meshes.reduce((sum, mesh) => sum + mesh.count, 0),
      triangles: Math.round(this.meshes.reduce(
        (sum, mesh) => sum + (mesh.geometry.index?.count || mesh.geometry.getAttribute('position').count) / 3 * mesh.count,
        0,
      )),
    };
  }

  dispose() {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
  }
}
