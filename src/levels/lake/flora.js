import * as THREE from 'three';
import { addSpecularAA } from '../../render/specularAA.js';
import { BOUNDS, shoreX, ROAD_SHOULDER, AREA_SCALE, LAKE_Y } from './basin.js';
import { bakeImage } from '../../gfx/bake.js';

/* Three crossed cards render each sub-metre sward crown. The baked texture is
 * not a photograph pasted on a quad: it integrates independently curved
 * blades into coverage-preserving alpha, which is the resolvable signal once
 * a clump is more than a few metres away. Hero tussocks below still use bent
 * ribbon geometry. This replaces the former 108-triangle micro-clump whose
 * sparse one-pixel blades looked like luminous wire at landscape scale. */
const TUSSOCK_COVER_FRAG=/* glsl */`
float hash11(float p){return fract(sin(p*127.17)*43758.5453);}
float segDist(vec2 p,vec2 a,vec2 b){vec2 q=b-a;float t=clamp(dot(p-a,q)/dot(q,q),0.0,1.0);return length(p-a-q*t);}
void main(){
 vec2 p=vec2(vUv.x*2.0-1.0,vUv.y);
 float alpha=0.0,warm=0.0,weight=0.0;
 /* Low sward has upright blades with restrained tip lean. The old full sine
  * arc returned every tip almost to the ground; packed over the basin those
  * repeated arches read as a mint fern crop, not as meadow grass. */
 for(int i=0;i<30;i++){
  float fi=float(i),r0=hash11(fi+3.1),r1=hash11(fi+19.7),r2=hash11(fi+43.9);
  float signOut=mod(float(i),2.0)<1.0?-1.0:1.0;
  float h=.50+.46*r0,reach=.16+.32*r1,root=(r2-.5)*.20;
  vec2 prev=vec2(root,0.0);float blade=0.0;
  for(int j=1;j<=7;j++){
   float t=float(j)/7.0;
   float x=root+signOut*reach*(.20*t+.80*t*t)+signOut*.035*sin(t*4.2+r0*5.0);
   float y=h*(t+.10*sin(3.14159265*t)-.08*t*t);
   vec2 next=vec2(x,y);
   float w=mix(.0065,.0018,t);
   blade=max(blade,1.0-smoothstep(w,w+.0045,segDist(p,prev,next)));
   prev=next;
  }
  alpha=1.0-(1.0-alpha)*(1.0-blade);
  warm+=blade*r2;weight+=blade;
 }
 float tint=weight>0.0?warm/weight:.5;
 /* Dry sward, not lawn. These two were (.045,.17,.028) and (.19,.31,.065) —
  * green-dominant on both ends — which put a green haze over the whole basin
  * floor sitting on top of a tawny PBR ground and under tawny hero tussocks.
  * A short-tussock sward is straw with green only at the base of the blade,
  * so the ramp runs from a shaded olive root to a sun-bleached straw tip. */
 /* Close to the ground's own tawny mean, not darker than it.
  * The first cut of this ramp started at (.055,.075,.030) — about a third of
  * the ground's value — so every tuft read as a dark speck dropped on a pale
  * surface, and a verge of them read as gravel or litter rather than as grass.
  * A tuft of dry grass standing in dry grass is very nearly the same colour as
  * what it stands in; what makes it visible is silhouette and self-shadow, not
  * a value difference. */
 vec3 col=mix(vec3(.135,.120,.058),vec3(.300,.255,.112),tint*.44+.14);
 /* Paler at the tip, because that is the part that died back first and the
  * part the sun reaches — but only slightly, for the same reason. */
 col*=.86+.20*vUv.y;
 gl_FragColor=vec4(col,alpha);
}`;

/* Mackenzie suite: the twelve natives that write the field notebook, plus
 * three extra habitat fillers so a single terrace / fan / shore no longer
 * collapses to one silhouette class. Assets stay procedural and habitat-bound.
 *
 * The tussocks are not green, and getting that wrong is the single loudest
 * botanical error this level can make, because they are also the most numerous
 * thing in it. They were authored around 0x5f8b36 — a lawn green — at a time
 * when the ground under them was a pasture scan, so the two at least agreed.
 * Once the ground was corrected to dry tussock the plants were left as the
 * only green objects on a tawny hillside, which is worse than either mistake
 * on its own.
 *
 * The real colours, and they are specific rather than a general dulling:
 * silver tussock (Poa cita) is pale silvery straw; snow tussock (Chionochloa
 * rigida) is golden-tawny and is what makes a Mackenzie hillside glow against
 * the light; red tussock (C. rubra) is genuinely copper-brown and is the one
 * species here that reads warm at any distance; hard tussock (Festuca
 * novae-zelandiae) is a glaucous grey-buff; blue tussock (Poa colensoi) is
 * blue-grey. Matagouri is a grey-brown near-leafless thorn, and ozothamnus is
 * called cottonwood for its grey felt.
 *
 * The genuinely green species keep their green — flax, hebe, coprosma, manuka
 * and the wetland sedges are evergreen shrubs and rushes and are green in
 * life. The point is not that the palette should be brown, it is that it
 * should be the palette this place has: dry warm grasses with green confined
 * to the damp ground and the woody plants. */
export const SPECIES=[
 /* Tussock / grass floor */
 ['silver-tussock','terrace',0x9b9b76,'tussock'],
 ['snow-tussock','leeward',0xa8914f,'tussock'],
 ['red-tussock','wetland',0x9a6a41,'tussock'],
 ['hard-tussock','terrace',0x8d8a5e,'tussock'],
 ['blue-tussock','leeward',0x71806f,'tussock'],
 /* Woody shrubs */
 ['matagouri','fan',0x6b6553,'thorn'],
 ['manuka','terrace',0x3d603d,'branch'],
 ['kanuka','terrace',0x4a6a3d,'branch'],
 ['hebe','leeward',0x55774f,'broad'],
 ['hebe-odora','terrace',0x4f6d4a,'broad'],
 ['coprosma','fan',0x5d6d3d,'broad'],
 ['coprosma-propinqua','fan',0x51623a,'broad'],
 ['ozothamnus','leeward',0x8b8a6f,'branch'],
 ['dracophyllum','leeward',0x6d6444,'sword'],
 /* Wetland / shore */
 ['flax','wetland',0x365c3b,'sword'],
 ['toetoe','wetland',0xb8a66c,'plume'],
 ['sedge','shore',0x7d854f,'sedge'],
 ['jointed-rush','wetland',0x5f6e48,'sedge'],
 ['carex','wetland',0x66784a,'sedge'],
 ['raoulia-cushion','shore',0x839469,'mat'],
 ['raoulia-eximia','shore',0x8a9a72,'mat'],
 /* Forbs / swords */
 ['speargrass','fan',0x96965f,'sword'],
 ['acus','fan',0x8a8f55,'sword'],
 ['celmisia','terrace',0xc9cfbe,'flower'],
 ['gentian','terrace',0xd5dce8,'flower'],
 ['ourisia','leeward',0xc8d4c0,'flower'],
 ['anisotome','terrace',0x8fa070,'sword'],
 ['epineum','fan',0xa09060,'flower'],
 /* Spring colour layer. Russell lupin is an introduced South Island icon;
  * buttercup and daisy carry the native alpine palette around it. */
 ['mount-cook-buttercup','terrace',0xf2c92e,'flower'],
 ['south-island-daisy','terrace',0xe9eee2,'flower'],
 ['russell-lupin','fan',0x7458a8,'lupin'],
];
const SCALE={
 'silver-tussock':[.44,1.16],'snow-tussock':[.72,1.38],'red-tussock':[.55,1.28],
 'hard-tussock':[.48,1.10],'blue-tussock':[.50,1.20],
 matagouri:[.52,1.46],manuka:[.78,1.68],kanuka:[.70,1.55],
 hebe:[.55,1.16],'hebe-odora':[.48,1.05],
 flax:[.54,1.32],toetoe:[.58,1.36],
 'raoulia-cushion':[.38,.74],'raoulia-eximia':[.42,.82],
 coprosma:[.54,1.18],'coprosma-propinqua':[.46,1.05],
 ozothamnus:[.50,1.20],dracophyllum:[.60,1.40],
 sedge:[.36,.80],'jointed-rush':[.40,.92],carex:[.38,.88],
 speargrass:[.48,1.02],acus:[.42,.95],
 celmisia:[.44,.88],gentian:[.36,.72],ourisia:[.40,.80],
 anisotome:[.42,.90],epineum:[.34,.70],
 'mount-cook-buttercup':[.42,.82],'south-island-daisy':[.42,.86],
 'russell-lupin':[.68,1.20],
};
function random(seed){return()=>{seed=Math.imul(seed^seed>>>15,1|seed);seed^=seed+Math.imul(seed^seed>>>7,61|seed);return((seed^seed>>>14)>>>0)/4294967296;};}
/* Habitat suitability, 0..1, and the gradient is the whole point.
 *
 * These used to be boolean bands — `d>14 && d<105` and so on. A hard band edge
 * in a placement mask is visible from a hundred metres away as a straight line
 * of plants against bare ground, because every plant on the inside is accepted
 * and every plant one metre outside is refused. Nothing in an ecotone works
 * that way: a species thins out over tens of metres as conditions stop suiting
 * it. Returning a probability and rolling against it turns each edge into a
 * density gradient at no cost, and it is the single change that stops the
 * basin looking like it was planted in rectangles. */
const ramp=(v,a,b)=>THREE.MathUtils.smoothstep(v,Math.min(a,b),Math.max(a,b));
const band=(v,lo,hi,feather)=>Math.min(ramp(v,lo,lo+feather),1-ramp(v,hi-feather,hi));
function habitatFit(h,d,z,y){
 if(h==='shore')return band(d,2,20,5);
 if(h==='wetland')return band(d,5,36,8);
 if(h==='fan'){
  // Two alluvial fans. Density falls off from each fan axis, it does not stop.
  const lobe=Math.max(1-ramp(Math.abs(z+300),40,120),1-ramp(Math.abs(z+486),34,100));
  return lobe*band(d,8,150,14);
 }
 if(h==='terrace')return band(d,8,112,20)*(1-ramp(y,20,29));
 return band(d,12,150,18)*ramp(y,2,8);
}
function parentDistance(h,rng){if(h==='shore')return 5+rng()*12;if(h==='wetland')return 9+rng()*23;if(h==='terrace')return 16+rng()*88;if(h==='fan')return 16+rng()*120;return 21+rng()*125;}
function parentZ(h,rng){if(h==='fan')return rng()<.5?-300+(rng()-.5)*120:-486+(rng()-.5)*100;return THREE.MathUtils.lerp(BOUNDS.z0-8,BOUNDS.z1+8,rng());}

/* Species share community centres. Giving every species dozens of unrelated
 * broad scatter parents made the *aggregate* vegetation nearly uniform even
 * though each species was technically clustered. Shared centres create real
 * mixed wetland, terrace, fan and scrub stands with calm ground between. */
