/* Persistent structural and photographic reachability truth for Lake Tekapo. */
import { run } from './harness.mjs';

const MIN_QUALITY = 0.28;

await run({ hash: 'manual&level=lake', timeout: 300_000 }, async ({ page, errs }) => {
  const report = await page.evaluate(({ minQuality }) => {
    const g = window.__game, THREE = window.THREE, level = g.level;
    const finite = (v) => v && [v.x, v.y, v.z].every(Number.isFinite);
    const content = g.session.content, photo = g.session.photo;
    const before = level.fauna.entities.map(e => e.position.clone());
    for (let i = 0; i < 120; i++) g.step(1 / 60);
    /* Ambient packs are not photo anchors. Only notebook notables (one per
     * species in fauna.notable) must keep position/focus identity with photo. */
    const fauna = level.fauna.entities.map((e, i) => {
      const isNote = level.fauna.notable[e.species] === e;
      const sub = photo.byId(e.species);
      return {
        id: e.id, species: e.species, moved: e.position.distanceTo(before[i]),
        isNote,
        positionRef: !isNote || !sub || sub.position === e.position,
        focusRef: !isNote || !sub || sub.focus === e.focus,
      };
    });

    const shores = [-560, -430, -300, -170, -40].map(z => {
      const sx = g.levelModule.shoreX(z), dry = g.terrain.depthAt(sx + 8, z), wet = g.terrain.depthAt(sx - 8, z);
      return { z, sx, dry, wet, lakeY: g.levelModule.LAKE_Y };
    });
    const floraClear = Object.values(level.notable).every(points => points.every(p => {
      const q = g.terrain.sampleField(p.x, p.z, {});
      return q.dist >= g.trail.widthAt(q.t) + 3.4;
    }));
    g.goTo(.1); g.step(0);
    const cullStart = level.veg.meshes.filter(m => m.visible).map(m => m.name);
    g.goTo(.8); g.step(0);
    const cullEnd = level.veg.meshes.filter(m => m.visible).map(m => m.name);
    const route = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, p = g.trail.pointAt(t, new THREE.Vector3());
      g.walker.placeAt(t);
      route.push({ t, x:p.x, z:p.z, y:g.terrain.height(p.x,p.z), depth:g.terrain.depthAt(g.walker.pos.x,g.walker.pos.z) });
    }

    photo.setRaised(true); photo.zoom = 1;
    g.camera.fov = 34; g.camera.updateProjectionMatrix();
    const results = [];
    for (const s of photo.subjects) {
      const far = s.id === 'aoraki' || s.id === 'alps-layers';
      const candidates = [];
      if (far) {
        for (let i = 0; i <= 40; i++) {
          const p = g.trail.pointAt(i / 40, new THREE.Vector3());
          candidates.push({ x:p.x, z:p.z, type:`route:${(i/40).toFixed(3)}` });
        }
      } else {
        const ideal = photo.idealDistanceFor(s), lo=s.range[0], hi=s.range[1];
        const radii = [ideal, Math.max(lo+.05, ideal*.7), Math.min(hi-.05, ideal*1.35), (lo+hi)/2];
        for (const r of radii) for (let i=0;i<32;i++) {
          const a=i*Math.PI*2/32;
          candidates.push({x:s.focus.x+Math.cos(a)*r,z:s.focus.z+Math.sin(a)*r,type:`dry-ring:${r.toFixed(1)}`});
        }
      }
      let best={quality:0,distance:0,type:'none'};
      for (const c of candidates) {
        const y=g.terrain.height(c.x,c.z), d=g.terrain.depthAt(c.x,c.z), e=.6;
        const slope=Math.hypot(g.terrain.height(c.x+e,c.z)-g.terrain.height(c.x-e,c.z),g.terrain.height(c.x,c.z+e)-g.terrain.height(c.x,c.z-e))/(2*e);
        if (!Number.isFinite(y) || d !== 0 || slope > .5) continue;
        g.camera.position.set(c.x,y+1.68,c.z); g.camera.lookAt(s.focus); g.camera.updateMatrixWorld();
        photo.update(0);
        if (photo.target?.id === s.id && photo.quality > best.quality) best={quality:photo.quality,distance:photo.distance,type:c.type};
      }
      results.push({id:s.id,...best});
    }
    return {
      meta:g.levelModule.meta, glyphs:content.GLYPHS.length, subjects:content.SUBJECTS.map(s=>s.id),
      flora:Object.entries(level.notable).map(([id,pts])=>({id,count:pts.length,finite:pts.every(finite)})),
      floraClear, cullStart, cullEnd, fauna, water:level.water.stats(), shores, route, results,
    };
  }, { minQuality: MIN_QUALITY });

  const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
  assert(report.meta.id === 'lake', `meta id ${report.meta.id}`);
  assert(report.glyphs === 0, `GLYPHS=${report.glyphs}`);
  assert(report.subjects.length === 20 && new Set(report.subjects).size === 20, 'SUBJECTS must be 20 unique ids');
  assert(report.flora.length >= 12 && report.flora.every(x=>x.count>0&&x.finite), `flora notables invalid (${report.flora.length})`);
  assert(report.floraClear, 'flora intrudes into the trail clearance');
  assert(report.cullStart.length > 0 && report.cullEnd.length > 0
    && report.cullStart.join() !== report.cullEnd.join(), 'flora culling did not follow the camera');
  /* Ambient packs grow freely; notebook subjects remain the eight original
   * stable ids (photo.byId anchors). Accept any count ≥ 8. */
  assert(report.fauna.length >= 8, `fauna entities ${report.fauna.length}`);
  assert(report.fauna.every(x=>x.moved>0&&x.positionRef&&x.focusRef), 'fauna did not move or photo anchors lost entity references');
  assert(report.water.triangles > 1000, `water triangles=${report.water.triangles}`);
  assert(report.shores.every(x=>x.dry===0&&x.wet>0&&x.lakeY===0), 'shore dry/wet or LAKE_Y truth failed');
  assert(report.route.every(x=>[x.x,x.y,x.z].every(Number.isFinite)&&x.depth===0), 'route/walker is non-finite or wet');
  console.table(report.results.map(x=>({id:x.id,quality:+x.quality.toFixed(3),distance:+x.distance.toFixed(1),candidate:x.type})));
  const failed=report.results.filter(x=>x.quality<MIN_QUALITY);
  assert(!failed.length, `unreachable subjects: ${failed.map(x=>`${x.id}=${x.quality.toFixed(3)}`).join(', ')}`);
  assert(!errs.length, `${errs.length} browser error(s)`);
  console.log(`ok — 20/20 reachable; flora=${report.flora.length} fauna=${report.fauna.length} water=${report.water.triangles} tris shores=${report.shores.length} route=${report.route.length}`);
});
