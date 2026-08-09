/* Lake water at two spatial scales, plus the shore that makes it water.
 *
 * A kilometre plane cannot spend two-metre vertices everywhere, and a 60 m
 * grid cannot carry a wave beside the player. The far lake therefore ends at
 * the outer edge of a 220 m shoreline strip. That strip has enough geometry
 * for four shared wind waves, while fragment normals carry ripples below the
 * vertex spacing.
 *
 * The waterline is not drawn. It used to be: the plane ended exactly on
 * shoreX(z), a wet ribbon ran parallel to it at a fixed offset and a foam
 * ribbon ran parallel to both, so a frame of the margin showed three ruled
 * lines instead of a shore. Now the plane runs several metres in *under* the
 * beach and the depth buffer cuts it, so the water's edge is wherever the
 * ground actually crosses lake level — which the basin's beach relief makes
 * ragged at cobble and at cusp scale, at full heightfield resolution and
 * without a single vertex spent on it. The wet band comes from the terrain's
 * own wetness channel, driven by the same elevation, so the two agree by
 * construction rather than by two systems being authored to the same curve.
 */
import * as THREE from 'three';
import { BOUNDS, LAKE_Y, shoreX, bedProfile } from './basin.js';

const NEAR_WIDTH = 220;
const NEAR_END_Z = BOUNDS.z1 - 200;
/* How far the plane runs in under the beach. It has to exceed the beach relief
 * amplitude divided by the face slope, or a cusp embayment cuts back past the
 * plane's edge and opens a hole of dry bed below lake level. At 1:5 and ±0.3 m
 * that is about 1.5 m; five gives room and costs a handful of columns. */
const OVERSHOOT = 5;

function farEdge(z) {
  if (z >= BOUNDS.z1) return shoreX(z) - NEAR_WIDTH;
  const taper = THREE.MathUtils.clamp((BOUNDS.z1 - z) / 200, 0, 1);
  return THREE.MathUtils.lerp(shoreX(z) - NEAR_WIDTH, shoreX(z), taper);
}