function habitatParents(h,rng){
 const parents=[];
 const zBands=[-35,-125,-215,-305,-395,-485,-575,-640];
 if(h==='fan'){
  for(const z of [-330,-295,-270,-510,-480,-450])for(const d of [24,58,98,132])parents.push({z:z+(rng()-.5)*16,d:d+(rng()-.5)*12,rz:12+rng()*16,rd:8+rng()*13});
 }else{
  const distances=h==='shore'?[5,12]:h==='wetland'?[12,25]:h==='terrace'?[24,58,92]:[42,86,128];
  zBands.forEach((z,zi)=>distances.forEach((d,di)=>{
   /* Skip alternating cells so stands form broad islands rather than rows. */
   if((zi*3+di*5+(h.length%4))%5===0)return;
   parents.push({z:z+(rng()-.5)*22,d:d+(rng()-.5)*14,rz:14+rng()*20,rd:8+rng()*16});
  }));
 }
 /* A small diffuse population connects communities without closing every gap. */
 for(let i=0;i<5;i++)parents.push({z:parentZ(h,rng),d:parentDistance(h,rng),rz:42+rng()*34,rd:22+rng()*26});
 return parents;
}
/* A habitat owns its coarse community geography. Species keep independent RNG
 * for their local offsets, scale and acceptance, but they must start from the
 * same parent centres or thirty-one technically clustered populations add up
 * to a uniform scatter. Fixed per-habitat seeds make a terrace island contain
 * several tussocks, forbs and shrubs together while preserving calm gaps. */
const HABITAT_PARENT_SEED={shore:0x6c101,wetland:0x6c102,fan:0x6c103,terrace:0x6c104,leeward:0x6c105};
/* Where the vegetation mass sits, and it is not on the waterline.
 *
 * Raising every population together put a continuous hedge of flax, toetoe and
 * sedge along the whole 2 km of shore — lush, green, and the wrong end of the
 * country. A Mackenzie lakeshore is bare graded shingle with almost nothing on
 * it, because it is scoured by wave and by lake-level change; the vegetation
 * mass is up on the terrace behind it and it is dry tussock. Flax and toetoe
 * are real here but they belong in damp gullies and fan seepages, in clumps,
 * not as a border planting.
 *
 * So the wetland and shore species come down hard and the terrace tussocks go
 * up to carry what they were carrying. Matagouri goes up with them: a
 * grey-brown thorn scattered over tawny grass is the single most recognisable
 * thing in this landscape after the tussock itself. */
const POPULATION={
 'silver-tussock':1900,'snow-tussock':1600,'red-tussock':700,'hard-tussock':1150,'blue-tussock':950,
 matagouri:980,manuka:300,kanuka:250,hebe:430,'hebe-odora':330,
 flax:210,toetoe:190,'raoulia-cushion':760,'raoulia-eximia':450,
 coprosma:380,'coprosma-propinqua':320,ozothamnus:420,dracophyllum:300,
 sedge:400,'jointed-rush':200,carex:250,
 speargrass:700,acus:400,celmisia:820,gentian:400,ourisia:300,anisotome:320,epineum:300,
 'mount-cook-buttercup':480,'south-island-daisy':430,'russell-lupin':300,
};
/* Native identity and vegetation mass are separate jobs. Scanned habitat now
 * carries the latter; asking thirty-one bespoke procedural species to carry it
 * as well covered every calm gap with bright low-poly silhouettes. Keep enough
 * of each species to make the biome genuinely diverse, and a larger searchable
 * population for the five notebook subjects, without using them as filler. */
/* The five the notebook asks for. They get a higher share so a player sent to
 * photograph one can find it; flax and toetoe are in that list and are also the
 * two that most easily become a hedge, so their populations above are set low
 * enough that a generous share still reads as occasional clumps. */
const NOTEBOOK_SPECIES=new Set(['silver-tussock','matagouri','flax','toetoe','raoulia-cushion']);

/* A toetoe flowerhead is a translucent mass of thousands of filaments. Those
 * filaments are below a pixel in every playable view, so modelling each one as
 * a tube spent millions of triangles on a result that still collapsed into an
 * opaque cone. This coverage-preserving card texture stores the aggregate
 * silhouette and density variation at the scale the renderer can resolve. */
const PLUME_FRAG=/* glsl */`
void main(){
 vec2 p=vec2(vUv.x*2.0-1.0,vUv.y);
 float envelope=pow(max(0.0,sin(3.14159265*p.y)),.62)*(1.0-.12*p.y);
 float body=sstep(envelope,envelope-.10,abs(p.x));
 float sweep=p.x*31.0+p.y*7.0+snoise(vec2(p.y*4.1,p.x*2.3))*4.5;
 float filament=.14+.86*sstep(.68,.94,.5+.5*sin(sweep));
 float tufts=.58+.42*(.5+.5*pfbm(vec2(p.x*7.0,p.y*11.0)+13.7,16.0,4));
 float core=sstep(.12,.0,abs(p.x))*(1.0-sstep(.72,.98,p.y));
 float alpha=body*clamp(filament*tufts+core*.55,0.0,1.0);
 vec3 shadow=vec3(.72,.69,.57),cream=vec3(.91,.88,.76),tip=vec3(.98,.97,.91);
 vec3 color=mix(shadow,cream,.45+.55*tufts);
 color=mix(color,tip,sstep(.68,1.0,p.y)*.48);
 gl_FragColor=vec4(color,alpha);
}`;

function cushionBump(){
 const size=256,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const hash=Math.sin(x*127.1+y*311.7)*43758.5453;
  const grain=hash-Math.floor(hash)-.5;
  /* Dense woolly rosettes are a material-scale signal. Two incommensurate
   * fields make tight tufts without asking the cushion mesh to sample dozens
   * of waves inside each centimetre — that undersampling caused the former
   * faceted concrete sheet. */
  const tuft=Math.sin(x*.83+Math.sin(y*.31)*2.4)*Math.sin(y*.77+Math.sin(x*.27)*2.1);
  const mat=Math.sin(x*.19+Math.sin(y*.11)*1.8)*Math.sin(y*.23+Math.sin(x*.13)*1.6);
  const v=THREE.MathUtils.clamp(166+35*tuft+20*mat+14*grain,82,238),i=(y*size+x)*4;
  data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
 }
 const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(11,11);
 tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
 tex.needsUpdate=true;return tex;
}

/* Two geometries for the continuous alpine sward.
 *
 * The previous single "card clump every 0.92 m" system is why the basin read
 * as khaki stamps on gravel instead of vegetation: each instance was a hero-
 * sized island, keep-rate left lattice holes, and the ground between them was
 * still shingle. Real high-country is a *floor* of grass with shrubs rising
 * out of it — jungle storeys inverted. The floor needs continuous packing at
 * two scales; the heroes remain separate. */
