/* The skyline: Ngauruhoe, Tongariro and Ruapehu.
 *
 * WHY THIS EXISTS AT ALL. The playable heightfield stops at 260 m either side
 * of the route, and from a ridge 766 m above the start you can see a very long
 * way past that. The first three builds rendered the terrain's own edge as a
 * fluted wall with a brown void beyond it, filling half the frame from the
 * high point — which is the one place in the level the view is the entire
 * reward for the climb.
 *
 * WHY CONES RATHER THAN A RANGE. The lake's backdrop is a wall of Southern
 * Alps built as full heightfields with cirques, tributary ridges and glaciers,
 * and it is 29,000 characters because an alpine range genuinely is that
 * complicated. A young andesite stratovolcano is the opposite: it is the
 * simplest large landform there is, a cone at the angle of repose, and the
 * reason Ngauruhoe is the most photographed mountain in the country is exactly
 * that it looks like a child's drawing of a volcano. Building it as anything
 * more elaborate than a cone would be building it wrong.
 *
 * So each mountain is a radial heightfield: one profile curve from summit to
 * base, plus erosion gullies that deepen down the flanks the way real ones do,
 * plus snow above a line that is lower on the south face than the north.
 */
import * as THREE from 'three';
import { Noise2D, clamp, smoothstep, lerp } from '../../world/noise.js';
import { PLATEAU_Y } from './terrain.js';
import { BOUNDS } from './route.js';

/* Positions are in the level's own coordinates, chosen so the two that matter
 * sit where they do in life relative to the walk: Ngauruhoe fills the view to
 * the west across South Crater, and Ruapehu is far to the south beyond it. */
const CONES = [
  {
    name: 'ngauruhoe', x: -2100, z: -1500, base: -28, height: 1248, radius: 1500,
    /* 2291 m, and only 2500 years old — which is why it has no gullies worth
     * the name and a near-perfect profile. The steepness is real: the upper
     * cone is at 33 degrees, the angle loose scoria stands at and no steeper. */
    profile: 1.28, gully: 0.85, snowLine: 0.14, rock: 0x3a2a22, snow: 0xd8dee4,
    segments: 160,
  },
  {
    name: 'tongariro-massif', x: 1900, z: -3100, base: -28, height: 808, radius: 2100,
    /* The old massif is a shield of overlapping craters, not a cone: lower,
     * broader, and cut about by everything that has erupted out of it for
     * 275,000 years. */
    profile: 0.72, gully: 1.05, snowLine: 0.07, rock: 0x453529, snow: 0xd2d8de,
    segments: 96,
  },
  {
    name: 'ruapehu', x: -4200, z: -6400, base: -28, height: 1798, radius: 3400,
    /* 2797 m and permanently snowed: the only one of the three with ice on it
     * all year, and at this distance that white cap is most of what it is. */
    profile: 0.94, gully: 0.72, snowLine: 0.40, rock: 0x3e3630, snow: 0xe2e8ee,
    segments: 104,
  },
];

/* A low ring of plateau beyond everything, purely to close the horizon. The
 * Central Plateau really is a rampart of old ignimbrite in every direction,
 * so this is not a curtain hiding a hole — it is the thing that is there. */
/* Centred on the middle of the LEVEL, not on the origin, and starting outside
 * its far corner. The first apron was a circle of inner radius 300 about the
 * world origin, while the playable field is a rectangle 520 m wide and 940 m
 * long running away to z = -880: the ring enclosed almost none of it, cut
 * through the terrain near the start, and left the far two thirds standing on
 * nothing. Seen from the ground that is a wall in every direction, which is
 * what four builds showed and what I blamed in turn on the slope limit, on LOD
 * stitching, on the stage discontinuity and on the seam height. One oblique
 * view from above showed the level was a rectangular slab on a plain, and the
 * cause was legible in a second. LOOK AT THE WHOLE THING BEFORE THE FOURTH
 * GUESS.
 *
 * Half-diagonal of the field from its centre is 537 m, so the apron starts at
 * 600 and the level sits comfortably inside it. */