function lakeGeometry(terrain, nearRows = 620, farRows = 100, cols = 232) {
  const positions = [], fetch = [], bed = [], indices = [];
  const rows = nearRows + farRows;
  for (let j = 0; j <= rows; j++) {
    const z = j <= nearRows
      ? THREE.MathUtils.lerp(BOUNDS.z0, NEAR_END_Z, j / nearRows)
      : THREE.MathUtils.lerp(NEAR_END_Z, BOUNDS.z1 - 1600, (j - nearRows) / farRows);
    const edge = shoreX(z);
    for (let i = 0; i <= cols; i++) {
      /* One smooth exponential spacing replaces the old 2.5 m → 55 m jump
       * at d=220. The material never changed there, but displaced vertices
       * did: a grazing camera could read the topology boundary as a broad
       * horizontal band.
       *
       * The ratio is steeper than it was (e^k, so 80:1 rather than 23:1),
       * because the near columns now have to resolve the depth ramp through the
       * swash zone rather than just a wave. Half a metre in the first ten,
       * widening to forty out at two kilometres, where a vertex buys nothing. */
      const u=i/cols,k=4.4;
      const d=-OVERSHOOT+(2300+OVERSHOOT)*Math.expm1(k*u)/Math.expm1(k);
      const x=edge-d;
      positions.push(x, LAKE_Y + .028, z);
      /* Two different quantities, and conflating them was the bug that made
       * this lake read as a tinted plane. Fetch is horizontal distance from
       * shore: it governs how much wind has worked the surface and how much
       * geometric detail is worth carrying, and it is genuinely a function of
       * distance. Bed is metres of water underneath, which governs everything
       * optical — extinction, whether the bed shows through, where the surf
       * breaks — and is not. The old code had one attribute named for the
       * second and filled with the first, so the water was already half opaque
       * three metres out where it is in fact ankle deep and clear, and every
       * optical band was a stripe running parallel to the authored shoreline. */
      fetch.push(Math.max(d, 0));
      /* Sampled from the heightfield where there is one, so the shallows carry
       * the actual cusps and cobbles of the bed the player can walk into; from
       * the shared analytic profile beyond its western edge, where the water is
       * already twenty metres deep and fully extinguished, so the changeover
       * cannot be seen. */
      bed.push(x > BOUNDS.x0 + 1 ? terrain.depthAt(x, z) : -bedProfile(edge - x));
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1;
    indices.push(a,b,a+1, a+1,b,b+1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFetch', new THREE.Float32BufferAttribute(fetch, 1));
  geometry.setAttribute('aBed', new THREE.Float32BufferAttribute(bed, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function waterMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    /* Near and far are one optical surface. Vary only geometric resolution;
     * changing roughness or PMREM strength at the strip boundary creates a
     * horizontal material seam exactly 220 m from shore. */
    roughness: .10,
    metalness: 0,
    ior: 1.333,
    specularIntensity: 1,
    envMapIntensity: 1.55,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const U = {
    uTime: { value: 0 },
    uNear: { value: 1 },
    uWaves: { value: 1 },
  };
  material.userData.uniforms = U;
  material.customProgramCacheKey = () => 'lake-pukaki-unified-water-v7';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    material.userData.shader = shader;
    shader.vertexShader = `
      attribute float aFetch;
      attribute float aBed;
      varying float vFetch, vBed;
      varying vec3 vW, vN;
      uniform float uTime, uNear, uWaves;

      void wave(in vec2 dir, in float length, in float amp, in float speed,
                in float edge, inout vec3 q, inout vec2 slope) {
        float k = 6.2831853 / length;
        float phase = dot(dir, q.xz) * k + uTime * speed;
        float a = amp * edge * uWaves;
        q.y += a * sin(phase);
        q.xz += dir * (a * .34 * cos(phase));
        slope += dir * (a * k * cos(phase));
      }
    ` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
        vec3 q = position;
        /* Waves die because the water gets shallow, not because it gets close
         * to a line on the map. Shoaling drags the orbital motion against the
         * bed and the wave breaks; damping on depth also means the fade follows
         * the ragged bed contour instead of running parallel to shoreX as a
         * conspicuous diagonal band. Below about 12 cm there is no wave left. */
        float edge = smoothstep(.05, .70, aBed);
        float gust = .64 + .36 * (.5 + .5*sin(q.x*.021 + q.z*.014 + sin(q.z*.003)*2.0));
        float surfaceDetail = mix(uNear,.12,smoothstep(400.0,1000.0,aFetch));
        vec2 slope = vec2(0.0);
        wave(normalize(vec2(.91,.42)), 22.0, .095*surfaceDetail, .78, edge*gust, q, slope);
        wave(normalize(vec2(.69,.72)), 10.5, .042*surfaceDetail, 1.12, edge*(1.15-gust*.28), q, slope);
        wave(normalize(vec2(.98,-.18)), 5.1, .018*surfaceDetail, 1.64, edge, q, slope);
        wave(normalize(vec2(.32,.95)), 2.15, .0070*surfaceDetail, 2.18, edge, q, slope);
        wave(normalize(vec2(-.55,.83)), 1.05, .0028*surfaceDetail, 2.85, edge, q, slope);
        vFetch = aFetch;
        vBed = aBed;
        vW = (modelMatrix * vec4(q, 1.0)).xyz;
        vN = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 transformed = q;
      `
    );

    shader.fragmentShader = `
      varying float vFetch, vBed;
      varying vec3 vW, vN;
      uniform float uTime, uNear, uWaves;
      vec3 gLakeNormal = vec3(0.0,1.0,0.0);
      float gLakeDistance = 0.0;
      float gLakeGlint = 0.0;
      float gLakeFoam = 0.0;
      float gLakeWindLane = 0.5;

      float whash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float wnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(whash(i),whash(i+vec2(1,0)),f.x),mix(whash(i+vec2(0,1)),whash(i+vec2(1,1)),f.x),f.y);}
      float wfbm(vec2 p){return wnoise(p)*.57+wnoise(p*2.03+17.2)*.29+wnoise(p*4.11-9.4)*.14;}
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
        vec2 wind = normalize(vec2(.91,.42));
        gLakeDistance = distance(cameraPosition,vW);
        float detailFade = 1.0-smoothstep(95.0,540.0,gLakeDistance);
        vec2 np0 = vW.xz*.145-wind*uTime*.075-47.3;
        float nh0 = wfbm(np0), eps0 = .18;
        vec2 noiseSlope0 = vec2(wfbm(np0+vec2(eps0,0.0))-nh0,wfbm(np0+vec2(0.0,eps0))-nh0)/eps0;
        vec2 np = vW.xz*.72-wind*uTime*.38;
        float nh = wfbm(np), eps = .055;
        vec2 noiseSlope = vec2(wfbm(np+vec2(eps,0.0))-nh,wfbm(np+vec2(0.0,eps))-nh)/eps;
        vec2 np2 = vW.xz*1.63+vec2(-wind.y,wind.x)*uTime*.19+31.7;
        float nh2 = wfbm(np2);
        vec2 noiseSlope2 = vec2(wfbm(np2+vec2(eps,0.0))-nh2,wfbm(np2+vec2(0.0,eps))-nh2)/eps;
        float surfaceDetail = mix(uNear,.54,smoothstep(400.0,1000.0,vFetch));
        vec2 micro = (noiseSlope0*.11 + noiseSlope*.078 + noiseSlope2*.032)
          * surfaceDetail * uWaves * detailFade;
        gLakeNormal = normalize(vN + vec3(-micro.x, 0.0, -micro.y));
        vec3 V = normalize(cameraPosition-vW);
        vec3 R = reflect(-V,gLakeNormal);

        /* Glacial flour is a participating body, not transparent cyan glass.
         * Beer extinction quickly hides the bed while pale suspended mineral
         * scattering survives through the first few metres.
         *
         * Metres of water, at last. Pukaki's beam attenuation is around 0.55 per
         * metre — a Secchi depth of seven or eight — so at 20 cm the bed is
         * plainly visible through the water, at a metre it is a shadow, and by
         * five it is gone. That first metre is the entire shallow-water
         * transition, and the old code spent it before the shore was even
         * reached because it was counting horizontal distance. */
        float extinction = 1.0-exp(-max(vBed,0.0)*.55);
        vec3 deep = vec3(.025,.255,.375);
        vec3 flour = vec3(.125,.525,.610);
        /* The bed seen through the shallows is wet shingle, and it is dark: the
         * dry map bakes to a linear mean near 0.20 and the terrain shader drops
         * wet ground to 0.58 of its dry value. An earlier 0.19..0.23 here was
         * nearly twice that, which put the shallows brighter than the beach
         * above them and read as a pale sandy lagoon rather than a cobble bed. */
        vec3 bed = vec3(.175,.184,.187);
        /* Depth is now a real depth, so the body's own colour ramp has to be
         * rescaled with it: the shift from pale flour green to deep blue happens
         * over tens of metres of water, which the bed profile reaches a couple
         * of hundred metres out. */
        vec3 body = mix(flour,deep,smoothstep(9.0,52.0,vBed));
        vec3 color = mix(bed,body,extinction);
        /* Wind lanes are the lake's missing middle scale: broad darker ribbons
         * where capillary ripples roughen the surface, separated by calmer sky-
         * reflecting water. They carry more photographic information than a
         * uniform field of bright point glints and remain stable at distance. */
        float laneA = wfbm(vW.xz * .0105 - wind * uTime * .006);
        float laneB = wfbm(vW.xz * .026 + vec2(-wind.y, wind.x) * 17.0);
        gLakeWindLane = smoothstep(.30, .78, laneA * .72 + laneB * .28);
        color *= mix(.86, 1.07, gLakeWindLane);
        color = mix(color, color * vec3(.82,.94,1.08), (1.0-gLakeWindLane) * extinction * .20);
        /* Caustics only exist where light still reaches the bed, which is a
         * depth condition and a shallow one. */
        float lit = 1.0 - smoothstep(.35, 4.5, vBed);
        float caustic = wfbm(vW.xz*1.08+wind*uTime*.24);
        color += (caustic-.5) * lit * vec3(.030,.048,.044);
        /* The stock physical lobe supplies the broad surroundings from the
         * same scene probe as every other material. No second projected image
         * is composited here: that finite-domain shortcut was the diagonal
         * seam rejected in the first water rebuild. */
        float ndv=max(dot(gLakeNormal,V),0.0);
        float fresnel=.02037+(1.0-.02037)*pow(1.0-ndv,5.0);
        vec3 clearSky = mix(vec3(.52,.64,.72),vec3(.08,.27,.49),smoothstep(0.0,.82,R.y));
        float longWave = clamp(.5+(vN.x*.72+vN.z*.28)*18.0,0.0,1.0);
        /* The shared environment probe already contains the sky and distant
         * massif. At this scale it is the correct representation: directional
         * but effectively position independent, sampled by the same physical
         * normal as the rest of MeshPhysicalMaterial. The former planar term
         * had a finite projected domain, so its edge was inevitably visible as
         * a diagonal second material across the lake. Keep only a restrained
         * body-side sky scatter here; the stock specular lobe supplies the
         * actual reflected radiance without another render of the scene. */
        /* Pukaki is read mostly by the bright sky reflected at shallow view
         * angles. The stock PMREM still supplies the real specular lobe; this
         * restrained body-side term keeps ankle-deep cells from becoming dark
         * polygons when their bed depth is interpolated to almost zero. */
        color = mix(color,clearSky,fresnel*mix(.18,.28,longWave));
        /* The captured image and the volume below are different optical
         * sources, but there is only one physical surface over both. Carry a
         * restrained long-wave facet term after the reflection mix so the
         * mountain half cannot become a second, unnaturally flat material. */
        float facet=.5+.5*(vN.x*.78+vN.z*.42);
        color*=mix(.955,1.045,facet*uWaves);
        /* Sparse sub-metre facets, jittered per world-space cell. Unlike the
         * old sine crest these cannot form a dashed horizon or a texture
         * period; derivatives keep each fleck stable as it falls below a
         * pixel. */
        vec2 gp=vW.xz*.86,cell=floor(gp),local=fract(gp)-.5;
        vec2 jitter=vec2(whash(cell+vec2(19.2,4.7)),whash(cell+vec2(-7.1,31.6)))-.5;
        vec2 delta=(local-jitter*.64)*vec2(.48,1.65);
        float fleck=1.0-smoothstep(.025,.075+fwidth(length(delta))*1.4,length(delta));
        /* Secondary denser fleck field so the surface is not a few sparse sparks
         * on an otherwise dead mirror — open-lake glitter is a continuous field
         * of sub-pixel flecks with occasional brighter ones. */
        vec2 gp2=vW.xz*1.72+vec2(11.3,-7.8);vec2 cell2=floor(gp2),local2=fract(gp2)-.5;
        vec2 j2=vec2(whash(cell2+3.1),whash(cell2+9.7))-.5;
        vec2 d2=(local2-j2*.55)*vec2(.55,1.35);
        float fleck2=1.0-smoothstep(.02,.055+fwidth(length(d2))*1.2,length(d2));
        float spark2=fleck2*smoothstep(.90,.998,whash(cell2+1.4));
        gLakeGlint=(fleck*smoothstep(.992,.9998,whash(cell))+spark2*.28)
          *pow(1.0-clamp(V.y,0.0,1.0),1.75)*detailFade*uWaves;
        /* Swash, and it has to move. Run-up climbs the beach face and drains
         * back over a few seconds, so the water's edge migrates across a metre
         * or so of shore; a static edge reads as a lake in a photograph rather
         * than one in front of you. Modelled as a travelling rise in the local
         * water level — where the still-water depth is less than the run-up
         * head, the swash has just covered that bed and is breaking over it.
         * Sampled along z so the surge runs along the shore instead of pulsing
         * everywhere at once, which is how a wave train arriving at an angle to
         * the beach actually behaves. */
        float surge = .5 + .5*sin(vW.z*.075 - uTime*1.15
                                 + wfbm(vec2(vW.z*.018, uTime*.07))*5.0);
        /* Run-up head has to reach past the first vertex band of aBed. The
         * exponential shoreline spacing puts roughly a metre between columns
         * once the plane has cleared the beach, so a 3–21 cm gate under-sampled
         * the foam zone and left only the rare vertex that landed inside it —
         * which is why the depth-cut edge in audit-r3a still read as a hard
         * ruled line with no lap. Widen to the shallow shelf the bed profile
         * actually resolves. */
        /* The first open-water column sits about 33 cm beyond shoreX and the
         * next one almost a metre out. A sub-20 cm head could be physically
         * plausible yet disappear entirely between those columns, leaving the
         * terrain/water intersection exposed as a polygon staircase. Keep the
         * lap shallow, but wide enough to survive this measured mesh spacing. */
        float runup = mix(.075, .31, surge*surge);
        /* Explicitly 1 when shallow: GLSL leaves smoothstep(hi, lo, x) undefined
         * when the first edge is larger than the second, and some drivers simply
         * return zero for the whole band — which is how a correctly derived
         * foam gate can still vanish in the frame. */
        gLakeFoam = 1.0 - smoothstep(max(runup - .045, 0.0), runup + .11, vBed);
        /* Positive bed alone is not enough: the overshoot strip under the beach
         * can still see positive depth wherever a cusp dips below lake level,
         * and the depth-test then leaves soft milky patches inland of the real
         * edge (r5b/r5c). aFetch is zero under the beach and rises only on the
         * open-water side, so the foam belongs where fetch is a few tens of cm
         * to a couple of metres — real open water at the lip. */
        gLakeFoam *= smoothstep(0.04, 0.24, vFetch)
                   * (1.0 - smoothstep(2.1, 4.8, vFetch));
        gLakeFoam *= smoothstep(0.0, 0.02, vBed);
        /* Broken, not a band. Continuous foam along the whole edge is the ribbon
         * this replaced; real lap foam on shingle is torn into patches a metre
         * or two long with clear water between them, because the bed drains
         * through the cobbles unevenly. */
        float torn = wfbm(vec2(vW.z*.62 + uTime*.5, vW.x*.62));
        gLakeFoam *= smoothstep(.52, .74, torn);
        color = mix(color, vec3(.91,.94,.94), gLakeFoam*.82);
        float distanceHaze = smoothstep(520.0, 2200.0, gLakeDistance);
        color = mix(color, vec3(.38,.56,.68), distanceHaze*.38);
        diffuseColor.rgb *= color;
        diffuseColor.a = 1.0;
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      /* Foam is air in water: it scatters instead of reflecting, so it has to
       * take the specular highlight off the surface or it looks like white paint
       * on glass. */
      `float roughnessFactor = mix(.065, .155, gLakeWindLane);
       roughnessFactor = mix(roughnessFactor, .20, smoothstep(180.0,900.0,gLakeDistance));
       roughnessFactor = mix(roughnessFactor, .82, gLakeFoam);`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `normal = normalize(mat3(viewMatrix) * gLakeNormal);`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
       /* An ankle-deep sheet reveals lit wet cobble; applying the open-water
        * diffuse suppression all the way to zero depth made individual mesh
        * cells at the ragged edge almost black. Fade to the denser body over
        * the first two metres instead of drawing a dark shoreline polygon. */
       float shallowLight = smoothstep(.18, 2.0, vBed);
       reflectedLight.directDiffuse *= mix(.78, .42, shallowLight);
       reflectedLight.indirectDiffuse *= mix(.70, .54, shallowLight);
       reflectedLight.directSpecular *= .82;
       reflectedLight.indirectSpecular *= 1.08;
       reflectedLight.directSpecular += vec3(.78,.88,.96)*gLakeGlint*.16;
       reflectedLight.indirectSpecular *= mix(1.0, 1.18, longWave*uWaves);`
    );
  };
  return material;
}

function random(seed) {
  return () => {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
}

function shorelineStones(terrain) {
  /* The scan in the ground shader owns gravel-size structure. Geometry begins
   * at hand-sized cobbles and occurs in storm/deposit patches; thousands of
   * evenly bright pebbles across meadow and path were reading as white confetti. */
  /* 1200 shore stones over 1.3 km of waterline is roughly one per metre of
   * beach, which is why the margin reads as sand with a few pebbles dropped on
   * it: a greywacke foreshore is *made* of stones, and the eye needs enough of
   * them that they overlap in the near field. Trebled on the shore only — the
   * path and fan populations were already right and are what the "white
   * confetti" note above was about. */
  const count = 5400, shoreCount = 3600, pathCount = 420, rng = random(0x70a1c), dummy = new THREE.Object3D();
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const pos=geometry.getAttribute('position');
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const warp=.84+.13*Math.sin(x*9.7+z*4.3)+.08*Math.sin(y*13.1-z*7.9);
    pos.setXYZ(i,x*warp,y*(.76+.10*Math.sin(x*8.1))+Math.min(0,y)*.12,z*warp);
  }
  pos.needsUpdate=true;
  geometry.computeVertexNormals();
  /* Instance colours are enabled automatically when setColorAt creates the
   * instanceColor attribute. vertexColors=true would additionally request a
   * per-vertex `color` attribute that this shared rock mesh does not have; its
   * default zeros multiply every instance to black. */
  const material = new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.94,metalness:0,flatShading:false,envMapIntensity:.62,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  /* Dry greywacke shingle in mountain sun is a mid blue-grey, not charcoal.
   * These were 0.06-0.13 linear — the value of a *wet* stone, and applied to
   * every stone on the beach whether the swash reaches it or not, which is
   * what made them read as dark litter scattered on pale sand instead of as
   * the beach itself. The spread matters as much as the level: a real shingle
   * is sorted by rock type as well as by size, so the pale weathered pieces
   * and the dark freshly-turned ones sit side by side. */
  const colors = [
    [.155,.170,.178], [.225,.238,.240], [.310,.318,.312], [.118,.132,.146],
    [.265,.262,.244], [.190,.196,.190],
  ].map(x=>new THREE.Color().setRGB(...x));
  const q = {}, pathPoint = new THREE.Vector3(), pathTangent = new THREE.Vector3();
  for (let i = 0, tries = 0; i < count && tries < count * 30; tries++) {
    const shoreStone = i < shoreCount;
    const pathStone = i >= shoreCount && i < shoreCount + pathCount;
    const fan = !shoreStone && !pathStone && rng() < .78;
    let x, z;
    if (pathStone) {
      const t = rng();
      terrain.trail.pointAt(t,pathPoint);
      terrain.trail.tangentAt(t,pathTangent);
      /* On the VERGE, not on the running surface. This scatter was written
       * when the lake trail was a gravel path and a stone in the wheel track
       * was correct; it is now a sealed state highway, and loose greywacke
       * lying on the seal is both wrong and directly under the car. A
       * highway's chip is on the shoulder, in the metre or so between the
       * edgeline and the grass, where the sweeper throws it. */
      const half = terrain.trail.widthAt(t);
      const side = (rng() < .5 ? -1 : 1) * (half + .35 + Math.pow(rng(), 1.4) * 1.9);
      x = pathPoint.x + pathTangent.z * side;
      z = pathPoint.z - pathTangent.x * side;
    } else {
      z = shoreStone
        ? THREE.MathUtils.lerp(BOUNDS.z0, BOUNDS.z1, rng())
        : fan
          ? (rng() < .54 ? -300 : -486) + (rng()+rng()+rng()-1.5) * (rng()<.5?82:58)
          : THREE.MathUtils.lerp(BOUNDS.z0, BOUNDS.z1, rng());
      const d = shoreStone
        ? .45 + Math.pow(rng(),1.55)*11.5
        : 10 + Math.pow(rng(),1.18)*(fan?72:38);
      x = shoreX(z) + d;
    }
    if(z>BOUNDS.z0||z<BOUNDS.z1||x>BOUNDS.x1-2)continue;
    terrain.sampleField(x,z,q);
    if(!pathStone&&q.dist<terrain.trail.widthAt(q.t)+2.2)continue;
    /* Deposits form strings and pockets rather than a uniform Poisson field. */
    const deposit = .5 + .5 * Math.sin(z * .071 + Math.sin(z * .019) * 3.4);
    if (!pathStone && rng() > .34 + deposit * .58) continue;
    const hero = !pathStone && rng() < (shoreStone?.035:.065);
    const s = hero
      ? THREE.MathUtils.lerp(shoreStone?.09:.14,shoreStone?.20:.32,rng())
      : pathStone
        ? THREE.MathUtils.lerp(.018,.065,Math.pow(rng(),1.8))
        /* Hand-sized and up. 38 mm was below the scale the scanned ground
         * already draws, so the smallest half of the shore population was
         * competing with the texture rather than adding to it. */
        : THREE.MathUtils.lerp(shoreStone?.065:.06,shoreStone?.26:.28,rng());
    dummy.position.set(x,terrain.height(x,z)+s*.13,z);
    dummy.rotation.set((rng()-.5)*.8,rng()*6.283,(rng()-.5)*.8);
    dummy.scale.set(s*THREE.MathUtils.lerp(.9,1.65,rng()),s*THREE.MathUtils.lerp(.22,.42,rng()),s*THREE.MathUtils.lerp(.85,1.25,rng()));
    dummy.updateMatrix();
    mesh.setMatrixAt(i,dummy.matrix);
    mesh.setColorAt(i,colors[(rng()*colors.length)|0]);
    i++;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.name = 'shore-greywacke-cobbles';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return { mesh, geometry, material };
}

export function drawLakeWater(ctx,map) {
  ctx.fillStyle='rgba(54,151,166,.88)';
  ctx.beginPath();
  ctx.moveTo(map.mx(BOUNDS.x0),map.my(BOUNDS.z0));
  for(let z=BOUNDS.z0;z>=BOUNDS.z1;z-=4) ctx.lineTo(map.mx(shoreX(z)),map.my(z));
  ctx.lineTo(map.mx(BOUNDS.x0),map.my(BOUNDS.z1));
  ctx.closePath();
  ctx.fill();
}

export class LakeWater {
  constructor(terrain, tier='high', renderer=null, scene=null) {
    this.time=0;
    this.root=new THREE.Group();
    this.root.name='lake-pukaki-unified-water-and-shore';
    this.surfaceMaterial=waterMaterial();
    this.surface=new THREE.Mesh(lakeGeometry(terrain),this.surfaceMaterial);
    this.surface.name='adaptive-density-whole-lake';
    this.surface.renderOrder=1;

    /* The wet ribbon and the foam ribbon that used to live here are gone. Both
     * were strips six metres and two metres wide laid along shoreX(z) with
     * their own materials, so the margin was made of three curves at fixed
     * offsets from a fourth: a dark band, a foam band and the plane's edge, all
     * exactly parallel, all perfectly smooth. That is the geometry of a drawn
     * shoreline, and no amount of shader work inside those strips could hide it.
     * Wetness is now the terrain's own channel, driven by height above lake
     * level, and the foam is a depth-gated term in the water shader; both
     * follow the bed contour, so both are as ragged as the beach is. */
    const stones=shorelineStones(terrain);
    this.stones=stones.mesh;
    this.stoneGeometry=stones.geometry;
    this.stoneMaterial=stones.material;
    this.stones.renderOrder=4;
    this.root.add(this.surface,this.stones);
    this.materials=[this.surfaceMaterial,this.stoneMaterial];
    this.standardMaterials=[this.stoneMaterial];
    this.setTier(tier);
  }

  update(dt,camera,sun,host) {
    this.time+=dt;
    this.surfaceMaterial.userData.uniforms.uTime.value=this.time;
  }

  setDebug(mode='none') {
    const waves=mode==='waves'?0:1;
    this.surfaceMaterial.userData.uniforms.uWaves.value=waves;
    this.stones.visible=mode!=='shore';
  }

  setTier(tier) {
    this.tier=tier;
    this.surfaceMaterial.userData.uniforms.uNear.value=tier==='low'?.62:1;
    this.stones.count=tier==='low'?360:this.stones.instanceMatrix.count;
  }

  stats() {
    return {
      meshes:2,
      triangles:this.surface.geometry.index.count/3,
      boundary:'bed-contour',widthMetres:2260,nearStripMetres:NEAR_WIDTH,cobbles:this.stones.count,
    };
  }

  dispose() {
    this.surface.geometry.dispose();
    this.stoneGeometry.dispose();
    this.materials.forEach(m=>m.dispose());
  }
}