function groundCoverGeometry(cards=3,width=.72,height=.42){
 const p=[],uv=[],ix=[];
 for(let i=0;i<cards;i++){
  const a=i*Math.PI/cards,rx=Math.cos(a)*width*.5,rz=Math.sin(a)*width*.5,start=p.length/3;
  p.push(-rx*.78,.004,-rz*.78,rx*.78,.004,rz*.78,-rx*1.10,height,-rz*1.10,rx*1.10,height,rz*1.10);
  uv.push(0,0,1,0,0,1,1,1);
  ix.push(start,start+1,start+2,start+1,start+3,start+2);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}

function buildGroundCover(owner,terrain,renderer,dummy){
 /* .42 matches the jungle leaf threshold and is calibrated into the mip
  * chain. The bake itself is filament-sparse so three cards still show gaps. */
 const coverAlphaTest=.42;
 const map=bakeImage(renderer,TUSSOCK_COVER_FRAG,{size:512,colorSpace:THREE.SRGBColorSpace,coverageMips:coverAlphaTest});
 owner.textures.push(map);
 const makeCoverMat=(wind,key)=>{
  const mat=new THREE.MeshStandardMaterial({map,color:0xffffff,vertexColors:false,roughness:.96,metalness:0,alphaTest:coverAlphaTest,alphaToCoverage:true,side:THREE.DoubleSide,envMapIntensity:.25});
  const U={uFloraTime:{value:0},uFloraWind:{value:new THREE.Vector2(...wind)},uFloraFeather:{value:0},uFloraCushion:{value:0},uCoverFade:{value:new THREE.Vector2(16,32)}};
  mat.userData.uniforms=U;mat.customProgramCacheKey=()=>key;
  mat.onBeforeCompile=shader=>{Object.assign(shader.uniforms,U);mat.userData.shader=shader;shader.vertexShader=`uniform float uFloraTime;uniform vec2 uFloraWind;varying float vAlpineDry;\n`+shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\nobjectNormal=normalize(mix(objectNormal,vec3(0.0,1.0,0.0),.86));`).replace('#include <begin_vertex>',`#include <begin_vertex>\nfloat ix=instanceMatrix[3].x,iz=instanceMatrix[3].z;float ph=ix*.13+iz*.17;vAlpineDry=clamp(.5+.34*sin(ix*.013+iz*.007+sin(iz*.009)*1.7)+.16*sin(iz*.031-ix*.004),0.0,1.0);float flex=smoothstep(.02,.58,position.y);transformed.x+=sin(uFloraTime*uFloraWind.y+ph)*uFloraWind.x*flex*flex;`);shader.fragmentShader=`varying float vAlpineDry;uniform vec2 uCoverFade;float coverHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n`+shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP\nvec4 sampledDiffuseColor=texture2D(map,vMapUv);\ndiffuseColor*=sampledDiffuseColor;\nfloat dry=smoothstep(.58,.94,vAlpineDry);\nvec3 alpineBlade=mix(vec3(.62,.58,.40),vec3(.86,.76,.46),dry*.44);\ndiffuseColor.rgb*=mix(vec3(1.0),alpineBlade,.22);\n#endif`).replace('#include <alphatest_fragment>',`#include <alphatest_fragment>\nfloat coverFade=1.0-smoothstep(uCoverFade.x,uCoverFade.y,length(vViewPosition));\nif(coverHash(gl_FragCoord.xy)>coverFade)discard;`).replace('#include <lights_fragment_begin>',`#include <lights_fragment_begin>\nfloat back=max(0.0,dot(normalize(vViewPosition),-geometryNormal));reflectedLight.directDiffuse+=diffuseColor.rgb*back*.055;reflectedLight.indirectDiffuse+=diffuseColor.rgb*.22;`);};
  owner.materials.push(mat);return mat;
 };
 /* One genuinely low storey closes the first few metres. Mid-height clumps are
  * owned by scanned habitat families; duplicating them here made R21 an
  * evenly tall crop and erased every calm meadow interval. */
 const matSward=makeCoverMat([.022,.72],'lake-cover-sward-v2');
 const geoSward=groundCoverGeometry(3,.58,.20);
 const rng=random(0x4ec011),q={};
 const placeLayer=(layer,geo,mat,step,d0,d1,sizeLo,sizeHi,keepBase,cast)=>{
  for(let chunk=0;chunk<6;chunk++){
   const za=THREE.MathUtils.lerp(BOUNDS.z0,BOUNDS.z1,chunk/6);
   const zb=THREE.MathUtils.lerp(BOUNDS.z0,BOUNDS.z1,(chunk+1)/6);
   const list=[];
   for(let z=zb+step*.55;z<za;z+=step)for(let d=d0;d<d1;d+=step){
    /* Jitter over a whole cell, plus a decorrelated second offset.
     * +/-0.46 of a cell cannot break a 0.30 m lattice: every tuft still sits
     * within half a step of a grid node, and the eye reads the grid long
     * before it reads the jitter. What arrives is a stamped lattice of
     * identical marks, which is the failure this layer was switched off for
     * twice before. */
    const jz=z+(rng()-.5)*step*1.9,jd=d+(rng()-.5)*step*1.9;
    const x=shoreX(jz)+jd;if(x>BOUNDS.x1-2)continue;
    terrain.sampleField(x,jz,q);
    /* Clear of the whole road formation, not just the seal.
     * `widthAt` is the sealed half-width, so a +1.1 m margin put tufts on the
     * gravel shoulder and, where the field's bilinear distance rounded in,
     * on the seal itself — grass growing out of a state highway. The formation
     * is ROAD_SHOULDER wide and its batter runs on past that. */
    if(q.dist<ROAD_SHOULDER+0.8)continue;
    const mass=.5+.5*Math.sin(x*.037+jz*.023+1.4*Math.sin(jz*.009));
    const shore=THREE.MathUtils.smoothstep(d,2.4,11);
    /* Occasional wind-scald keeps the carpet from looking stamped. */
    const scald=.18*Math.max(0,Math.sin(x*.019+jz*.014)-.55);
    const keep=(keepBase+.16*mass-scald)*shore;
    if(rng()>keep)continue;
    const y=terrain.height(x,jz);
    const e=.7,dx=(terrain.height(x+e,jz)-terrain.height(x-e,jz))/(2*e),dz=(terrain.height(x,jz+e)-terrain.height(x,jz-e))/(2*e);
    if(Math.hypot(dx,dz)>.40)continue;
    /* Size varies over more than two to one. A lattice survives jitter if
     * every mark is the same size, because the repeat is then carried by the
     * marks rather than by their positions. */
    list.push({x,y,z:jz,s:THREE.MathUtils.lerp(sizeLo,sizeHi,Math.pow(rng(),1.6)),yaw:rng()*6.283,t:rng()});
   }
   if(!list.length)continue;
   const mesh=new THREE.InstancedMesh(geo,mat,list.length);
   mesh.name=`flora:ground-cover:${layer}:chunk-${chunk}`;
   list.forEach((p,i)=>{
    dummy.position.set(p.x,p.y-(layer==='sward'?.006:-.014),p.z);
    dummy.rotation.set(0,p.yaw,0);
    dummy.scale.set(p.s*(.88+p.t*.22),p.s*(layer==='sward'?.72:1),p.s*(.88+((p.t*7.1)%1)*.22));
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   });
   mesh.instanceMatrix.needsUpdate=true;
   mesh.castShadow=cast;mesh.receiveShadow=true;mesh.computeBoundingSphere();
   owner.root.add(mesh);owner.meshes.push(mesh);
  }
 };
 /* Near-field only, and that restriction is the whole reason this layer is
  * back after being switched off.
  *
  * Every previous attempt at ground cover on this level — scanned blades,
  * coverage cards, short opaque ribbons — was refuted the same way: at
  * landscape scale it became either a field of wires or a repeated crop, and
  * it did that because it was asked to cover the whole basin out to 154 m.
  * That is a job a card layer cannot do, and the conclusion drawn at the time
  * was that the PBR ground should own the cover outright.
  *
  * That conclusion was right about the distance and wrong about the near
  * field. With the ground alone, the first ten metres either side of the road
  * is a photograph of grass painted onto a smooth surface, with nothing
  * standing up out of it — and on a driven level that band is most of what the
  * eye has time to read. The failures were never about those ten metres; they
  * were about the ninety behind them.
  *
  * So the placement stops at 34 m instead of 154 m and the material fades out
  * from 16 m, which is inside the range where a card still has enough pixels
  * to read as a tuft. Past that the scanned ground takes over exactly as it
  * does now. This cannot become the basin-wide crop that was refuted, because
  * it does not reach the basin — and the instance count falls with the square
  * of the range, so the near field gets denser while the layer as a whole gets
  * cheaper than the one that was rejected. */
 placeLayer('sward',geoSward,matSward,.30,1.5,34,.52,.94,.97,false);
}

/* ── the roadside turf ──────────────────────────────────────────────────────
 *
 * Measured cover within 25 m of the road was 0.087 clumps per square metre.
 * Real short-tussock grassland is one to four, and the difference is exactly
 * what "the vegetation is far too sparse" means: the hero species are placed
 * across a 1.05 km^2 basin, so however many there are of them, almost none are
 * where the player is.
 *
 * The answer is not more hero plants. Thirty-one species at 350-500 triangles
 * each cannot reach that density anywhere, and card cover has been refuted on
 * this level three times — at the density that closes the ground it is a crop,
 * and below that it is speckle. What has never been tried is the obvious thing
 * between those two: real tussock geometry, cheap enough to have a hundred
 * thousand of, and placed only in the band that is ever seen.
 *
 * So this is a 42-triangle tuft — seven bent ribbons, three segments each,
 * which is the smallest thing that still has a silhouette and a self-shadow —
 * laid down the road at better than one per square metre out to 26 m and
 * nowhere else. It is placed against the trail directly rather than through
 * the distance field, because at ninety thousand plants a nearest-point query
 * per plant is most of the boot.
 */
/* ── the lupins ─────────────────────────────────────────────────────────────
 *
 * The one thing every photograph of this lake has in it, and the level did not
 * have: Russell lupins, in drifts, in purple and magenta and blue and cream.
 * They are the reason people stop on this road in December, and their absence
 * is most of why the roadside read as correct-but-plain — the biome was right
 * and there was no *colour* in it anywhere.
 *
 * They are also, botanically, a weed: an introduced garden escape that has
 * taken the braided riverbeds and displaced the native shore birds' habitat.
 * That is worth knowing and does not change what the place looks like, which
 * is what this level is about. They grow exactly where this puts them — the
 * road margins, the fan outwash and the disturbed shingle, not the dry terrace
 * where the tussock has closed over.
 *
 * The geometry is deliberately tiny. A drift is a hundred plants and there are
 * eighty drifts, so the spike is three crossed blades of 8 triangles rather
 * than the 2,400-triangle modelled raceme the hero species uses. At the
 * distance a drift is read from, what carries it is the colour and the density
 * of vertical marks, not the individual florets.
 */
/* Flowers in full alpine sun, so these are bright. The first set was authored
 * at the linear values of a *shaded* petal and disappeared into the tussock
 * under this level's exposure — a lupin drift is the most saturated thing in
 * the Mackenzie and it has to out-shout dry grass. */
const LUPIN_COLOURS = [
  [0.400, 0.150, 0.560],   // deep violet, the commonest
  [0.330, 0.115, 0.480],
  [0.560, 0.170, 0.380],   // magenta
  [0.640, 0.290, 0.450],   // pink
  [0.200, 0.220, 0.560],   // blue
  [0.640, 0.560, 0.330],   // cream
  [0.720, 0.690, 0.620],   // white, rarest and the one that reads at distance
];

function lupinGeometry(variant, rng) {
  const p = [], ix = [], col = [];
  const push = (x, y, z, c) => { const n = p.length / 3; p.push(x, y, z); col.push(...c); return n; };
  const spikes = 1 + (variant % 2);
  for (let s = 0; s < spikes; s++) {
    const flower = LUPIN_COLOURS[(rng() * LUPIN_COLOURS.length) | 0];
    /* Paler toward the tip: a raceme opens from the bottom, so the top of the
     * spike is still in bud and always lighter than the flowers below it. */
    const tip = flower.map((v) => Math.min(1, v * 0.55 + 0.42));
    /* A lupin raceme is about four to six times as tall as it is wide. The
     * first cut was 1:10 and read as a row of little surfboards stood on end. */
    const h = 0.38 + rng() * 0.34;
    const lean = (rng() - 0.5) * 0.18;
    const yaw = rng() * 6.283;
    const ox = Math.cos(yaw) * s * 0.10, oz = Math.sin(yaw) * s * 0.10;
    /* Three blades at 60 degrees, each a short strip rather than one triangle.
     *
     * The first version drew each blade as a single triangle from two base
     * points to a tip vertex, with the flower colour at the base and the pale
     * bud colour at the point. Interpolated across a 0.5 m triangle that is a
     * smooth gradient to white, and a drift of them read as a field of little
     * white cones — no colour at all, which was the entire purpose.
     *
     * A raceme is a column of florets that opens from the bottom, so it is
     * nearly full width for most of its height and only tapers in the last
     * fifth, and it is saturated over almost all of that. Four stacked
     * segments give exactly that profile and keep the flower colour across
     * three quarters of the spike, for eight triangles instead of one.
     */
    for (let b = 0; b < 3; b++) {
      const a = yaw + b * 1.047;
      const w0 = 0.058 + rng() * 0.026;
      const base = h * 0.34;
      const dx = Math.cos(a), dz = Math.sin(a);
      const stem = [0.10, 0.13, 0.05];
      const s0 = push(ox - dx * w0 * 0.22, base, oz - dz * w0 * 0.22, stem);
      const s1 = push(ox + dx * w0 * 0.22, base, oz + dz * w0 * 0.22, stem);
      const g0 = push(ox - dx * w0 * 0.22, 0, oz - dz * w0 * 0.22, [0.09, 0.11, 0.05]);
      const g1 = push(ox + dx * w0 * 0.22, 0, oz + dz * w0 * 0.22, [0.09, 0.11, 0.05]);
      ix.push(g0, g1, s0, g1, s1, s0);

      const SEG = 4;
      let prev = null;
      for (let k = 0; k <= SEG; k++) {
        const u = k / SEG;
        const y = base + (h - base) * u;
        /* Full width to 0.72 of the spike, then in to the bud. */
        const w = w0 * (u < 0.72 ? 1 - u * 0.18 : (1 - u) / 0.28 * 0.86);
        const c = u < 0.78 ? flower : tip;
        const px = ox + lean * (y - base) + dx * w;
        const pz2 = oz + dz * w;
        const nx2 = ox + lean * (y - base) - dx * w;
        const nz2 = oz - dz * w;
        const vA = push(nx2, y, nz2, c);
        const vB = push(px, y, pz2, c);
        if (prev) { ix.push(prev[0], prev[1], vA, prev[1], vB, vA); }
        prev = [vA, vB];
      }
    }

    /* A palmate leaf rosette at the foot, which is the other half of the plant
     * a lupin is recognised by. */
    for (let l = 0; l < 3; l++) {
      const a = yaw + l * 2.094 + 0.4;
      const r = 0.085 + rng() * 0.045;
      const lc = [0.115, 0.155, 0.075];
      const a0 = push(ox, 0.045, oz, lc);
      const a1 = push(ox + Math.cos(a - 0.42) * r, 0.02, oz + Math.sin(a - 0.42) * r, lc);
      const a2 = push(ox + Math.cos(a + 0.42) * r, 0.02, oz + Math.sin(a + 0.42) * r, lc);
      ix.push(a0, a1, a2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function buildLupinDrifts(owner, terrain, tier, dummy) {
  const trail = terrain.trail;
  const rng = random(0x1a9b17);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: .92, metalness: 0,
    side: THREE.DoubleSide,
  });
  const U = { uTurfTime: { value: 0 }, uTurfFade: { value: new THREE.Vector2(150, 260) } };
  mat.userData.uniforms = U;
  mat.customProgramCacheKey = () => 'lake-lupin-v1';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    mat.userData.shader = sh;
    sh.vertexShader = `uniform float uTurfTime; uniform vec2 uTurfFade;\n` + sh.vertexShader
      .replace('#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, vec3(0.0,1.0,0.0), 0.55));')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.09 + instanceMatrix[3].z * 0.11;
        float flex = smoothstep(0.06, 0.70, position.y);
        transformed.x += sin(uTurfTime * 1.15 + ph) * 0.045 * flex;
        transformed.z += cos(uTurfTime * 0.85 + ph * 1.7) * 0.030 * flex;`);
  };
  owner.materials.push(mat);

  const variants = [0, 1, 2, 3].map((v) => lupinGeometry(v, random(0x9c31 + v * 613)));
  owner.geometries?.push?.(...variants);

  const P = new THREE.Vector3(), T = new THREE.Vector3();
  const L = trail.length;
  const DRIFTS = Math.round((L / 1000) * (tier === 'low' ? 16 : tier === 'medium' ? 28 : 44));
  const CHUNK = 6;
  let lists = [[], [], [], []];
  let placed = 0;

  const flush = (tag) => {
    lists.forEach((list, v) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(variants[v], mat, list.length);
      mesh.name = `flora:lupin-drift:${tag}:${v}`;
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y - .01, q.z);
        dummy.rotation.set(0, q.yaw, 0);
        dummy.scale.setScalar(q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      owner.root.add(mesh);
      owner.meshes.push(mesh);
    });
    lists = [[], [], [], []];
  };

  for (let dft = 0; dft < DRIFTS; dft++) {
    /* Drifts sit along the road margin and out over the fan outwash, on the
     * side the lake is not — the shore itself is scoured shingle. */
    const t = (dft + 0.35 + rng() * 0.3) / DRIFTS;
    trail.pointAt(t, P); trail.tangentAt(t, T);
    const nx = T.z, nz = -T.x;
    const side = rng() < 0.62 ? 1 : -1;
    const centre = (ROAD_SHOULDER + 2 + Math.pow(rng(), 1.3) * 34) * side;
    /* Tight. 131 plants over a 40 x 50 m patch is not a drift, it is a
     * sprinkle — and that is what the first version looked like. A lupin
     * colony spreads from seed fall around where it started, so it is a dense
     * mass a few metres across with a ragged edge. */
    const spread = 2.6 + rng() * 4.4;
    const n = 90 + ((rng() * 130) | 0);
    for (let i = 0; i < n; i++) {
      /* Clumped inside the drift too, because a lupin colony spreads from
       * seed fall and is densest where it started. */
      const r = Math.pow(rng(), 0.6) * spread;
      const a = rng() * 6.283;
      const along = (rng() - 0.5) * spread * 2.6;
      const x = P.x + nx * (centre + Math.cos(a) * r) + T.x * along;
      const z = P.z + nz * (centre + Math.cos(a) * r) + T.z * along;
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 0.8) continue;
      const q = trail.nearest(x, z, {});
      if (q.dist < ROAD_SHOULDER + 1.2) continue;
      lists[(rng() * 4) | 0].push({ x, y, z, s: .78 + rng() * .62, yaw: rng() * 6.283 });
      placed++;
    }
    if ((dft % CHUNK) === CHUNK - 1) flush(dft);
  }
  flush('end');
  owner.lupins = placed;
}

/* ── the sward ──────────────────────────────────────────────────────────────
 *
 * Grass is not made of grass plants. That is the mistake this level kept
 * making: the roadside was built out of individual tussock stools, and however
 * many were placed and however tightly they were clumped, the result read as
 * "one plant, and another plant, and another plant" rather than as grass —
 * because a lawn, a meadow and a tussock flat are all a *continuous surface* of
 * blades with soil visible only in gaps, not a scatter of discrete objects.
 *
 * So the unit here is a PATCH, not a plant: a square metre containing fifty
 * blades, instanced edge to edge so neighbouring patches interlock and no seam
 * is ever visible. Fifty blades per square metre is the density at which the
 * ground stops showing between them at a driver's eye height, and it is
 * unreachable one plant at a time — 50 instances/m2 over even a short corridor
 * is millions of draws, while 1 patch/m2 is a few thousand.
 *
 * The tussock stools stay, on top of this, because a Mackenzie flat genuinely
 * is a short sward with taller stools standing out of it. What was wrong was
 * never that the stools existed; it was that there was nothing underneath them.
 *
 * Colour: the previous pale grey-cream was the value of sun-bleached dead leaf
 * and nothing else, which is why it read as lifeless. Real dry grassland has
 * green at the base of every blade where it is still growing and shaded, ochre
 * through the middle and bleached gold at the tip, and it is that vertical
 * gradient repeated fifty times a square metre that makes a grass surface look
 * alive rather than like carpet.
 */
function grassPatchGeometry(variant, rng) {
  const p = [], ix = [], col = [];
  const push = (x, y, z, c) => { const n = p.length / 3; p.push(x, y, z); col.push(...c); return n; };
  const SIDE = 1.05;
  /* A hundred and twenty blades to the square metre, not forty-four.
   *
   * Isolating the layer showed the problem exactly: at 44 the blades were
   * discrete red spears with the ground plainly visible between every one of
   * them, so the surface the player saw was still the terrain's own dark olive
   * texture with some grass standing in it. Grass reads as grass when it
   * *occludes* the ground, and that takes roughly a hundred blades per square
   * metre at this blade width — which is also, unsurprisingly, about what a
   * real sward has. */
  /* Up from 118. Reported as still too thin, and the arithmetic agrees: 118
   * blades of 5 mm over a square metre is under a fifth of that metre actually
   * covered once they are arched over, so the ground is still doing most of
   * the work at any grazing angle. */
  const blades = 172 + variant * 20;

  for (let b = 0; b < blades; b++) {
    const bx = (rng() - 0.5) * SIDE, bz = (rng() - 0.5) * SIDE;
    const yaw = rng() * 6.283;
    /* Short. This is the mat, not the stools: 90 to 260 mm, which is what a
     * grazed high-country sward stands at between its tussocks. */
    /* Short. 70 to 200 mm, which is a grazed high-country sward — the taller
     * stools are a separate layer. The first cut ran to 340 mm and, seen from
     * a metre away, a field of it read as a wheat crop rather than as turf. */
    const h = 0.070 + Math.pow(rng(), 1.6) * 0.130;
    const lean = 0.30 + rng() * 0.55;
    /* Thinner, because there are three times as many of them and a blade of
     * grass is 3-6 mm across, not 13. */
    const w = 0.0026 + rng() * 0.0026;
    const dx = Math.cos(yaw), dz = Math.sin(yaw);

    /* Per-blade colour, varied enough that fifty of them do not read as one
     * flat tone. Green root, ochre body, bleached tip. */
    /* Warm all the way up, and only faintly green at the very base.
     *
     * The first ramp put green over the lower three quarters of every blade
     * and, seen from above where most of a short sward's area is its middle,
     * the whole mat came out as dark moss. Dry high-country grass is *ochre*
     * — a hot yellow-brown — with a green cast only in the first centimetre or
     * two that is shaded by everything above it. The bands below are shifted
     * up accordingly so the ochre owns most of the blade. */
    /* `vigour` runs green-to-gold, and the weighting has been inverted.
     *
     * It used to be a quarter green and three quarters dead straw, on the
     * reading that this is dry tussock country. The shore benches this road
     * runs along are grazed pasture and they are green; the straw belongs on
     * the dry crowns. So most blades are now growing and the gold is the
     * minority that keeps it from being a lawn. */
    const green = 1.0 - Math.pow(rng(), 2.2);
    /* THE WHITE SPARKLES CAME FROM HERE, and it took three wrong guesses to
     * find out — specular antialiasing, then environment reflection, then the
     * sun, none of which moved the count by a single pixel. What finally
     * identified it was measuring the COLOUR of the offending pixels: mean
     * (253, 253, 230), a yellow-white, which is not the colour of a sky
     * reflection or a sun glint. It is this ramp, clipped.
     *
     * The dry tip was 0.545 albedo and `lift` multiplied it by up to 1.18, so
     * the brightest blades reached 0.64. Nothing in a dry landscape is that
     * reflective — dead grass measures about 0.30 and fresh concrete is 0.35.
     * Under this level's sun that albedo drives the tone curve past white, and
     * because a blade is a fraction of a pixel wide the result is a field of
     * isolated blown pixels rather than a bright surface: exactly the
     * scattered white points reported.
     *
     * Tips are now 0.385 at their driest and the lift ceiling is 1.10, which
     * keeps the ochre character and the blade-to-blade variation while leaving
     * headroom under the clip. */
    const lift = 0.82 + rng() * 0.28;
    const mixc = (dry, wet) => dry.map((v, i) => (v + (wet[i] - v) * green) * lift);
    const root = mixc([0.105, 0.110, 0.048], [0.048, 0.100, 0.032]);
    const mid = mixc([0.245, 0.208, 0.086], [0.098, 0.196, 0.058]);
    const tip = mixc([0.385, 0.332, 0.166], [0.186, 0.316, 0.106]);

    const SEG = 3;
    let prev = null;
    for (let k = 0; k <= SEG; k++) {
      const u = k / SEG;
      /* Arched, not straight: a blade leaves the ground vertically and falls
       * away, and it is the arch that makes a field of them close over. */
      const reach = lean * (u * u * 0.75 + u * 0.25);
      const y = h * (u + 0.20 * Math.sin(Math.PI * u) - 0.42 * u * u) * (1 / 0.78);
      const ww = w * (1 - u * 0.80);
      const c = u < 0.18 ? root : (u < 0.55 ? mid : tip);
      const cx = bx + dx * reach * h, cz = bz + dz * reach * h;
      const a = push(cx - dz * ww, y, cz + dx * ww, c);
      const bvx = push(cx + dz * ww, y, cz - dx * ww, c);
      if (prev) ix.push(prev[0], prev[1], a, prev[1], bvx, a);
      prev = [a, bvx];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function buildSward(owner, terrain, tier, dummy) {
  const trail = terrain.trail;
  /* Patches per square metre. One, because a patch *is* a square metre — the
   * scatter below jitters them so the lattice never shows. */
  /* The corridor reaches further too — 34 m stopped inside the distance a
   * driver reads, so the sward ended and the bare terrain began well within
   * the frame. */
  const OUTER = tier === 'low' ? 22 : tier === 'medium' ? 34 : 52;
  const INNER = ROAD_SHOULDER + 0.35;
  const rng = random(0x5ea77);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: .98, metalness: 0,
    side: THREE.DoubleSide,
    /* THE SPARKLES CAME FROM HERE.
     *
     * This material was left at the default envMapIntensity of 1.0 while every
     * other plant in the level sits between 0.24 and 0.42, so the sward was
     * reflecting the sky between three and four times as hard as the tussock
     * standing next to it. On a surface made of millions of near-vertical
     * 8 mm blades that is a field of isolated white pixels: each blade is well
     * under a pixel across, the normal inside one pixel is a wide
     * distribution rather than a direction, and any blade whose facet happens
     * to point at the sun returns the environment's brightest sample while
     * its neighbours return grass.
     *
     * It is not a lighting bug and it is not the sun — it is one material
     * being three times more mirror-like than its neighbours, on the one
     * surface in the level least able to afford it. Grass is not a mirror. */
    envMapIntensity: 0.30,
  });
  /* Faded on the same idea as everything else in this level: a blade is 8 mm
   * wide and stops resolving long before the cull distance, so the mat sinks
   * into the scanned ground rather than popping out of it. */
  const U = { uTurfTime: { value: 0 }, uTurfFade: { value: new THREE.Vector2(26, 46) } };
  mat.userData.uniforms = U;
  mat.customProgramCacheKey = () => 'lake-sward-v1';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    mat.userData.shader = sh;
    sh.vertexShader = `uniform float uTurfTime; uniform vec2 uTurfFade;\n` + sh.vertexShader
      .replace('#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, vec3(0.0,1.0,0.0), 0.80));')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        float flex = smoothstep(0.01, 0.22, position.y);
        transformed.x += sin(uTurfTime * 1.35 + ph) * 0.020 * flex;
        transformed.z += cos(uTurfTime * 1.05 + ph * 1.4) * 0.014 * flex;
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        float fade = 1.0 - smoothstep(uTurfFade.x, uTurfFade.y, length(cameraPosition - wp.xyz));
        transformed.y *= fade;`);
    /* Light every blade as though it faces the sky.
     *
     * These meshes are double-sided, and three flips the normal on a back
     * face — so the far side of every arched blade ends up pointing downward
     * and is lit by the hemisphere light's GROUND term, which in this level is
     * a dark olive (0x526d38). With a hundred blades to the square metre, half
     * of them facing away at any moment, that is what turned an ochre sward
     * into a carpet of dark moss: the vertex colours were never the problem.
     *
     * A blade of grass is a thin translucent strip; its two faces are not
     * meaningfully different, and every renderer that draws grass well cheats
     * the normal toward the surface it grows on for exactly this reason. */
    /* Converge each blade's colour to the sward's mean as it stops resolving.
     *
     * A blade is 3-6 mm wide. Past about twenty metres one pixel covers many
     * blades, so the shader is point-sampling a distribution and drawing
     * whichever blade happened to land under the sample. Blade colours run
     * from a dark green root to a bright ochre tip, and when the bright tail
     * of that distribution wins a pixel the result clips to white while its
     * neighbours stay grass-coloured — the field of white points reported.
     *
     * Lowering the tip albedo helped (117 sparkles to 61) because it moved
     * the whole distribution down, but it cannot fix this: the problem is the
     * VARIANCE, not the mean, and dimming the grass until its brightest tail
     * no longer clips is just making the grass grey.
     *
     * fwidth of world position gives this pixel's footprint on the ground
     * directly, and once that exceeds the blade width the honest value for the
     * pixel is the average of what it contains. This is the same hand-rolled
     * mipmapping the chipseal shader does, for the same reason, on a texture
     * that likewise has no mip chain because it is geometry.
     */
    sh.fragmentShader = 'varying vec3 vSwardW;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       {
         vec2 fw = vec2(length(vec2(dFdx(vSwardW.x), dFdy(vSwardW.x))),
                        length(vec2(dFdx(vSwardW.z), dFdy(vSwardW.z))));
         float foot = max(fw.x, fw.y);
         /* 6 mm blade: fully resolved under 3 mm of footprint, gone by 40. */
         float blend = smoothstep(0.003, 0.040, foot);
         /* The mean of the blade ramp — root through tip, weighted the way
          * the geometry distributes them. Measured from the same numbers the
          * patch builder uses, not guessed. */
         vec3 swardMean = vec3(0.196, 0.198, 0.092);
         diffuseColor.rgb = mix(diffuseColor.rgb, swardMean, blend);
       }`);
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      'vSwardW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    sh.vertexShader = 'varying vec3 vSwardW;\n' + sh.vertexShader;

    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
       normal = normalize(mix(normal,
         normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), 0.88));`
    );
  };
  owner.materials.push(mat);

  const variants = [0, 1, 2].map((v) => grassPatchGeometry(v, random(0x2f10 + v * 811)));
  owner.geometries?.push?.(...variants);

  const P = new THREE.Vector3(), T = new THREE.Vector3();
  const L = trail.length;
  const CHUNK_M = 60;
  const chunks = Math.ceil(L / CHUNK_M);

  for (let c = 0; c < chunks; c++) {
    const lists = [[], [], []];
    for (let m = c * CHUNK_M; m < Math.min(L, (c + 1) * CHUNK_M); m += 1.0) {
      trail.pointAt(m / L, P); trail.tangentAt(m / L, T);
      const nx = T.z, nz = -T.x;
      for (let o = INNER; o < OUTER; o += 1.0) {
        for (const side of [-1, 1]) {
          const jx = o + (rng() - 0.5) * 0.9;
          const x = P.x + nx * jx * side + T.x * (rng() - 0.5) * 0.9;
          const z = P.z + nz * jx * side + T.z * (rng() - 0.5) * 0.9;
          const y = terrain.height(x, z);
          if (y < LAKE_Y + 0.55) continue;
          lists[(rng() * 3) | 0].push({ x, y, z, yaw: rng() * 6.283, s: 0.92 + rng() * 0.30 });
        }
      }
    }
    lists.forEach((list, v) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(variants[v], mat, list.length);
      mesh.name = `flora:sward:${c}:${v}`;
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y - 0.015, q.z);
        dummy.rotation.set(0, q.yaw, 0);
        dummy.scale.set(q.s, q.s * (0.85 + (i % 4) * 0.09), q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      /* Not receiving, either, and that is what was making the whole mat read
       * as dark moss rather than as dry grass.
       *
       * The cascade is 170 m across a 2048 map, so a texel is 83 mm on the
       * ground. A blade is 8 mm wide and 200 mm tall — an order of magnitude
       * under one texel — so every one of them samples a depth value that
       * belongs to something else and comes back shadowed. A hundred thousand
       * patches of self-shadowing acne is a dark green carpet, which is
       * exactly what was on screen while the vertex colours said ochre.
       *
       * Something this far below the shadow map's resolution cannot be shaded
       * by it correctly, and the honest thing is not to try: the mat's contact
       * with the ground is carried by the ground's own shadow underneath it. */
      mesh.receiveShadow = false;
      mesh.computeBoundingSphere();
      owner.root.add(mesh);
      owner.meshes.push(mesh);
    });
  }
}