/* DERIVED FROM BOUNDS, NOT TYPED IN. These were literals — centre (0, -410)
 * and half-extents 258 x 468 — and when the route was lengthened 2.9x to make
 * it walkable, every one of them silently went stale: the apron was sized for
 * a level a third the length and simply sat inside it. A constant copied from
 * another file is a bug with a delay on it. */
const CENTRE = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, z: (BOUNDS.z0 + BOUNDS.z1) / 2 };
const HALF_X = (BOUNDS.x1 - BOUNDS.x0) / 2 - 2;
const HALF_Z = (BOUNDS.z0 - BOUNDS.z1) / 2 - 2;
const RING = { radius: 9000, height: 120, segments: 128, colour: 0x6b6257, inner: 600 };
/* Far enough out that the 2.7 km level sits well inside it. */

function coneGeometry(spec, rng) {
  const { segments: S, radius: R, height: H, profile: P, gully: G } = spec;
  const RINGS = 52;
  const pos = [], col = [], idx = [];
  const rock = new THREE.Color(spec.rock);
  const snow = new THREE.Color(spec.snow);
  const lava = new THREE.Color(0x241d1b);
  const c = new THREE.Color();

  /* THE FIVE THINGS A SMOOTH TRIANGLE DOES NOT HAVE, and the first build had
   * none of them — three cones that were literally perfect triangles with a
   * point on top, which is a child's drawing of a volcano.
   *
   *   A SUMMIT CRATER. Ngauruhoe's top is not a point, it is a 400 m bowl with
   *   a rim that is higher on one side. That notch is the first thing you can
   *   identify it by from thirty kilometres away.
   *
   *   A BREAK OF SLOPE. The upper cone stands at the angle of repose and the
   *   apron below it is much gentler, so the profile is concave — a straight
   *   flank is the tell that nothing has ever slid down it.
   *
   *   GULLIES WITH DEPTH. The old term was multiplied by 0.055, which at this
   *   scale is a few metres on a 1200 m mountain — invisible. Real ones on
   *   Ngauruhoe are 30 to 60 m deep and they are what the snow lies in.
   *
   *   LAVA FLOWS. The 1949 and 1954 flows are black tongues running most of
   *   the way down the north-west flank and they are the darkest thing on the
   *   mountain. Two or three of them break the radial symmetry completely.
   *
   *   SNOW IN THE GULLIES, not a cap. Snow survives where it is shaded and
   *   drifted, which is inside the gullies and on the south side — a smooth
   *   white hat is the thing that made these read as paper cut-outs.
   */
/* 0.26, not 0.085. Ngauruhoe's crater is about 400 m across on a cone 3 km
   * wide, and at 0.085 the truncation was so narrow it read as a chimney or a
   * plug standing on the summit rather than as a hole in it. The proportion is
   * the whole point: a crater you can see into says the mountain is open at
   * the top, and a spike says it is solid. */
  const craterU = 0.26;
  const rimHigh = rng * 2.1;          // bearing of the high side of the rim
  /* Where the lava flows went. Fixed bearings per mountain, wide enough to
   * read at distance and narrow enough to leave the rest of the cone alone. */
  const flows = [rng * 1.7 + 0.4, rng * 1.7 + 2.8, rng * 1.7 + 4.9];

  for (let j = 0; j <= RINGS; j++) {
    const u = j / RINGS;                     // 0 summit, 1 base
    for (let s = 0; s <= S; s++) {
      const a = (s / S) * Math.PI * 2;

      /* ONE EXPONENT, AND IT IS BELOW ONE. The first cut added a separate
       * apron term on top of the main profile and the result was a BELL —
       * r reached 1.06 R with a wide thin skirt and the mountain read as a
       * mushroom. There is no need for two terms: for a cone at a constant
       * angle r is proportional to height below the summit, which is exactly
       * u to the power one, and every real stratovolcano sits slightly BELOW
       * that because the upper cone stands at the angle of repose and the
       * apron below it is gentler. e = 0.9 for Ngauruhoe, 0.5 for the old
       * shield, from the same P that already distinguished them. */
      const e = P * 0.70;
      let r = R * Math.pow(u, e);

      /* Gullies: nothing at the summit, deepest on the mid flank, dying out
       * again in the apron where the debris has filled them. */
      const gN = Math.sin(a * 9 + rng * 3.1) * 0.55
               + Math.sin(a * 17 + rng * 1.7) * 0.30
               + Math.sin(a * 29 + rng) * 0.15;
      const gDepth = Math.max(0, gN) * G * Math.sin(Math.min(1, u / 0.85) * Math.PI) * H * 0.075;

      /* The crater: the top of the cone is cut off into a bowl, and the rim
       * is higher on one side. */
      let y = spec.base + H * (1 - u);
      const rimLift = Math.cos(a - rimHigh) * 0.5 + 0.5;
      if (u < craterU) {
        const k = u / craterU;                       // 0 centre, 1 rim
        /* The rim matches the cone exactly at u = craterU, so there is no lip
         * flaring outward — the first version scaled the crater radius
         * independently and the summit came out as a trumpet on a stick. */
        /* CLOSES AT THE CENTRE. It went to 0.30 of the crater radius at k = 0,
         * which leaves a HOLE through the middle of the mesh — the summit was
         * a donut with sky visible through it. A crater has a floor. */
        r = R * Math.pow(craterU, e) * k;
        /* Floor of the bowl sits well below the rim; the rim itself is
         * tilted. */
        /* A shallow bowl with a nearly flat floor, and a rim that is only
         * slightly proud. Deeper than this and it reads as a funnel; the
         * previous 0.085 with a 0.030 rim lift made a trumpet. */
        y = spec.base + H - H * 0.052 * (1 - k * k * k) + H * 0.016 * rimLift * k;
      } else {
        y -= gDepth;
      }

      /* Lava flows: a shallow raised tongue on a few bearings, running from
       * just below the crater to most of the way down. */
      let onFlow = 0;
      for (const f of flows) {
        const d = Math.abs(((a - f + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        onFlow = Math.max(onFlow, smoothstep(0.24, 0.05, d));
      }
      onFlow *= smoothstep(craterU + 0.02, 0.18, u) * (1 - smoothstep(0.72, 0.94, u));
      y += onFlow * H * 0.012;
      r += onFlow * R * 0.006;

      /* Last rings flare into a debris apron instead of dropping. A dropped
       * last ring opened the hollow cone and the camera saw the interior as
       * a black diagonal. Flaring keeps the outside closed and overlaps the
       * plateau ring. */
      if (u > 0.86) {
        const t = (u - 0.86) / 0.14;
        r += R * 0.11 * t * t;
        y = lerp(y, spec.base - 2, t * t);
      }
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);

      /* Snow where it is shaded and drifted: inside the gullies, on the south
       * flank, above the line — never as a smooth cap. */
      const south = Math.max(0, -Math.sin(a));
      const line = spec.snowLine * (1 + south * 0.55);
      const inGully = clamp(Math.max(0, gN) * 1.5, 0, 1);
      const white = smoothstep(line, line * 0.45, u) * (0.35 + 0.65 * inGully)
                  + smoothstep(line * 0.5, line * 0.2, u) * 0.5;
/* Oxidised bands. A cone this young is not one grey: the scoria that
       * built it is rusty where it has weathered and dark where it has not,
       * and the bands follow the eruptions that laid them down — so they run
       * AROUND the mountain, not up it. Without them the flanks are one flat
       * value and the gullies are the only thing on a very large object. */
      const band = Math.sin(u * 23 + rng * 2) * 0.5 + 0.5;
      c.copy(rock).lerp(new THREE.Color(0.232, 0.128, 0.086),
                        Math.pow(band, 2.2) * 0.55 * (1 - smoothstep(0.72, 0.95, u)));
      c.lerp(snow, clamp(white, 0, 1) * (1 - onFlow * 0.85));
      /* The flows are the darkest thing on the mountain. */
      c.lerp(lava, onFlow * 0.88);
      /* Gullies hold shadow whatever is in them. */
      const shade = 1 - clamp(Math.max(0, gN), 0, 1) * 0.30 * Math.min(1, u * 2);
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  const W = S + 1;
  for (let j = 0; j < RINGS; j++) {
    for (let s = 0; s < S; s++) {
      const a0 = j * W + s, a1 = a0 + 1, b0 = a0 + W, b1 = b0 + 1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* THE APRON, and it is not scenery — it is the floor of the world.
 *
 * The playable heightfield stops 260 m either side of the route. Beyond that
 * there was NOTHING, so from anywhere high the lower half of the frame was the
 * brown of an empty clear colour, which is what the first four builds showed
 * and what I twice mistook for a lighting fault. Three cones on the horizon do
 * not fix it: they close the skyline and leave the ground missing.
 *
 * The apron is an annulus from just outside the playable edge out to the ring,
 * dropping from roughly valley height to the level of the Central Plateau —
 * which is what is actually down there. From South Crater at 540 m the player
 * is looking down onto a plain 500 m below, and that is the correct reading of
 * the real place: the Crossing stands on a plateau, not in a range.
 */
function ringGeometry(terrain) {
  const { radius: R, height: H, segments: S } = RING;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color(RING.colour);
  const n = new Noise2D(0x51a7);
  /* Radii: inside the bounds corner so there is no seam, then out to the rim. */
  /* THE APRON STARTS ON THE TERRAIN'S OWN BOUNDARY, WHICH IS A RECTANGLE.
   *
   * A circular inner edge cannot meet a rectangular field: set it at the
   * corner distance and it leaves a 340 m hole along the long sides; set it at
   * the side distance and it cuts the corners off. Both were tried and both
   * render as the level standing on a plinth with its cut sides showing.
   *
   * So for each bearing the inner edge is the distance from the level's centre
   * to the RECTANGLE along that bearing, and every ring outside it is a
   * multiple of that distance — the apron is rectangular where it touches and
   * relaxes to a circle by the time it reaches the plateau. */
  const HX = HALF_X, HZ = HALF_Z;
  const FRACS = [0.985, 1.08, 1.28, 1.62, 2.15, 2.9, 4.1, 6.2];
  for (let j = 0; j < FRACS.length + 1; j++) {
    for (let s = 0; s <= S; s++) {
      const a = (s / S) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      /* Distance from the centre to the rectangle edge along this bearing. */
      const tEdge = Math.min(HX / Math.max(1e-3, Math.abs(cx)),
                             HZ / Math.max(1e-3, Math.abs(cz)));
      /* The last ring is the far rim, which is a true circle. */
      const r = j < FRACS.length ? tEdge * FRACS[j] : R;
      const wx = CENTRE.x + cx * r, wz = CENTRE.z + cz * r;
      /* Seam: the terrain height just inside its own edge on this bearing. */
      /* Sample the playable field just inside its rectangle. A constant
       * plateau join left a hard brown/grey cliff wherever EDGE_FALL had not
       * quite finished — the seam every South Crater frame showed. */
      const inset = 18;
      const ix = clamp(CENTRE.x + cx * Math.max(0, tEdge - inset),
                      BOUNDS.x0 + 2, BOUNDS.x1 - 2);
      const iz = clamp(CENTRE.z + cz * Math.max(0, tEdge - inset),
                      BOUNDS.z1 + 2, BOUNDS.z0 - 2);
      const seam = terrain ? terrain.height(ix, iz) : PLATEAU_Y;
      /* Fall starts after a short overlap so the first ring sits *on* the
       * playable field rather than dropping off its already-falling edge.
       * The black diagonal was two rings spanning a 280 m EDGE_FALL in one
       * band, so the join read as a crack. Extra inner rings keep the grade
       * below about 8 degrees until the colour has already blended. */
      const fall = smoothstep(tEdge * 1.12, tEdge * 5.4, r);
      const rise = smoothstep(3900, R, r);
      const h = lerp(seam, PLATEAU_Y, fall) + rise * H
              + n.n(wx * 0.0016, wz * 0.0016) * 18 * smoothstep(tEdge * 1.4, tEdge * 3.2, r);
      pos.push(wx, h, wz);
      /* Warm the inner rings toward the playable ash so the join is a
       * colour as well as a height. */
      const ash = new THREE.Color(0x8a7a68);
      const k = smoothstep(tEdge * 1.05, tEdge * 3.4, r);
      const cc = ash.clone().lerp(c, k);
      const shade = 0.78 + 0.22 * smoothstep(tEdge * 2.2, R, r);
      col.push(cc.r * shade, cc.g * shade, cc.b * shade);
    }
  }
  const W = S + 1;
  /* FRACS.length + 1 rings, therefore FRACS.length bands. Written as
   * `j < RINGS` first, which indexed one ring past the end and left the outer
   * band referencing vertices that do not exist. */
  const RINGS = FRACS.length + 1;
  for (let j = 0; j < RINGS - 1; j++) {
    for (let s = 0; s < S; s++) {
      const a0 = j * W + s, a1 = a0 + 1, b0 = a0 + W, b1 = b0 + 1;
      /* WOUND THE OTHER WAY FROM THE CONES, and it has to be. A cone's rings
       * run from summit to base so increasing j goes DOWN the outside; the
       * apron's run outward across a horizontal plane, so the same index order
       * produces faces pointing at the ground. Sharing a material with the
       * cones is what made this hard to see — the material was obviously fine
       * because the mountains drew, so the apron simply rendered nothing and
       * looked like a missing mesh rather than a backwards one. */
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export class Skyline {
  constructor(terrain = null) {
    this.root = new THREE.Group();
    this.root.name = 'tongariro-skyline';
    this.materials = [];
    this.counts = { cones: 0, triangles: 0 };

    const mat = new THREE.MeshStandardMaterial({
      name: 'skyline', vertexColors: true,
      roughness: 0.96, metalness: 0.0, envMapIntensity: 0.42,
      /* Never a shadow caster or receiver: these are kilometres away, the
       * cascades do not reach them, and asking would only cost a pass. */
      flatShading: false,
    });
    mat.customProgramCacheKey = () => 'tongariro-skyline-v3';
    mat.onBeforeCompile = (sh) => {
      mat.userData.shader = sh;
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         /* Aerial perspective on the cones themselves. They sit outside the
          * FogExp2 useful range at this density, so without a local haze they
          * arrive as hard paper cut-outs against the sky. */
         float dist = length(vViewPosition);
         float haze = clamp(1.0 - exp(-dist * 0.000085), 0.0, 0.62);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.68, 0.74), haze);`
      );
    };
    this.materials.push(mat);

    CONES.forEach((spec, i) => {
      const g = coneGeometry(spec, i * 1.7 + 0.4);
      const m = new THREE.Mesh(g, mat);
      m.name = `skyline:${spec.name}`;
      m.position.set(spec.x, 0, spec.z);
      m.castShadow = false; m.receiveShadow = false;
      m.renderOrder = -3;
      this.root.add(m);
      this.counts.cones++;
      this.counts.triangles += g.index.count / 3;
    });

    const rg = ringGeometry(terrain);
    const rm = new THREE.Mesh(rg, mat);
    rm.name = 'skyline:plateau-apron';
    rm.castShadow = false; rm.receiveShadow = false;
    rm.renderOrder = -4;
    this.root.add(rm);
    this.counts.triangles += rg.index.count / 3;

    this.root.traverse((o) => { o.frustumCulled = true; });
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() {
    this.root.traverse((o) => o.geometry?.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
