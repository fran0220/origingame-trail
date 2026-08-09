/* Sparse spring flower islands for the Lake level.
 *
 * The ambientCG ground material closes the living floor and habitat.js owns
 * photoscanned grass clumps. This layer spends geometry only where it changes
 * the picture: small, local flower islands that read as spring high-country.
 *
 * The source meshes and PBR textures are local CC0 Poly Haven assets. They are
 * loaded before the level becomes ready, converted into instanced geographic
 * chunks, and then participate in the same tier/cull/dispose lifecycle as the
 * procedural native species.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/loaders/GLTFLoader.js';
import { BOUNDS, shoreX } from './basin.js';

const FLOWER_URL = new URL(
  '../../../media/lake-assets/flowers/flower_heliophila_1k.gltf',
  import.meta.url,
).href;
const FLOWER_ALPHA_URL = new URL(
  '../../../media/lake-assets/flowers/textures/flower_heliophila_alpha_1k.png',
  import.meta.url,
).href;

function random(seed) {
  return () => {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
}

function prepareAsset(gltf) {
  const variants = [];
  const sourceGeometries = new Set();
  const sourceMaterials = new Set();
  let sourceMaterial = null;

  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    sourceMaterial ||= material;
    sourceGeometries.add(object.geometry);
    if (material) sourceMaterials.add(material);

    /* Bake the glTF node transform, then put every source plant on a shared
     * origin with its lowest point at y=0. This makes one placement contract
     * work for all authored variants instead of preserving Blender collection
     * offsets in every instance matrix. */
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const cx = (box.min.x + box.max.x) * .5;
    const cz = (box.min.z + box.max.z) * .5;
    geometry.translate(-cx, -box.min.y, -cz);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    variants.push({
      geometry,
      triangles: (geometry.index?.count || geometry.getAttribute('position').count) / 3,
      height: geometry.boundingBox.max.y,
    });
  });

  /* Only the prepared clones enter the level. The loader's scene is never
   * attached, so release its geometry and material shells while retaining the
   * textures shared by the production materials below. */
  sourceGeometries.forEach((geometry) => geometry.dispose());
  sourceMaterials.forEach((material) => material.dispose());
  variants.sort((a, b) => a.triangles - b.triangles);
  return { variants, sourceMaterial };
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