function tuftGeometry(variant, rng) {
  const p = [], ix = [], col = [];
  const blades = 11 + variant * 3;
  const push = (x, y, z, c) => { const n = p.length / 3; p.push(x, y, z); col.push(...c); return n; };
  for (let b = 0; b < blades; b++) {
    const yaw = b * 2.399 + rng() * 0.6;
    /* Wider and floppier than the first cut. Upright narrow blades at one
     * scale read as a seedling, and a field of seedlings at even spacing reads
     * as a crop — which is what the first version of this looked like. A
     * tussock is a fountain: the outer blades arch out almost as far as they
     * go up, and that is what makes neighbouring clumps touch. */
    const lean = 0.26 + rng() * 0.62;
    /* Smaller than they were. These are stools standing out of a sward now,
     * not the ground cover, and at the old size a single one filled a metre of
     * frame and the mat underneath was invisible behind them. */
    const h = 0.20 + rng() * 0.30;
    const w = 0.020 + rng() * 0.016;
    /* Straw at the tip, olive at the root: the two ends of a dry tussock
     * blade, and the same ramp the ground shader uses for its sward. */
    /* Nearly the value of the ground it stands in. Dry tussock against dry
     * litter is a difference of texture and silhouette, not of tone, and the
     * first cut of these was dark enough against the tawny surface that each
     * clump read as an object dropped on the ground rather than as the ground
     * being grassy. Paler and warmer, with the tip lighter than the root
     * because that is the part that died back first. */
    /* Brighter, now that these are the taller stools standing out of a sward
     * rather than the ground cover itself: a tussock catches the sun on its
     * arching outer blades and is the *lightest* thing on a dry hillside. */
    /* Tussock stays the golden note, because that is genuinely what a stool of
     * Festuca or Poa is even in green pasture — but less bleached than before,
     * so it sits in the sward rather than on top of it. */
    const root = [0.205, 0.192, 0.098], tip = [0.352, 0.315, 0.156];
    let prev = null;
    for (let s = 0; s <= 3; s++) {
      const u = s / 3;
      const reach = lean * (u * u * 0.72 + u * 0.28);
      const y = h * (u + 0.16 * Math.sin(Math.PI * u) - 0.44 * u * u);
      const ww = w * (1 - u * 0.85);
      const cx = Math.cos(yaw) * reach, cz = Math.sin(yaw) * reach;
      const sx = -Math.sin(yaw) * ww, sz = Math.cos(yaw) * ww;
      const c = root.map((v, i) => v + (tip[i] - v) * u);
      const a = push(cx + sx, y, cz + sz, c);
      const d = push(cx - sx, y, cz - sz, c);
      if (prev) { ix.push(prev[0], prev[1], a); ix.push(prev[1], d, a); }
      prev = [a, d];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function buildRoadsideTurf(owner, terrain, tier, dummy) {
  const trail = terrain.trail;
  /* Per square metre of the band. 1.2 is the low end of real short tussock and
   * the point at which the ground stops showing between clumps at a driver's
   * eye height. */
  /* Raised from 1.3. At that figure the clumps were distinct and the ground
   * still showed between them as bare soil, which is what "the ground
   * vegetation is far too sparse" kept meaning after the count was already
   * technically right — density that does not close the surface is just
   * scattered objects. 2.6 per square metre puts the stools close enough to
   * touch at their edges, which is what short tussock does, and there is the
   * frame budget for it: the layer lives in a 120 m corridor and the whole
   * scene was drawing at 620 fps. */
  /* Fewer than before, because these are no longer doing the job of the
   * ground cover — buildSward() lays a continuous mat underneath and these are
   * the taller stools that stand out of it, which is what a tussock flat
   * actually is. */
  const PER_M2 = tier === 'low' ? 0.30 : tier === 'medium' ? 0.55 : 0.95;
  /* Out to 60 m, not 26. A corridor that stops has a visible edge: the ground
   * went from grassland to swept dirt at a fixed distance from the road, which
   * is a line no landscape has. The band is wider than the eye can resolve
   * individual tufts at, and the placement is weighted hard toward the verge —
   * u^2 rather than u^1.45 — so the near-field density is unchanged and the
   * far half is a thinning that reads as ground rather than as an end. */
  const INNER = ROAD_SHOULDER + 1.0, OUTER = 60;
  const rng = random(0x7ee5a1);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: .97, metalness: 0,
    side: THREE.DoubleSide,
  });
  /* Wind, and a fade that hands over to the scanned ground rather than ending.
   * The tufts are 0.3-0.6 m and stop resolving well before the cull distance,
   * so they shrink into the surface instead of popping out of it. */
  const U = { uTurfTime: { value: 0 }, uTurfFade: { value: new THREE.Vector2(52, 96) } };
  mat.userData.uniforms = U;
  mat.customProgramCacheKey = () => 'lake-roadside-turf-v1';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    mat.userData.shader = sh;
    sh.vertexShader = `uniform float uTurfTime; uniform vec2 uTurfFade;\n` + sh.vertexShader
      .replace('#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, vec3(0.0,1.0,0.0), 0.62));')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.13;
        float flex = smoothstep(0.02, 0.55, position.y);
        transformed.x += sin(uTurfTime * 0.9 + ph) * 0.035 * flex * flex;
        transformed.z += cos(uTurfTime * 0.7 + ph * 1.3) * 0.022 * flex * flex;
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        float fade = 1.0 - smoothstep(uTurfFade.x, uTurfFade.y, length(cameraPosition - wp.xyz));
        transformed.y *= fade;`);
    /* Same correction as the sward — see buildSward(). Light every blade as though it faces the sky.
     *
     * These meshes are double-sided, and three flips the normal on a back
     * face — so the far side of every arched blade ends up pointing downward
     * and is lit by the hemisphere light's GROUND term, which in this level is
     * a dark olive (0x526d38). With a hundred blades to the square metre, half
     * of them facing away at any moment, that is what turned an ochre sward
     * into a carpet of dark moss: the vertex colours were never the problem.
     *
     * A blade of grass is a thin translucent strip; its two faces are not
     * meaningfully different, and every renderer that draws grass well cheats
     * the normal toward the surface it grows on for exactly this reason. */
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
       normal = normalize(mix(normal,
         normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), 0.88));`
    );
  };
  owner.materials.push(mat);

  const variants = [0, 1, 2].map((v) => tuftGeometry(v, random(0x31d0 + v * 977)));
  owner.geometries?.push?.(...variants);

  const P = new THREE.Vector3(), T = new THREE.Vector3();
  const L = trail.length;
  const CHUNK_M = 90;
  const chunks = Math.ceil(L / CHUNK_M);
  /* Sized on an effective 30 m band rather than the full 53, because the
   * squared distribution puts most of the population inside that anyway and
   * costing it on the full width would double the instance count to fill
   * ground nobody looks at closely. */
  const perMetre = PER_M2 * 30 * 2;

  for (let c = 0; c < chunks; c++) {
    const lists = [[], [], []];
    for (let m = c * CHUNK_M; m < Math.min(L, (c + 1) * CHUNK_M); m += 1) {
      trail.pointAt(m / L, P); trail.tangentAt(m / L, T);
      const nx = T.z, nz = -T.x;
      /* In clumps, not scattered. Tussock grows as discrete stools that
       * spread and merge, so the ground between two clumps is bare litter and
       * the clumps themselves touch — placing every plant independently gives
       * an even lawn of identical marks, which is the crop again. Each site
       * gets a few plants within a metre, and sites are what is random. */
      for (let site = 0; site < perMetre / 4; site++) {
        const side = rng() < .5 ? -1 : 1;
        /* Denser near the road and thinning outward, which is both what a
         * roadside verge does — it is watered by runoff — and where the
         * triangles are worth spending. */
        const o = (INNER + Math.pow(rng(), 2.0) * (OUTER - INNER)) * side;
        const sx = P.x + nx * o, sz = P.z + nz * o;
        /* One stool in three is an old one: nearly twice the size of its
         * neighbours. That spread is most of what separates grassland from
         * planting, and it costs nothing. */
        const big = rng() < .34;
        const members = 3 + ((rng() * 4) | 0);
        for (let k = 0; k < members; k++) {
          const r = Math.sqrt(rng()) * (big ? 1.15 : 0.70);
          const a = rng() * 6.283;
          const x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r;
          const y = terrain.height(x, z);
          if (y < LAKE_Y + 0.55) continue;         // not in the lake or the swash
          const s = (big ? 0.92 : 0.54) + Math.pow(rng(), 1.7) * (big ? 0.60 : 0.38);
          lists[(rng() * 3) | 0].push({ x, y, z, s, yaw: rng() * 6.283 });
        }
      }
    }
    lists.forEach((list, v) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(variants[v], mat, list.length);
      mesh.name = `flora:roadside-turf:${c}:${v}`;
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y - .02, q.z);
        dummy.rotation.set(0, q.yaw, 0);
        dummy.scale.set(q.s, q.s * (.85 + (i % 5) * .07), q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;      // 42 triangles do not earn a shadow pass
      /* Nor received. Same reason as the sward: a 20 mm blade is a quarter of
       * a shadow texel at this cascade's 83 mm resolution, so every stool came
       * back self-shadowed and the whole layer read as a dark olive mat lying
       * over the grass rather than as tussock standing in it. */
      mesh.receiveShadow = false;
      mesh.computeBoundingSphere();
      owner.root.add(mesh);
      owner.meshes.push(mesh);
    });
  }
}

