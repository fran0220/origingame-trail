import * as THREE from 'three';
import { BOUNDS, shoreX } from './basin.js';
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
 vec3 col=mix(vec3(.045,.17,.028),vec3(.19,.31,.065),tint*.44+.14);
 col*=.76+.22*vUv.y;
 gl_FragColor=vec4(col,alpha);
}`;

/* Mackenzie suite: the twelve natives that write the field notebook, plus
 * three extra habitat fillers so a single terrace / fan / shore no longer
 * collapses to one silhouette class. Assets stay procedural and habitat-bound. */
export const SPECIES=[
 /* Tussock / grass floor */
 ['silver-tussock','terrace',0x5f8b36,'tussock'],
 ['snow-tussock','leeward',0x63833b,'tussock'],
 ['red-tussock','wetland',0x587d32,'tussock'],
 ['hard-tussock','terrace',0x4d752d,'tussock'],
 ['blue-tussock','leeward',0x55775c,'tussock'],
 /* Woody shrubs */
 ['matagouri','fan',0x46533b,'thorn'],
 ['manuka','terrace',0x3d603d,'branch'],
 ['kanuka','terrace',0x4a6a3d,'branch'],
 ['hebe','leeward',0x55774f,'broad'],
 ['hebe-odora','terrace',0x4f6d4a,'broad'],
 ['coprosma','fan',0x5d6d3d,'broad'],
 ['coprosma-propinqua','fan',0x51623a,'broad'],
 ['ozothamnus','leeward',0x6b7350,'branch'],
 ['dracophyllum','leeward',0x4a5c38,'sword'],
 /* Wetland / shore */
 ['flax','wetland',0x365c3b,'sword'],
 ['toetoe','wetland',0xb8a66c,'plume'],
 ['sedge','shore',0x71834b,'sedge'],
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
const POPULATION={
 'silver-tussock':1100,'snow-tussock':900,'red-tussock':480,'hard-tussock':620,'blue-tussock':540,
 matagouri:560,manuka:420,kanuka:360,hebe:520,'hebe-odora':380,
 flax:460,toetoe:400,'raoulia-cushion':700,'raoulia-eximia':420,
 coprosma:440,'coprosma-propinqua':360,ozothamnus:320,dracophyllum:280,
 sedge:1000,'jointed-rush':480,carex:520,
 speargrass:660,acus:360,celmisia:860,gentian:420,ourisia:360,anisotome:300,epineum:280,
 'mount-cook-buttercup':520,'south-island-daisy':460,'russell-lupin':240,
};
/* Native identity and vegetation mass are separate jobs. Scanned habitat now
 * carries the latter; asking thirty-one bespoke procedural species to carry it
 * as well covered every calm gap with bright low-poly silhouettes. Keep enough
 * of each species to make the biome genuinely diverse, and a larger searchable
 * population for the five notebook subjects, without using them as filler. */
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
  const U={uFloraTime:{value:0},uFloraWind:{value:new THREE.Vector2(...wind)},uFloraFeather:{value:0},uFloraCushion:{value:0},uCoverFade:{value:new THREE.Vector2(44,102)}};
  mat.userData.uniforms=U;mat.customProgramCacheKey=()=>key;
  mat.onBeforeCompile=shader=>{Object.assign(shader.uniforms,U);mat.userData.shader=shader;shader.vertexShader=`uniform float uFloraTime;uniform vec2 uFloraWind;varying float vAlpineDry;\n`+shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\nobjectNormal=normalize(mix(objectNormal,vec3(0.0,1.0,0.0),.86));`).replace('#include <begin_vertex>',`#include <begin_vertex>\nfloat ix=instanceMatrix[3].x,iz=instanceMatrix[3].z;float ph=ix*.13+iz*.17;vAlpineDry=clamp(.5+.34*sin(ix*.013+iz*.007+sin(iz*.009)*1.7)+.16*sin(iz*.031-ix*.004),0.0,1.0);float flex=smoothstep(.02,.58,position.y);transformed.x+=sin(uFloraTime*uFloraWind.y+ph)*uFloraWind.x*flex*flex;`);shader.fragmentShader=`varying float vAlpineDry;uniform vec2 uCoverFade;float coverHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n`+shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP\nvec4 sampledDiffuseColor=texture2D(map,vMapUv);\ndiffuseColor*=sampledDiffuseColor;\nfloat dry=smoothstep(.58,.94,vAlpineDry);\nvec3 alpineBlade=mix(vec3(.07,.22,.04),vec3(.22,.31,.08),dry*.24);\ndiffuseColor.rgb*=mix(vec3(1.0),alpineBlade,.28);\n#endif`).replace('#include <alphatest_fragment>',`#include <alphatest_fragment>\nfloat coverFade=1.0-smoothstep(uCoverFade.x,uCoverFade.y,length(vViewPosition));\nif(coverHash(gl_FragCoord.xy)>coverFade)discard;`).replace('#include <lights_fragment_begin>',`#include <lights_fragment_begin>\nfloat back=max(0.0,dot(normalize(vViewPosition),-geometryNormal));reflectedLight.directDiffuse+=diffuseColor.rgb*back*.055;reflectedLight.indirectDiffuse+=diffuseColor.rgb*.22;`);};
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
    const jz=z+(rng()-.5)*step*.92,jd=d+(rng()-.5)*step*.92;
    const x=shoreX(jz)+jd;if(x>BOUNDS.x1-2)continue;
    terrain.sampleField(x,jz,q);
    /* Hard path only — no multi-metre mown verge. */
    if(q.dist<terrain.trail.widthAt(q.t)+1.1)continue;
    const mass=.5+.5*Math.sin(x*.037+jz*.023+1.4*Math.sin(jz*.009));
    const shore=THREE.MathUtils.smoothstep(d,2.4,11);
    /* Occasional wind-scald keeps the carpet from looking stamped. */
    const scald=.18*Math.max(0,Math.sin(x*.019+jz*.014)-.55);
    const keep=(keepBase+.16*mass-scald)*shore;
    if(rng()>keep)continue;
    const y=terrain.height(x,jz);
    const e=.7,dx=(terrain.height(x+e,jz)-terrain.height(x-e,jz))/(2*e),dz=(terrain.height(x,jz+e)-terrain.height(x,jz-e))/(2*e);
    if(Math.hypot(dx,dz)>.40)continue;
    list.push({x,y,z:jz,s:THREE.MathUtils.lerp(sizeLo,sizeHi,Math.pow(rng(),.55)),yaw:rng()*6.283,t:rng()});
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
 /* Fine enough to overlap at eye height, low enough not to become a crop. */
 placeLayer('sward',geoSward,matSward,.34,1.8,154,.46,.82,.95,false);
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
  const rings=36,sides=96,rv=[];
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
  SPECIES.forEach(([id,habitat,color,kind],si)=>{const rng=random(0x51a7+si*7919),pts=[],q={},parents=[],target=Math.max(18,Math.round(POPULATION[id]*(NOTEBOOK_SPECIES.has(id)?.34:.06)));
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
 cullAround(x,z){this.lastCull=[x,z];this.meshes.forEach(m=>{const c=m.boundingSphere?.center,near=!c||Math.hypot(c.x-x,c.z-z)<260+(m.boundingSphere?.radius||0),matches=m.name.startsWith(`flora:${this.debugSpecies}:`);m.visible=this.debugSpecies?matches:near;});}
 setDebug(mode='none'){this.debugSpecies=this.species.includes(mode)?mode:null;if(this.lastCull)this.cullAround(...this.lastCull);}
 update(time){this.materials.forEach(m=>{m.userData.uniforms.uFloraTime.value=time;});}
 setTier(t){this.tier=t;this.meshes.forEach(m=>m.count=t==='low'?Math.ceil(m.instanceMatrix.count*.55):m.instanceMatrix.count);}
 stats(){return{species:this.species.length,speciesIds:[...this.species],instances:this.meshes.reduce((n,m)=>n+m.count,0),notable:Object.keys(this.notable).length,chunks:this.meshes.length};}
 dispose(){const geos=new Set(this.meshes.map(m=>m.geometry));geos.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}