function meadowMaterial(source, key, wind, alphaMap, fade) {
  const material = source.clone();
  material.name = key;
  material.side = THREE.DoubleSide;
  material.transparent = false;
  material.opacity = 1;
  /* Poly Haven distributes these opacity maps beside the glTF but the source
   * glTF does not reference them. Without this explicit binding every empty
   * atlas texel is an opaque black rectangle — the R1 gallery's black twigs. */
  material.alphaMap = alphaMap;
  material.alphaTest = .38;
  material.alphaToCoverage = true;
  material.depthWrite = true;
  material.roughness = .91;
  material.metalness = 0;
  material.envMapIntensity = .48;
  material.color.set(0xffffff);

  const uniforms = {
    uMeadowTime: { value: 0 },
    uMeadowWind: { value: wind },
    uMeadowFade: { value: new THREE.Vector2(...fade) },
    uMeadowFloor: {
      value: key === 'spring-grass' ? new THREE.Color(.045, .13, .026) : new THREE.Color(0, 0, 0),
    },
  };
  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () => `lake-cc0-meadow:${key}:v1`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    material.userData.shader = shader;
    shader.vertexShader = `
      uniform float uMeadowTime, uMeadowWind;
    ` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float meadowPhase = instanceMatrix[3].x * .071 + instanceMatrix[3].z * .053;
       float meadowFlex = smoothstep(.018, .20, position.y);
       float meadowSway = sin(uMeadowTime * .82 + meadowPhase) * uMeadowWind * meadowFlex * meadowFlex;
       transformed.x += meadowSway;
       transformed.z += meadowSway * .31;`,
    );
    /* Individual scanned blades stop being useful once their width is below a
     * pixel. Dither them out before they turn into the basin-wide field of
     * black wires seen in R1/R2; the scanned PBR ground keeps the same green
     * cover underneath. Flowers are large enough to survive much farther. */
    shader.fragmentShader = `
      uniform vec2 uMeadowFade;
      uniform vec3 uMeadowFloor;
      float meadowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    ` + shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         diffuseColor.rgb = max(diffuseColor.rgb, uMeadowFloor);`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
         float meadowFade = 1.0 - smoothstep(uMeadowFade.x, uMeadowFade.y, length(vViewPosition));
         if (meadowHash(gl_FragCoord.xy) > meadowFade) discard;`,
      );
  };
  return material;
}

function pushMatrix(mesh, item, index, dummy) {
  dummy.position.set(item.x, item.y, item.z);
  dummy.rotation.set(item.rx || 0, item.yaw, item.rz || 0);
  dummy.scale.set(
    item.s * item.wide,
    item.s * item.tall,
    item.s * item.deep,
  );
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function buildMesh(owner, geometry, material, list, name, castShadow, dummy) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  mesh.name = name;
  list.forEach((item, index) => {
    pushMatrix(mesh, item, index, dummy);
    if (item.color) mesh.setColorAt(index, item.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  owner.root.add(mesh);
  owner.meshes.push(mesh);
  return mesh;
}

function slopeAt(terrain, x, z) {
  const e = .75;
  const dx = (terrain.height(x + e, z) - terrain.height(x - e, z)) / (2 * e);
  const dz = (terrain.height(x, z + e) - terrain.height(x, z - e)) / (2 * e);
  return { dx, dz, steepness: Math.hypot(dx, dz) };
}

function meadowPoint(terrain, x, z, q, pathPad = 1.7) {
  if (x > BOUNDS.x1 - 2) return null;
  terrain.sampleField(x, z, q);
  if (q.dist < terrain.trail.widthAt(q.t) + pathPad) return null;
  const gravel = terrain.gravelAt(x, z);
  if (gravel > .68) return null;
  const slope = slopeAt(terrain, x, z);
  if (slope.steepness > .42) return null;
  return { y: terrain.height(x, z), gravel, ...slope };
}

export class LakeMeadow {
  static async create(terrain, tier = 'high') {
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();
    const [flowerGltf, flowerAlpha] = await Promise.all([
      loader.loadAsync(FLOWER_URL),
      textureLoader.loadAsync(FLOWER_ALPHA_URL),
    ]);
    /* glTF texture coordinates use the WebGL convention already; standalone
     * TextureLoader images otherwise flip vertically and cut out the wrong
     * pieces of the shared atlas. */
    for (const texture of [flowerAlpha]) {
      texture.flipY = false;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
    }
    return new LakeMeadow(terrain, tier, flowerGltf, flowerAlpha);
  }

  constructor(terrain, tier, flowerGltf, flowerAlpha) {
    this.root = new THREE.Group();
    this.root.name = 'lake-living-green-meadow';
    this.meshes = [];
    this.materials = [];
    this.textures = new Set();
    this.geometries = [];
    this.lastCull = null;

    const flowers = prepareAsset(flowerGltf);
    this.geometries.push(...flowers.variants.map((variant) => variant.geometry));

    const flowerMaterial = meadowMaterial(flowers.sourceMaterial, 'alpine-flowers', .018, flowerAlpha, [150, 220]);
    this.materials.push(flowerMaterial);
    collectTextures(flowerMaterial).forEach((texture) => this.textures.add(texture));

    /* Grass coverage lives in the scanned PBR ground. R19/R20's scanned blades,
     * R21/R22's coverage cards and R33's short opaque ribbons all collapsed
     * into basin-wide wires or a repeated crop at landscape angles. This layer
     * therefore spends geometry only on silhouettes that remain resolvable:
     * sparse flower islands rather than another full-field grass representation. */
    const flowerVariant = flowers.variants[0];
    const dummy = new THREE.Object3D();
    const rng = random(0x1a4ead);
    const q = {};
    const chunks = 8;

    /* Flower islands are deliberately sparse, high-cost hero assets. Each
     * scanned plant has a complete three-dimensional leaf and petal volume;
     * sixty-four of them contribute more useful fairy-tale colour and outline
     * than hundreds of thousands of coloured points. */
    const flowerPalettes = [
      0xffffff, 0xffeb88, 0xdab9ff, 0xb8d2ff, 0xffbed6,
    ].map((hex) => new THREE.Color(hex));
    const flowerLists = Array.from({ length: chunks }, () => []);
    for (let tries = 0; tries < 5000 && flowerLists.reduce((n, list) => n + list.length, 0) < 72; tries++) {
      const z = THREE.MathUtils.lerp(BOUNDS.z0 - 5, BOUNDS.z1 + 5, rng());
      const d = 14 + Math.pow(rng(), .8) * 104;
      const x = shoreX(z) + d;
      const point = meadowPoint(terrain, x, z, q, 3.0);
      if (!point || point.gravel > .34 || rng() > .64) continue;
      const chunk = Math.min(chunks - 1, Math.floor((BOUNDS.z0 - z) / (BOUNDS.z0 - BOUNDS.z1) * chunks));
      flowerLists[chunk].push({
        x, y: point.y - .012, z,
        yaw: rng() * Math.PI * 2,
        rx: Math.atan(point.dz) * .18,
        rz: -Math.atan(point.dx) * .18,
        s: THREE.MathUtils.lerp(1.6, 3.0, rng()),
        wide: .9 + rng() * .38,
        tall: .88 + rng() * .28,
        deep: .9 + rng() * .38,
        color: flowerPalettes[(rng() * flowerPalettes.length) | 0],
      });
    }
    flowerLists.forEach((list, chunk) => buildMesh(
      this,
      flowerVariant.geometry,
      flowerMaterial,
      list,
      `meadow:flowers:chunk-${chunk}`,
      true,
      dummy,
    ));

    this.setTier(tier);
  }

  update(time) {
    this.materials.forEach((material) => {
      material.userData.uniforms.uMeadowTime.value = time;
    });
  }

  cullAround(x, z) {
    this.lastCull = [x, z];
    this.meshes.forEach((mesh) => {
      const sphere = mesh.boundingSphere;
      mesh.visible = !sphere || Math.hypot(sphere.center.x - x, sphere.center.z - z) < 225 + sphere.radius;
    });
  }

  setTier(tier) {
    this.tier = tier;
    this.meshes.forEach((mesh) => {
      const scale = tier === 'low' ? .38 : tier === 'medium' ? .72 : 1;
      mesh.count = Math.ceil(mesh.instanceMatrix.count * scale);
    });
  }

  stats() {
    return {
      source: 'Poly Haven CC0 flower_heliophila islands',
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