function plantGeometry(id,kind,variant,hex){
 const p=[],ix=[],col=[],soft=[],floraUv=[],rng=random(0x91e3+variant*997+id.length*71);
 /* THREE.Color is already converted to linear space. Multiplying it by 3.2
  * pushed many spring greens into gamut clipping, so leaves lost their source
  * value differences and read as mint plastic under the open-sky rig. */
 const raw=new THREE.Color(hex).multiplyScalar(1.46);
 const base=[Math.min(1,raw.r),Math.min(1,raw.g),Math.min(1,raw.b)];
 const paint=(c=1)=>Array.isArray(c)?c:base.map(v=>Math.min(1,v*c));
 const vert=(q,c=1,a=1,t=[0,0])=>{const n=p.length/3;p.push(...q);col.push(...paint(c));soft.push(a);floraUv.push(...t);return n;};
 const face=(a,b,c)=>ix.push(a,b,c);
 const ribbon=(yaw,r,h,bend=.25,w=.06,c=1,segments=6,side=.1,droop=.15)=>{
  const lr=[];
  for(let k=0;k<=segments;k++){const u=k/segments,tw=yaw+side*u,reach=r+bend*(u*u*(2-u)),y=h*(u+.18*Math.sin(Math.PI*u)-droop*u*u),ww=w*Math.pow(1-u,.62),center=[Math.cos(tw)*reach,y,Math.sin(tw)*reach],s=[-Math.sin(tw)*ww,ww*.08*Math.sin(Math.PI*u),Math.cos(tw)*ww];lr.push([vert([center[0]+s[0],center[1]+s[1],center[2]+s[2]],c),vert([center[0]-s[0],center[1]-s[1],center[2]-s[2]],c)]);}
  for(let k=0;k<segments;k++){const a=lr[k],b=lr[k+1];face(a[0],a[1],b[0]);face(a[1],b[1],b[0]);}
 };
 const blade=(yaw,r,h,bend=.25,w=.06,c=1,segments=12,side=.1,droop=.15)=>{
  const rows=[];
  for(let k=0;k<=segments;k++){
   const u=k/segments,tw=yaw+side*u,reach=r+bend*(u*u*(2-u)),y=h*(u+.17*Math.sin(Math.PI*u)-droop*u*u);
   const root=u<.14?.45+.55*u/.14:1,ww=w*root*Math.pow(1-u,.58),ridge=ww*.34*Math.sin(Math.PI*u);
   const cx=Math.cos(tw)*reach,cz=Math.sin(tw)*reach,sx=-Math.sin(tw)*ww,sz=Math.cos(tw)*ww;
   rows.push([vert([cx+sx,y,cz+sz],c),vert([cx,y+ridge,cz],c),vert([cx-sx,y,cz-sz],c)]);
  }
  for(let k=0;k<segments;k++){const a=rows[k],b=rows[k+1];face(a[0],a[1],b[0]);face(a[1],b[1],b[0]);face(a[1],a[2],b[1]);face(a[2],b[2],b[1]);}
 };
 const tube=(a,b,r,c=[.22,.13,.07],sides=5,endRadius=r*.58)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A).normalize(),u=new THREE.Vector3(0,1,0);if(Math.abs(d.y)>.9)u.set(1,0,0);const s=new THREE.Vector3().crossVectors(d,u).normalize(),t=new THREE.Vector3().crossVectors(d,s).normalize(),rings=[];for(const [ri,q] of [[r,A],[endRadius,B]]){const ring=[];for(let k=0;k<sides;k++){const an=k*Math.PI*2/sides,o=s.clone().multiplyScalar(Math.cos(an)*ri).addScaledVector(t,Math.sin(an)*ri);ring.push(vert([q.x+o.x,q.y+o.y,q.z+o.z],c));}rings.push(ring);}for(let k=0;k<sides;k++){const n=(k+1)%sides;face(rings[0][k],rings[0][n],rings[1][k]);face(rings[0][n],rings[1][n],rings[1][k]);}};
 const leaf=(x,y,z,a,w=.1,h=.16,c=1,tilt=.06)=>{const f=[Math.cos(a),0,Math.sin(a)],s=[-f[2],0,f[0]],v0=vert([x-s[0]*w,y,z-s[2]*w],c),v1=vert([x+f[0]*h*.48,y+tilt,z+f[2]*h*.48],c),v2=vert([x+s[0]*w,y,z+s[2]*w],c),v3=vert([x-f[0]*h*.48,y-tilt*.25,z-f[2]*h*.48],c),vc=vert([x,y+tilt,z],c);face(v0,v1,vc);face(v1,v2,vc);face(v2,v3,vc);face(v3,v0,vc);};
 const blob=(x,y,z,rx,ry,rz,c)=>{const top=vert([x,y+ry,z],c),bottom=vert([x,y-ry,z],c),east=vert([x+rx,y,z],c),north=vert([x,y,z-rz],c),west=vert([x-rx,y,z],c),south=vert([x,y,z+rz],c),ring=[east,north,west,south];for(let k=0;k<4;k++){const n=(k+1)%4;face(top,ring[k],ring[n]);face(bottom,ring[n],ring[k]);}};
 const dome=(cx,cz,rx,rz,h,c,rings=3,sides=10,y0=0,wobble=0)=>{const v=[];v.push([vert([cx,y0+h,cz],c)]);for(let j=1;j<=rings;j++){const u=j/rings,ring=[];for(let k=0;k<sides;k++){const a=k*Math.PI*2/sides,rr=Math.sin(u*Math.PI*.5)*(1+wobble*(.62*Math.sin(k*2.17+variant)+.38*Math.sin(k*3.71+1.3)));ring.push(vert([cx+Math.cos(a)*rx*rr,y0+h*Math.cos(u*Math.PI*.5),cz+Math.sin(a)*rz*rr],c));}v.push(ring);}for(let k=0;k<sides;k++)face(v[0][0],v[1][k],v[1][(k+1)%sides]);for(let j=1;j<rings;j++)for(let k=0;k<sides;k++){const n=(k+1)%sides;face(v[j][k],v[j+1][k],v[j][n]);face(v[j][n],v[j+1][k],v[j+1][n]);}};

 if(id==='silver-tussock'||id==='red-tussock'||id==='hard-tussock'||id==='blue-tussock'){
  const n=[42,54,47][variant];
  const live=id==='red-tussock'?[.25,.43,.12]:id==='blue-tussock'?[.27,.42,.31]:id==='hard-tussock'?[.20,.39,.10]:[.30,.48,.13];
  const dead=[.28,.22,.075];
  for(let i=0;i<n;i++){const a=i*2.399+rng()*.28,isDead=i%13===variant,h=.72+rng()*.54+(variant===1?.12:0),bend=.30+rng()*.52;ribbon(a,.02+rng()*.11,h,bend,.015+rng()*.020,isDead?dead:live,10,(rng()-.5)*.42,.26+rng()*.32);}
  dome(0,0,.14,.13,.055,[.28,.20,.09],2,10);
 }
 else if(id==='matagouri'){
  const wood=[.34,.27,.16],green=[.25,.37,.18],thorn=[.52,.43,.27],tips=[];
  const n=[15,20,17][variant],squash=[1,.72,1.24][variant];
  for(let i=0;i<n;i++){const a=i*2.399+rng()*.82,root=[Math.cos(a)*(.025+rng()*.08),0,Math.sin(a)*(.025+rng()*.08)],p1=[Math.cos(a)*(.16+rng()*.17),.16+rng()*.24,Math.sin(a)*(.16+rng()*.17)*squash],turn=a+(rng()-.5)*1.18,p2=[p1[0]+Math.cos(turn)*(.24+rng()*.25),p1[1]+.14+rng()*.25,p1[2]+Math.sin(turn)*(.24+rng()*.25)*squash];tube(root,p1,.020+rng()*.010,wood,5);tube(p1,p2,.012,wood,5);tips.push(p2);for(const sign of [-1,1]){const qa=turn+sign*(.65+rng()*.55),q=[p1[0]+Math.cos(qa)*(.13+rng()*.16),p1[1]+.06+rng()*.15,p1[2]+Math.sin(qa)*(.13+rng()*.16)*squash];tube(p1,q,.008,wood,4);tips.push(q);tube(q,[q[0]+Math.cos(qa+sign*.8)*.10,q[1]-.01+rng()*.05,q[2]+Math.sin(qa+sign*.8)*.10],.0045,thorn,4,.001);}}
  for(const q of tips){const a=Math.atan2(q[2],q[0]);for(let k=0;k<2;k++)leaf(q[0],q[1]+k*.015,q[2],a+k*2.4,.027,.07,green,.018);for(const sign of [-1,1])tube(q,[q[0]+Math.cos(a+sign*1.05)*.105,q[1]+(rng()-.5)*.045,q[2]+Math.sin(a+sign*1.05)*.105],.0045,thorn,4,.001);}
 }
 else if(id==='flax'){
  const n=[15,21,18][variant];
  const half=Math.ceil(n/2);
  for(let i=0;i<n;i++){const rank=(i/2)|0,fan=i%2?Math.PI:0,a=fan+(rank/Math.max(1,half-1)-.5)*1.12+(rng()-.5)*.12,h=.82+rng()*.62,w=.065+rng()*.055,dead=i%9===variant;blade(a,.012+rng()*.045,h,.28+rng()*.38,w,dead?[.42,.27,.10]:i%5===0?[.20,.40,.19]:[.10,.29,.13],14,(rng()-.5)*.16,.10+rng()*.20);}
  for(let i=0;i<7;i++){const a=i*2.399;blade(a,.015,.24+rng()*.12,.10+rng()*.10,.035+rng()*.025,[.34,.25,.08],7,(rng()-.5)*.18,.25+rng()*.18);}
 }
 else if(id==='toetoe'){
  for(let i=0;i<26;i++){const a=i*2.399+rng()*.18,h=.72+rng()*.56;blade(a,.02,h,.32+rng()*.35,.020+rng()*.025,i%8===0?[.40,.29,.12]:[.25,.38,.17],11,(rng()-.5)*.32,.22+rng()*.26);}
  const stems=[3,5,4][variant];
  for(let i=0;i<stems;i++){
   const a=i*2.1+.3,h=1.42+rng()*.43,ph=.36+rng()*.18,y0=h-ph*.88,x=Math.cos(a)*.07,z=Math.sin(a)*.07,lean=.10+rng()*.12,lx=Math.cos(a+.8)*lean,lz=Math.sin(a+.8)*lean,b=[x+lx,h,z+lz];
   tube([x,0,z],b,.010,[.36,.31,.13],5,.005);
   /* Three crossed, gently bent cards provide parallax around the head. The
    * baked alpha carries the actual filament density and preserves it through
    * mip levels; geometry only carries the large-scale volume. */
   const pr=8,plumeWidth=.055+rng()*.016+variant*.003;
   for(let n=0;n<4;n++){
    const q=n*Math.PI/4+a*.17,side=[-Math.sin(q),Math.cos(q)],strip=[];
    for(let j=0;j<=pr;j++){
     const u=j/pr,y=y0+u*ph,cx=x+lx*(y/h),cz=z+lz*(y/h),w=plumeWidth*(.90+.10*Math.sin(u*5.3+n));
     const l=vert([cx+side[0]*w,y,cz+side[1]*w],[.92,.90,.82],.50,[0,u]);
     const r=vert([cx-side[0]*w,y,cz-side[1]*w],[.92,.90,.82],.50,[1,u]);
     strip.push([l,r]);
    }
    for(let j=0;j<pr;j++){const r0=strip[j],r1=strip[j+1];face(r0[0],r0[1],r1[0]);face(r0[1],r1[1],r1[0]);}
   }
  }
 }
 else if(id==='raoulia-cushion'||id==='raoulia-eximia'){
  const rx=[.42,.54,.48][variant],rz=[.35,.42,.50][variant];
  /* One watertight, low cushion first. Its height and perimeter share several
   * incommensurate waves, so it stays continuous without becoming a perfect
   * dome or a pile of separate beans. */
  /* 10 x 24, NOT 36 x 96, AND THE ARITHMETIC IS THE WHOLE ARGUMENT.
   *
   * A raoulia cushion is 0.42 m across. At 1280 px over a 60 degree field one
   * pixel is 0.818 mrad, so the entire plant is 26 PIXELS WIDE AT 20 m and 9
   * at 60. At 96 sides one facet of it is 1.7 px at 20 m and sub-pixel beyond
   * 34 m — the tessellation was invisible at every distance this plant is ever
   * seen from, and there is no viewpoint in the level from which it was not.
   *
   * 36 x 96 is 6,912 triangles each. The entire rally car, with its shut
   * lines, glazing, light pod and cockpit, is 23,080 — so three of these
   * ground-cover plants cost more than the car the player is driving, and
   * flora is 145 M of the lake's 166 M triangles per frame.
   *
   * 10 x 24 is 480: a 24-gon silhouette on a 26 px object, which is smooth. */
  const rings=10,sides=24,rv=[];
  rv.push([vert([0,.118,0],[.43,.48,.34])]);
  for(let j=1;j<=rings;j++){const u=j/rings,ring=[];for(let k=0;k<sides;k++){const a=k*Math.PI*2/sides,edge=1+.070*Math.sin(a*5+variant)+.040*Math.sin(a*9+1.2),r=Math.pow(u,.80)*edge,px=Math.cos(a)*rx*r,pz=Math.sin(a)*rz*r,lobes=.010*Math.sin(a*4+variant*.9)+.006*Math.sin(a*7-1.1),y=.002-.016*Math.pow(u,10)+.114*Math.pow(Math.max(0,1-u*u),.64)+lobes*(1-u*.70);ring.push(vert([px,y,pz],[.42,.47,.34]));}rv.push(ring);}
  for(let k=0;k<sides;k++)face(rv[0][0],rv[1][k],rv[1][(k+1)%sides]);for(let j=1;j<rings;j++)for(let k=0;k<sides;k++){const n=(k+1)%sides;face(rv[j][k],rv[j+1][k],rv[j][n]);face(rv[j][n],rv[j+1][k],rv[j+1][n]);}
 }
 else if(kind==='tussock'||kind==='sedge'){let n=kind==='sedge'?[18,24,29][variant]:[29,36,42][variant];for(let i=0;i<n;i++)ribbon(i*2.399+rng()*.20,i%4*.035,.54+rng()*.53,(i%3+.8)*(.11+rng()*.04),kind==='sedge'?.018:.03,i%9===0?.63:.82,6,(rng()-.5)*.34,.16+rng()*.12);}
 else if(kind==='sword'){const n=[13,18,22][variant];for(let i=0;i<n;i++)blade(i*2.399+rng()*.24,.025+rng()*.035,.66+rng()*.66,.23+rng()*.24,.050+rng()*.030,i%7===variant?[.51,.43,.20]:[.45,.51,.25],10,(rng()-.5)*.24,.13+rng()*.15);dome(0,0,.11,.10,.06,[.25,.27,.10],2,8);}
 else if(kind==='flower'){
  const petal=id==='mount-cook-buttercup'?[.98,.72,.07]:id==='gentian'?[.48,.58,.92]:id==='epineum'?[.86,.58,.38]:[.90,.94,.86];
  for(let i=0;i<15;i++)ribbon(i*.525,.03,.22+(i%3)*.04,.22,.045,[.18,.42,.10],4);
  for(let i=0;i<4;i++){let a=i*1.57,x=Math.cos(a)*.04,z=Math.sin(a)*.04,h=.46+rng()*.22;tube([x,0,z],[x,h,z],.008,[.18,.36,.09],4);for(let k=0;k<8;k++)leaf(x,h,z,k*.785,.055,.068,petal,.032);}
 }
 else if(kind==='lupin'){
  for(let i=0;i<18;i++){const a=i*2.399,r=.05+rng()*.20;leaf(Math.cos(a)*r,.16+rng()*.16,Math.sin(a)*r,a,.065,.15,[.18,.38,.12],.06);}
  const spikes=[3,4,5][variant];
  const petals=[[.43,.24,.70],[.62,.38,.78],[.34,.43,.78]];
  for(let i=0;i<spikes;i++){const a=i*2.399,h=.72+rng()*.40,x=Math.cos(a)*(.035+rng()*.08),z=Math.sin(a)*(.035+rng()*.08);tube([x,0,z],[x,h,z],.010,[.20,.34,.10],5,.005);for(let k=0;k<10;k++){const u=k/10,ring=5+(k&1);for(let j=0;j<ring;j++){const q=j*Math.PI*2/ring+k*.77,r=.045*(1-u*.64);blob(x+Math.cos(q)*r,h*.42+u*h*.54,z+Math.sin(q)*r,.025,.018,.025,petals[(i+k)%petals.length]);}}}
 }
 else {const wood=[.34,.28,.17],broad=kind==='broad',branches=broad?[7,10,13][variant]:[11,15,18][variant],spread=broad?[1.08,.82,1.22][variant]:[.82,1.10,.94][variant];for(let i=0;i<branches;i++){const a=i*2.399+(rng()-.5)*.48,h=(broad?.38:.48)+rng()*(broad?.42:.60),r=.055+rng()*(broad?.16:.11),turn=a+(rng()-.5)*.45,p1=[Math.cos(a)*r,h*(.28+rng()*.18),Math.sin(a)*r*spread],p2=[p1[0]+Math.cos(turn)*(.18+rng()*.21),h,p1[2]+Math.sin(turn)*(.18+rng()*.21)*spread];tube([Math.cos(a)*.025,0,Math.sin(a)*.025],p1,.016+rng()*.012,wood);tube(p1,p2,.008+rng()*.007,wood,4);const leaves=broad?4:5;for(let k=1;k<=leaves;k++){const u=k/(leaves+1),x=p1[0]+(p2[0]-p1[0])*u,z=p1[2]+(p2[2]-p1[2])*u;leaf(x,p1[1]+(p2[1]-p1[1])*u,z,turn+1.57+(rng()-.5)*.6,broad?.070:.042,broad?.135:.085,k%3===0?.62:.78,.025+rng()*.025);}}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setAttribute('aSoft',new THREE.Float32BufferAttribute(soft,1));g.setAttribute('aFloraUv',new THREE.Float32BufferAttribute(floraUv,2));g.setIndex(ix);g.computeVertexNormals();g.computeBoundingBox();if(id==='raoulia-cushion'){const pos=g.getAttribute('position'),uv=[],box=g.boundingBox,size=new THREE.Vector3();box.getSize(size);for(let i=0;i<pos.count;i++)uv.push((pos.getX(i)-box.min.x)/size.x,(pos.getZ(i)-box.min.z)/size.z);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}return g;
}

