/* Native life arranged by Lake Pukaki habitat.
 *
 * Notebook subjects keep their stable species IDs and live object references.
 * Ambient life is organised into colonies, pairs, patrols and wetland swarms
 * instead of being rolled uniformly across the whole basin. Shared geometry
 * is assembled into distinct silhouettes for parrots, raptors, waterfowl,
 * waders, shorebirds, songbirds, reptiles and insects.
 */
import * as THREE from 'three';
import { trailOffset } from '../../game/anchors.js';
import { BOUNDS, shoreX } from './basin.js';

const DEFINITIONS = [
  /* The first eight remain the stable field-notebook subjects. */
  { species:'kea', t:.12, off:-8, mode:'fly', family:'parrot', habitat:'alpine-air', main:0x597041, accent:0xd86b20, count:3 },
  { species:'karearea', t:.28, off:10, mode:'fly', family:'raptor', habitat:'alpine-air', main:0x624936, accent:0xd3b77b, count:2 },
  { species:'black-fronted-tern', t:.43, off:-7, mode:'fly', family:'tern', habitat:'shore-air', main:0xd9ddda, accent:0x202729, count:12 },
  { species:'black-billed-gull', t:.57, off:-10, mode:'walk', family:'gull', habitat:'shore', main:0xe8e7df, accent:0x181c1f, count:14 },
  { species:'paradise-shelduck', t:.70, off:-13, mode:'swim', family:'duck', habitat:'water', main:0x6b422d, accent:0xf0e7d0, count:8 },
  { species:'nz-scaup', t:.83, off:-10, mode:'swim', family:'duck', habitat:'water', main:0x252c30, accent:0x9c7045, count:10 },
  { species:'southern-grass-skink', t:.91, off:5, mode:'small', family:'skink', habitat:'meadow', main:0x746b42, accent:0x302d20, count:7 },
  { species:'dragonfly', t:.35, off:4, mode:'smallFly', family:'dragonfly', habitat:'wet-air', main:0x317d83, accent:0xa9d9d5, count:14 },

  /* Ambient guilds make the same habitats visibly inhabited. */
  { species:'banded-dotterel', t:.50, off:-6, mode:'walk', family:'shorebird', habitat:'shore', main:0xc4b48a, accent:0x3a3020, count:9 },
  { species:'pied-stilt', t:.62, off:-9, mode:'walk', family:'wader', habitat:'wet-shore', main:0xe8e8e8, accent:0x141414, count:6 },
  { species:'welcome-swallow', t:.25, off:6, mode:'fly', family:'swallow', habitat:'shore-air', main:0x273947, accent:0xc45a30, count:11 },
  { species:'grey-warbler', t:.40, off:8, mode:'smallFly', family:'songbird', habitat:'scrub', main:0x71805b, accent:0xd8d0a8, count:8 },
  { species:'wrybill', t:.55, off:-5, mode:'walk', family:'shorebird', habitat:'fan-shore', main:0xcac8b9, accent:0x34322f, count:7 },
  { species:'black-stilt', t:.76, off:-8, mode:'walk', family:'wader', habitat:'wet-shore', main:0x242628, accent:0xc04f38, count:5 },
  { species:'puteketeke', t:.66, off:-15, mode:'swim', family:'grebe', habitat:'water', main:0x3c3934, accent:0xb64832, count:5 },
  { species:'bellbird', t:.23, off:12, mode:'smallFly', family:'songbird', habitat:'scrub', main:0x526f3f, accent:0x2d4430, count:7 },
  { species:'fantail', t:.46, off:10, mode:'smallFly', family:'fantail', habitat:'scrub', main:0x5b5145, accent:0xe2d7be, count:10 },
  { species:'red-admiral', t:.80, off:6, mode:'smallFly', family:'butterfly', habitat:'wet-air', main:0x261d1b, accent:0xc84a2d, count:13 },
];

function random(seed) {
  return () => {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
}

function part(root, geometry, material, scale, position, rotation, name) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.scale.set(...scale);
  object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = false;
  root.add(object);
  return object;
}

function makeWingGeometry() {
  const geometry = new THREE.BufferGeometry();
  /* Root at the shoulder, leading edge along X, feather tips swept aft (+Z).
   * The shallow camber keeps the wing readable from both profile and below. */
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0,0,0,  .45,.05,.03,  1,.01,.18,  .78,-.025,.48,
    .48,-.04,.72,  .16,-.02,.66,  0,0,.28,
  ], 3));
  geometry.setIndex([0,1,6, 1,2,5, 1,5,6, 2,3,4, 2,4,5]);
  geometry.computeVertexNormals();
  return geometry;
}

function makeTailGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.12, 0, 0, .12, 0, 0, .28, 0, .9,
    -.12, 0, 0, .28, 0, .9, -.28, 0, .9,
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeBillGeometry() {
  const geometry = new THREE.ConeGeometry(1, 1, 8);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -.5);
  return geometry;
}

function faunaMaterial(color, key, roughness = .88) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    flatShading: false,
    side: THREE.DoubleSide,
    envMapIntensity: .42,
  });
  material.customProgramCacheKey = () => `lake-fauna-organic:${key}:v1`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vFaunaLocal;\n` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vFaunaLocal = position;`,
    );
    shader.fragmentShader = `
      varying vec3 vFaunaLocal;
      float faunaHash(vec3 p) { return fract(sin(dot(floor(p), vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    ` + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       /* Subtle broken feather/scale values remove the billiard-ball response
        * without drawing high-contrast stripes across tiny ambient animals. */
       float faunaGrain = faunaHash(vFaunaLocal * 22.0);
       float faunaLayer = .5 + .5 * sin((vFaunaLocal.y - vFaunaLocal.z * .34) * 34.0);
       diffuseColor.rgb *= .86 + faunaGrain * .10 + faunaLayer * .04;`,
    );
  };
  return material;
}

function buildAnimal(def, materials, geometry, detailed = false) {
  const root = new THREE.Group();
  root.name = `fauna:${def.species}`;
  root.userData.wings = [];
  const { body, head, bill, cone, leg, wing, tail } = geometry;
  const { main, trim, detail, flight } = materials;
  let scale = .58;
  let focusY = .55;

  const addWingPair = (span, y, z = 0, folded = false, swept = .12, covertMaterial = main) => {
    const angle = folded ? 1.13 : swept;
    /* A perfectly horizontal wing is edge-on in the most common shore-side
     * profile view, which reduced flying kea and terns to round torsos. Hold a
     * modest dihedral through the flap cycle so the flight silhouette survives
     * from both side and below. Kea expose orange underwing coverts; dark
     * primary overlays retain the real feather edge instead of making the
     * entire wing a flat orange kite. */
    const dihedral = folded ? .08 : .30;
    const wingMaterial = def.family === 'parrot' && !folded ? covertMaterial : main;
    const left = part(root, wing, wingMaterial, [span,span*.18,span], [0,y,z], [0,angle,-dihedral], 'wing:left');
    const right = part(root, wing, wingMaterial, [-span,span*.18,span], [0,y,z], [0,-angle,dihedral], 'wing:right');
    left.userData.baseZ = -dihedral;
    right.userData.baseZ = dihedral;
    if (def.family === 'parrot' && !folded) {
      const leftPrimary = part(root, wing, detail, [span*.83,span*.19,span*.88], [0,y-.008,z+span*.045], [0,angle,-dihedral-.015], 'primaries:left');
      const rightPrimary = part(root, wing, detail, [-span*.83,span*.19,span*.88], [0,y-.008,z+span*.045], [0,-angle,dihedral+.015], 'primaries:right');
      leftPrimary.userData.baseZ = -dihedral - .015;
      rightPrimary.userData.baseZ = dihedral + .015;
      root.userData.wings.push(leftPrimary, rightPrimary);
    }
    /* A tapered covert creates a shoulder and a layered feather edge without
     * turning every distant flock member into dozens of draw calls. */
    const reach = folded ? span*.17 : span*.28;
    const volume = folded ? [span*.16,.075,span*.43] : [span*.31,.065,span*.19];
    part(root, body, covertMaterial, volume, [reach,y-.015,z+span*.20], [0,folded?.18:0,-.05], 'wing-covert:left');
    part(root, body, covertMaterial, volume, [-reach,y-.015,z+span*.20], [0,folded?-.18:0,.05], 'wing-covert:right');
    root.userData.wings.push(left, right);
  };

  const addEyes = (x, y, z, size) => {
    if (!detailed) return;
    for (const side of [-1, 1]) {
      part(root, head, detail, [size, size, size * .48], [side * x, y, z], null, 'eye');
    }
  };

  if (def.family === 'duck' || def.family === 'grebe') {
    scale = def.family === 'grebe' ? .46 : .43;
    part(root, body, main, [.50*scale,.31*scale,.82*scale], [0,.23*scale,.08*scale], [-.08,0,0], 'body');
    part(root, body, main, [.43*scale,.20*scale,.57*scale], [0,.42*scale,.15*scale], [-.12,0,0], 'mantle');
    if (def.family === 'grebe') {
      part(root, body, main, [.18*scale,.55*scale,.21*scale], [0,.88*scale,-.47*scale], [-.18,0,0], 'neck');
      part(root, head, trim, [.29*scale,.31*scale,.34*scale], [0,1.24*scale,-.59*scale], null, 'head');
      part(root, bill, detail, [.075*scale,.075*scale,.48*scale], [0,1.22*scale,-.82*scale], null, 'bill');
      addEyes(.25*scale, 1.30*scale, -.74*scale, .038*scale);
      focusY = .88;
    } else {
      part(root, body, main, [.20*scale,.35*scale,.22*scale], [0,.70*scale,-.55*scale], [-.30,0,0], 'neck');
      part(root, head, trim, [.32*scale,.34*scale,.37*scale], [0,.88*scale,-.72*scale], null, 'head');
      part(root, bill, detail, [.16*scale,.085*scale,.40*scale], [0,.85*scale,-.94*scale], null, 'bill');
      addEyes(.28*scale, .96*scale, -.82*scale, .040*scale);
      focusY = .58;
    }
    addWingPair(.62*scale,.45*scale,.04,true);
    part(root, tail, main, [.38*scale,1,.38*scale], [0,.36*scale,.83*scale], null, 'tail');
  } else if (def.family === 'wader') {
    scale = .42;
    part(root, body, main, [.43*scale,.36*scale,.72*scale], [0,1.08*scale,0], [-.12,0,0], 'body');
    part(root, body, main, [.14*scale,.42*scale,.16*scale], [0,1.38*scale,-.45*scale], [-.32,0,0], 'neck');
    const headMaterial = def.species === 'black-stilt' ? main : trim;
    part(root, head, headMaterial, [.27*scale,.27*scale,.30*scale], [0,1.66*scale,-.61*scale], null, 'head');
    part(root, bill, trim, [.045*scale,.045*scale,1.05*scale], [0,1.63*scale,-.80*scale], null, 'bill');
    addEyes(.23*scale, 1.72*scale, -.76*scale, .035*scale);
    for (const [x,z] of [[-.16,-.04],[.16,.14]]) {
      part(root, leg, trim, [.055*scale,1.15*scale,.055*scale], [x*scale,.43*scale,z*scale], [x<0?.08:-.08,0,0], 'leg');
      part(root, body, trim, [.09*scale,.035*scale,.25*scale], [x*scale,.06*scale,(z-.12)*scale], null, 'foot');
    }
    addWingPair(.50*scale,1.14*scale,0,true);
    focusY = .92;
  } else if (def.family === 'shorebird') {
    scale = .30;
    part(root, body, main, [.78*scale,.55*scale,.88*scale], [0,.46*scale,0], null, 'body');
    part(root, head, trim, [.38*scale,.38*scale,.39*scale], [0,.78*scale,-.54*scale], null, 'head');
    part(root, bill, detail, [.06*scale,.05*scale,.62*scale], [def.species==='wrybill'?.06*scale:0,.76*scale,-.78*scale], [0,def.species==='wrybill'?.18:0,0], 'bill');
    addEyes(.32*scale, .85*scale, -.68*scale, .040*scale);
    for (const x of [-.13,.13]) part(root, leg, trim, [.045*scale,.48*scale,.045*scale], [x*scale,.14*scale,.04*scale], null, 'leg');
    addWingPair(.46*scale,.48*scale,0,true);
    focusY = .38;
  } else if (def.family === 'skink') {
    scale = .18;
    part(root, body, main, [.52*scale,.20*scale,1.25*scale], [0,.18*scale,0], null, 'body');
    part(root, head, trim, [.38*scale,.24*scale,.48*scale], [0,.20*scale,-.90*scale], null, 'head');
    part(root, cone, main, [.20*scale,1.65*scale,.20*scale], [0,.17*scale,1.15*scale], [-Math.PI/2,0,0], 'tail');
    for (const [x,z] of [[-.48,-.35],[.48,-.35],[-.48,.48],[.48,.48]]) {
      part(root, leg, trim, [.05*scale,.46*scale,.05*scale], [x*scale,.10*scale,z*scale], [0,0,Math.sign(x)*Math.PI/2], 'leg');
    }
    focusY = .14;
  } else if (def.family === 'dragonfly' || def.family === 'butterfly') {
    scale = def.family === 'dragonfly' ? .075 : .055;
    part(root, body, main, [.10*scale,.10*scale,.62*scale], [0,.10*scale,.18*scale], null, 'abdomen');
    part(root, body, def.family==='butterfly'?trim:main, [.17*scale,.15*scale,.21*scale], [0,.10*scale,-.31*scale], null, 'thorax');
    part(root, head, main, [.11*scale,.11*scale,.13*scale], [0,.10*scale,-.52*scale], null, 'head');
    const spread = def.family === 'dragonfly' ? .92 : .78;
    const chord = def.family === 'dragonfly' ? .42 : .72;
    const wingMaterial = def.family === 'butterfly' ? main : flight;
    const left = part(root, wing, wingMaterial, [spread*scale,.14*scale,chord*scale], [0,.13*scale,-.10*scale], [0,.10,def.family==='butterfly'?.18:.03], 'wing:left');
    const right = part(root, wing, wingMaterial, [-spread*scale,.14*scale,chord*scale], [0,.13*scale,-.10*scale], [0,-.10,def.family==='butterfly'?-.18:-.03], 'wing:right');
    if (def.family === 'dragonfly') {
      part(root, wing, flight, [.72*scale,.12*scale,.34*scale], [0,.12*scale,.16*scale], [0,.30,.02], 'hindwing:left');
      part(root, wing, flight, [-.72*scale,.12*scale,.34*scale], [0,.12*scale,.16*scale], [0,-.30,-.02], 'hindwing:right');
    } else {
      part(root, wing, main, [.58*scale,.12*scale,.48*scale], [0,.12*scale,.12*scale], [0,.38,.12], 'hindwing:left');
      part(root, wing, main, [-.58*scale,.12*scale,.48*scale], [0,.12*scale,.12*scale], [0,-.38,-.12], 'hindwing:right');
      /* Smaller red overlays preserve the admiral's dark wing silhouette while
       * supplying the identifying bands instead of turning each whole wing red. */
      part(root, wing, trim, [.42*scale,.13*scale,.18*scale], [0,.135*scale,-.02*scale], [0,.16,.12], 'wing-band:left');
      part(root, wing, trim, [-.42*scale,.13*scale,.18*scale], [0,.135*scale,-.02*scale], [0,-.16,-.12], 'wing-band:right');
      for (const x of [-.055,.055]) part(root, leg, main, [.012*scale,.45*scale,.012*scale], [x*scale,.12*scale,-.70*scale], [Math.PI/2,x<0?-.18:.18,0], 'antenna');
    }
    root.userData.wings.push(left,right);
    focusY = .12;
  } else {
    const songbird = ['songbird','fantail','swallow'].includes(def.family);
    const raptor = def.family === 'raptor';
    scale = songbird ? .16 : def.family === 'parrot' ? .34 : raptor ? .38 : .34;
    const longWing = def.family === 'tern' || def.family === 'gull' || def.family === 'swallow';
    part(root, body, main, [songbird?.48*scale:.62*scale,.52*scale,songbird?.70*scale:.90*scale], [0,.58*scale,0], [-.10,0,0], 'body');
    part(root, body, def.family === 'parrot' ? main : trim, [songbird?.34*scale:.43*scale,.28*scale,.56*scale], [0,.56*scale,-.34*scale], [-.18,0,0], 'breast');
    part(root, head, def.family==='parrot'?main:trim, [.32*scale,.34*scale,.36*scale], [0,.91*scale,-.62*scale], null, 'head');
    part(root, bill, detail, [(longWing?.07:.12)*scale,(longWing?.055:.09)*scale,(longWing?.58:.34)*scale], [0,.89*scale,-.82*scale], null, 'bill');
    addEyes(.27*scale, .98*scale, -.76*scale, .038*scale);
    addWingPair((longWing?1.40:raptor?1.18:def.family==='parrot'?.95:.72)*scale,.64*scale,0,!['fly'].includes(def.mode),longWing?.20:.08,def.family==='parrot'?trim:main);
    const tailScale = def.family === 'fantail' ? 1.35 : def.family === 'swallow' ? 1.05 : .66;
    part(root, tail, main, [tailScale*scale,1,tailScale*scale], [0,.54*scale,.58*scale], [0,0,0], 'tail');
    focusY = songbird ? .34 : .58;
  }
  return { root, scale, focusY };
}

function clusterBase(def, index, rng, trail, terrain) {
  if (index === 0) {
    const p = trailOffset(def.t, def.off, trail, new THREE.Vector3());
    if (def.habitat === 'water') p.x = shoreX(p.z) - (def.species === 'nz-scaup' ? 8 : 5);
    return p;
  }

  /* Two or three stable colony centres per species, then local flock offsets. */
  const groups = Math.max(2, Math.min(4, Math.ceil(def.count / 4)));
  const group = (index - 1) % groups;
  const centreT = THREE.MathUtils.clamp(def.t + (group - (groups - 1) * .5) * .12, .05, .96);
  const centre = trail.pointAt(centreT, new THREE.Vector3());
  const z = THREE.MathUtils.clamp(centre.z + (rng() - .5) * 22, BOUNDS.z1 + 8, BOUNDS.z0 - 8);
  let d;
  if (def.habitat === 'water') d = -(5 + rng() * 15);
  else if (def.habitat === 'shore' || def.habitat === 'fan-shore' || def.habitat === 'wet-shore') d = 2 + rng() * 13;
  else if (def.habitat === 'scrub') d = 34 + rng() * 72;
  else if (def.habitat === 'meadow') d = 16 + rng() * 68;
  else if (def.habitat === 'wet-air') d = 8 + rng() * 30;
  else if (def.habitat === 'shore-air') d = -14 + rng() * 48;
  else d = 18 + rng() * 92;
  const x = shoreX(z) + d + (rng() - .5) * 7;
  return new THREE.Vector3(x, terrain.height(x, z), z);
}

export class LakeFauna {
  constructor(trail, terrain, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'lake-native-fauna';
    this.terrain = terrain;
    this.notable = Object.create(null);
    this.entities = [];
    this.time = 0;
    this.lastCull = null;

    const geometry = {
      body: new THREE.SphereGeometry(1, 16, 10),
      head: new THREE.SphereGeometry(1, 14, 9),
      bill: makeBillGeometry(),
      cone: new THREE.ConeGeometry(1, 1, 8),
      leg: new THREE.CylinderGeometry(1, 1, 1, 6),
      wing: makeWingGeometry(),
      tail: makeTailGeometry(),
    };
    this.geometries = Object.values(geometry);
    this.materials = [];
    const detail = faunaMaterial(0x171a18, 'shared-detail', .84);
    this.materials.push(detail);
    const flight = new THREE.MeshPhysicalMaterial({
      color: 0xd8edf0, roughness: .46, transmission: .08,
      transparent: true, opacity: .58, depthWrite: false, side: THREE.DoubleSide,
    });
    this.materials.push(flight);
    const rng = random(0xfa12a);

    /* Each species is placed as one colony at one point on the route, which
     * was right for 760 m of shore and leaves a 2 km valley with eighteen
     * pockets of life and long dead stretches between them. The route is
     * divided into as many kilometres as it has, and every species appears
     * once in each — same colony, same habitat rule, moved along. The `t` in
     * the table becomes a position *within* a kilometre rather than along the
     * whole stage, which is also what stops all eighteen bunching at the same
     * place when the road is lengthened again. */
    const COLONIES = Math.max(1, Math.round(trail.length / 1000));
    const SPREAD = DEFINITIONS.flatMap((def) => (
      Array.from({ length: COLONIES }, (_, c) => ({
        ...def,
        t: (c + def.t) / COLONIES,
        /* Later colonies are a touch smaller, so the first one a player meets
         * is still the set piece. */
        count: Math.max(2, Math.round(def.count * (c === 0 ? 1 : 0.7))),
      }))
    ));

    SPREAD.forEach((def, speciesIndex) => {
      const main = faunaMaterial(def.main, `${def.species}:main`);
      const trim = faunaMaterial(def.accent, `${def.species}:trim`, .84);
      this.materials.push(main, trim);

      for (let index = 0; index < def.count; index++) {
        const built = buildAnimal(def, { main, trim, detail, flight }, geometry, index === 0);
        const base = clusterBase(def, index, rng, trail, terrain);
        const ground = terrain.height(base.x, base.z);
        const baseY = def.mode === 'swim' ? .055
          : ground + (def.mode === 'fly' ? 7 + speciesIndex * .34 + (index % 4) * .7
            : def.mode === 'smallFly' ? 1.0 + rng() * 1.4 : .07);
        base.y = baseY;
        built.root.position.copy(base);
        built.root.rotation.y = rng() * Math.PI * 2;
        this.root.add(built.root);

        const entity = {
          id: index === 0 ? `lake-fauna-${def.species}` : `lake-fauna-${def.species}-${index}`,
          species: def.species,
          family: def.family,
          habitat: def.habitat,
          mode: def.mode,
          root: built.root,
          position: built.root.position,
          focus: new THREE.Vector3(),
          focusY: built.focusY,
          base: base.clone(),
          phase: speciesIndex * .91 + index * 1.37,
          speed: def.mode === 'fly' ? .22 + rng() * .20 : .42 + rng() * .24,
          orbit: def.mode === 'fly' ? 5 + rng() * 11 : def.mode === 'smallFly' ? .8 + rng() * 2.4 : .45 + rng() * 1.5,
          waterOffset: def.habitat === 'water' ? Math.max(3, shoreX(base.z) - base.x) : 0,
          radius: built.scale,
        };
        entity.focus.copy(entity.position).y += entity.focusY;
        this.entities.push(entity);
        if (index === 0) this.notable[def.species] = entity;
      }
    });
    this.setTier(tier);
  }

  update(dt) {
    this.time += Math.min(dt, .05);
    for (const entity of this.entities) {
      const a = this.time * entity.speed + entity.phase;
      const r = entity.orbit;
      const x = entity.base.x + Math.sin(a) * r;
      const z = entity.base.z + Math.cos(a * .83) * r;
      entity.position.set(x, entity.base.y, z);
      if (entity.mode === 'fly') entity.position.y = entity.base.y + Math.sin(a * 1.7) * 1.4;
      else if (entity.mode === 'smallFly') entity.position.y = entity.base.y + Math.sin(a * 2.6) * .42;
      else if (entity.mode === 'swim') {
        entity.position.x = shoreX(entity.position.z) - entity.waterOffset;
        entity.position.y = .12 + Math.sin(a * 2.1) * .015;
      } else entity.position.y = this.terrain.height(entity.position.x, entity.position.z) + .07;

      /* Models face local -Z; align the bill with the orbit tangent. */
      entity.root.rotation.y = Math.atan2(-Math.cos(a), .83 * Math.sin(a * .83));
      const wings = entity.root.userData.wings || [];
      const flap = Math.sin(a * (entity.mode === 'smallFly' ? 13 : 7));
      wings.forEach((wing, index) => {
        const motion = (index ? -1 : 1) * flap * (entity.mode === 'fly' || entity.mode === 'smallFly' ? .34 : .04);
        wing.rotation.z = (wing.userData.baseZ || 0) + motion;
      });
      entity.focus.copy(entity.position).y += entity.focusY;
    }
  }

  cullAround(x, z) {
    this.lastCull = [x, z];
    const range = this.tier === 'low' ? 145 : this.tier === 'medium' ? 220 : 310;
    for (const entity of this.entities) {
      const near = Math.hypot(entity.position.x - x, entity.position.z - z) < range;
      const notable = this.notable[entity.species] === entity;
      entity.root.visible = near && (this.tier !== 'low' || notable);
    }
  }

  setTier(tier) {
    this.tier = tier;
    if (this.lastCull) this.cullAround(...this.lastCull);
    else for (const entity of this.entities) {
      const notable = this.notable[entity.species] === entity;
      entity.root.visible = tier !== 'low' || notable;
    }
  }

  stats() {
    const ids = [...new Set(this.entities.map((entity) => entity.species))];
    let drawCalls = 0;
    this.entities.forEach((entity) => entity.root.traverse((object) => { if (object.isMesh) drawCalls++; }));
    return {
      species: ids.length,
      speciesIds: ids,
      habitats: [...new Set(this.entities.map((entity) => entity.habitat))],
      entities: this.entities.length,
      drawCalls,
    };
  }

  dispose() {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }
}