export class LakeFlora{
 constructor(terrain,tier='high',renderer=null,options={}){this.root=new THREE.Group();this.root.name='lake-native-flora';this.materials=[];this.textures=[];this.species=SPECIES.map(s=>s[0]);this.notable=Object.create(null);this.meshes=[];const dummy=new THREE.Object3D();this.plumeTexture=renderer?bakeImage(renderer,PLUME_FRAG,{size:512,colorSpace:THREE.SRGBColorSpace,coverageMips:.30}):null;if(this.plumeTexture)this.textures.push(this.plumeTexture);if(renderer&&options.groundCover!==false)buildGroundCover(this,terrain,renderer,dummy);
  buildSward(this,terrain,tier,dummy);
  buildRoadsideTurf(this,terrain,tier,dummy);
  buildLupinDrifts(this,terrain,tier,dummy);
  SPECIES.forEach(([id,habitat,color,kind],si)=>{const rng=random(0x51a7+si*7919),pts=[],q={},parents=[],target=Math.max(24,Math.round(POPULATION[id]*(NOTEBOOK_SPECIES.has(id)?.62:.20)*AREA_SCALE));
   /* Two orders of clustering, not one. Sixteen parents with a 6..16 m spread
    * had to hold up to 520 plants, so each was a tight blob of thirty and the
    * basin came out as a scatter of discrete islands with empty ground between
    * them — the far bank in 13-community-landward was a single rectangle of
    * shrubs with nothing either side of it. Real stands have a coarse, diffuse
    * background presence with denser thickets inside it, so a third of the
    * parents are given a 30..80 m spread to lay down that background and the
    * rest stay tight to build the thickets on top of it. */
   parents.push(...habitatParents(habitat,random(HABITAT_PARENT_SEED[habitat])));if(id==='silver-tussock')parents.unshift({z:-595,d:45,rz:8,rd:4});if(id==='snow-tussock')parents.unshift({z:-250,d:140,rz:8,rd:5});for(let tries=0;tries<160000&&pts.length<target;tries++){const parent=parents[(rng()*parents.length)|0],bell=rng()+rng()+rng()-1.5,z=THREE.MathUtils.clamp(parent.z+bell*parent.rz,BOUNDS.z1,BOUNDS.z0),d=THREE.MathUtils.clamp(parent.d+(rng()+rng()+rng()-1.5)*parent.rd,2,150),x=shoreX(z)+d,y=terrain.height(x,z);terrain.sampleField(x,z,q);if(x>BOUNDS.x1-3||q.dist<terrain.trail.widthAt(q.t)+3.5)continue;if(rng()>=habitatFit(habitat,d,z,y))continue;const spacing=id==='raoulia-cushion'||id==='raoulia-eximia'?.32:kind==='thorn'||kind==='branch'||kind==='broad'?1.05:.48;if(pts.some(p=>(p.x-x)*(p.x-x)+(p.z-z)*(p.z-z)<spacing*spacing))continue;const e=.7,dx=(terrain.height(x+e,z)-terrain.height(x-e,z))/(2*e),dz=(terrain.height(x,z+e)-terrain.height(x,z-e))/(2*e);if(Math.hypot(dx,dz)>.27)continue;const [lo,hi]=SCALE[id],age=Math.pow(rng(),.72);pts.push({x,y,z,yaw:rng()*6.283,s:THREE.MathUtils.lerp(lo,hi,age),shape:rng(),dx,dz});}
   const isCushion=id==='raoulia-cushion'||id==='raoulia-eximia';
   const bump=isCushion?cushionBump():null;
   /* Cushion bump is a height signal, not an albedo map. Binding the same
    * grayscale texture to `map` replaced every authored olive vertex colour
    * with grey and made vegetable sheep look exactly like concrete domes. */
   const mat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:isCushion?.99:.90,metalness:0,flatShading:false,side:THREE.DoubleSide,envMapIntensity:isCushion?.24:.42,alphaTest:id==='toetoe'?.20:0,alphaToCoverage:id==='toetoe',bumpMap:bump,bumpScale:bump?.65:1,transparent:false,opacity:1,depthWrite:true});
   const wind={matagouri:[.014,.72],flax:[.055,.86],toetoe:[.075,.94],'silver-tussock':[.060,1.08],'red-tussock':[.055,1.02],'snow-tussock':[.048,.96],kanuka:[.018,.70],'jointed-rush':[.040,.90],'raoulia-cushion':[.002,.50]}[id]||[.026,.82];
   /* Fine forbs and sedges hand the far field back to the meadow texture;
    * large tussocks and shrubs retain a longer silhouette range. Without this
    * scale handoff sub-pixel stems turn into a uniform field of black wires. */
   const fade=['flower','sedge','lupin'].includes(kind)?[68,118]:kind==='mat'?[82,140]:[118,188];
   const windU={uFloraTime:{value:0},uFloraWind:{value:new THREE.Vector2(...wind)},uFloraFeather:{value:id==='toetoe'?1:0},uFloraCushion:{value:isCushion?1:0},uFloraFade:{value:new THREE.Vector2(...fade)},tFloraPlume:{value:this.plumeTexture}};
   if(bump)this.textures.push(bump);
   mat.userData.uniforms=windU;
   mat.customProgramCacheKey=()=>`lake-flora-wind-v11:${id==='toetoe'?'coverage-panicle':isCushion?'wool-edge':'solid'}`;
   mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,windU);mat.userData.shader=shader;
    shader.vertexShader=`uniform float uFloraTime;uniform vec2 uFloraWind;attribute float aSoft;attribute vec2 aFloraUv;varying float vFloraSoft;varying vec3 vFloraLocal;varying vec2 vFloraUv;\n`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvFloraSoft=aSoft;vFloraLocal=position;vFloraUv=aFloraUv;float floraPhase=instanceMatrix[3].x*.173+instanceMatrix[3].z*.119;float floraFlex=smoothstep(.10,1.10,position.y);float floraSway=sin(uFloraTime*uFloraWind.y+floraPhase)*uFloraWind.x*floraFlex*floraFlex;transformed.x+=floraSway;transformed.z+=floraSway*.37;`);
    shader.fragmentShader=`uniform float uFloraFeather,uFloraCushion;uniform vec2 uFloraFade;uniform sampler2D tFloraPlume;varying float vFloraSoft;varying vec3 vFloraLocal;varying vec2 vFloraUv;float floraHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n`+shader.fragmentShader
     .replace('#include <map_fragment>',`#include <map_fragment>\nif(uFloraFeather>.5&&vFloraSoft<.9){vec4 plume=texture2D(tFloraPlume,vFloraUv);diffuseColor.rgb*=plume.rgb;diffuseColor.a*=plume.a;}\nif(uFloraCushion>.5){float wool=.5+.5*sin(vFloraLocal.x*83.0+sin(vFloraLocal.z*67.0)*2.4);float tuft=.5+.5*sin(vFloraLocal.z*119.0-vFloraLocal.x*41.0);vec2 rosetteP=vFloraLocal.xz*82.0;vec2 rosetteCell=floor(rosetteP);vec2 rosetteF=fract(rosetteP);vec2 rosetteCenter=vec2(.28+.44*floraHash(rosetteCell),.28+.44*floraHash(rosetteCell+vec2(31.7,17.3)));vec2 rosetteV=rosetteF-rosetteCenter;float rosetteD=length(rosetteV);float rosette=1.0-smoothstep(.13,.42,rosetteD);float spokes=.5+.5*sin(atan(rosetteV.y,rosetteV.x)*7.0+rosetteD*25.0);float botanical=rosette*(.60+.40*spokes);vec3 woolTint=mix(vec3(.78,.84,.70),vec3(1.08,1.03,.86),clamp(wool*.24+tuft*.12+botanical*.52,0.0,1.0));diffuseColor.rgb*=woolTint;}`)
     .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>\nfloat floraFade=1.0-smoothstep(uFloraFade.x,uFloraFade.y,length(vViewPosition));if(floraHash(gl_FragCoord.xy)>floraFade)discard;`);
   };
   this.materials.push(mat);this.notable[id]=pts.map(q=>{const v=new THREE.Vector3(q.x,q.y,q.z);v.plantScale=q.s;return v;});
   /* Geographic chunks are the culling unit, not a geometry variant. The old
    * one-mesh-per-chunk layout accidentally made every plant of a species in
    * 240 m of shore share exactly the same silhouette. Keep all three authored
    * variants in every chunk and assign them deterministically per instance;
    * this adds small draw groups but does not add a single plant or triangle. */
   for(let chunk=0;chunk<3;chunk++){
    const z0=THREE.MathUtils.lerp(BOUNDS.z0,BOUNDS.z1,chunk/3),z1=THREE.MathUtils.lerp(BOUNDS.z0,BOUNDS.z1,(chunk+1)/3);
    for(let variant=0;variant<3;variant++){
     const list=pts.filter(q=>q.z<=z0&&q.z>=z1&&Math.min(2,Math.floor(q.shape*3))===variant);
     const geo=plantGeometry(id,kind,variant,color),mesh=new THREE.InstancedMesh(geo,mat,list.length),tint=new THREE.Color();
     mesh.name=`flora:${id}:chunk-${chunk}:variant-${variant}`;
     list.forEach((q,i)=>{
      dummy.position.set(q.x,q.y+(isCushion?-.036:-.030),q.z);
      dummy.rotation.set(Math.atan(THREE.MathUtils.clamp(q.dz,-.26,.26)),q.yaw,-Math.atan(THREE.MathUtils.clamp(q.dx,-.26,.26)));
      dummy.scale.set(q.s*(.72+q.shape*.55),q.s,q.s*(.75+((q.shape*7.13)%1)*.50));
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      const tone=.84+((q.shape*11.71)%1)*.25;
      tint.setRGB(tone*(.96+((q.shape*5.3)%1)*.06),tone,tone*(.93+((q.shape*3.7)%1)*.08));
      mesh.setColorAt(i,tint);
     });
     mesh.instanceMatrix.needsUpdate=true;
     if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
     mesh.castShadow=['thorn','branch','broad','tussock','sword','plume','mat'].includes(kind);
     mesh.receiveShadow=true;mesh.computeBoundingSphere();this.root.add(mesh);this.meshes.push(mesh);
    }
   }
  });this.setTier(tier);}
 /* SWARD DRAW DISTANCE: 120 m, WAS 260. Measured, not guessed.
 *
 * Sweeping the radius and diffing the frame against the 260 m reference at two
 * stations:
 *
 *     radius   frame changes   time saved
 *      200 m       0.01%        4.7-6.4 ms
 *      160 m       0.01%        5.6-8.5 ms
 *      120 m     0.02-0.05%     8.8-12.8 ms
 *       90 m     0.02-0.05%    11.1-20.0 ms
 *
 * Grass beyond about a hundred metres is not visible — a sub-metre crown is
 * roughly a pixel at that range, and the ground texture underneath already
 * reads as grass, which is what it is for. The level was drawing it anyway,
 * and flora was 145 M of the lake's 166 M triangles per frame.
 *
 * 120 rather than 90 even though 90 measured equally invisible: two stations
 * under one condition is not the whole stage, and a 2x margin under the point
 * where a difference first appears is cheap insurance for the sun angles and
 * viewpoints that were not sampled. */
  cullAround(x,z){this.lastCull=[x,z];this.meshes.forEach(m=>{const c=m.boundingSphere?.center,near=!c||Math.hypot(c.x-x,c.z-z)<120+(m.boundingSphere?.radius||0),matches=m.name.startsWith(`flora:${this.debugSpecies}:`);m.visible=this.debugSpecies?matches:near;});}
 setDebug(mode='none'){this.debugSpecies=this.species.includes(mode)?mode:null;if(this.lastCull)this.cullAround(...this.lastCull);}
 /* Materials no longer share one uniform name — the roadside turf has its own
  * wind. Written defensively rather than by branching on the material, because
  * this list is appended to from four different builders. */
 /* Specular antialiasing on every flora material — see render/specularAA.js.
  * Applied here, over the whole list, rather than at each of the five places a
  * material is made: they are built by different helpers and a new species
  * added later would otherwise sparkle on its own. */
 applySpecularAA(){this.materials.forEach(m=>addSpecularAA(m,'lake-flora'));return this;}
 update(time){this.materials.forEach(m=>{const u=m.userData.uniforms;if(!u)return;
   if(u.uFloraTime)u.uFloraTime.value=time; if(u.uTurfTime)u.uTurfTime.value=time;});}
 setTier(t){this.tier=t;this.meshes.forEach(m=>m.count=t==='low'?Math.ceil(m.instanceMatrix.count*.55):m.instanceMatrix.count);}
 stats(){return{species:this.species.length,speciesIds:[...this.species],instances:this.meshes.reduce((n,m)=>n+m.count,0),notable:Object.keys(this.notable).length,chunks:this.meshes.length};}
 dispose(){const geos=new Set(this.meshes.map(m=>m.geometry));geos.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}
