/* Real-browser picker, deep-link and flush-before-navigation contract. */
import { chromium } from 'playwright';
import { serve } from './harness.mjs';

const server=serve(); await new Promise(r=>server.listen(0,r));
const base=`http://localhost:${server.address().port}/`;
/* The same ANGLE flags every other tool in here launches with, and the reason
 * is not speed for its own sake.
 *
 * This file was the one probe that took the default, which on a headless
 * Chromium means SwiftShader — a software rasteriser. What it is testing is
 * the picker, deep links and the save's flush-before-navigate contract, none
 * of which involve the GPU at all; what it was *paying* for was building the
 * heaviest level in the game twice, in software, with a third world still
 * resident in another tab. Lake alone takes 75 s to boot that way against
 * 13 s for Jungle, and the margin against the 300 s wait was luck rather than
 * design — it is a level that is expected to keep growing, so the test would
 * have failed eventually on a change that had nothing to do with it. */
const browser=await chromium.launch({headless:true,args:[
  '--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader','--ignore-gpu-blocklist',
]});
const context=await browser.newContext(); const errors=[];
const wire=p=>{p.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));p.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`);});};
try {
  const picker=await context.newPage(); wire(picker); await picker.goto(base);
  const buttons=picker.locator('#levelPicker button');
  if(await buttons.count()!==2) throw new Error('bare picker does not have exactly two buttons');
  for(let i=0;i<2;i++){await buttons.nth(i).focus();if(!await buttons.nth(i).evaluate(e=>e===document.activeElement))throw new Error('picker button not focusable');}
  await buttons.filter({hasText:'Lake Tekapo'}).click();
  await picker.waitForFunction(()=>!!window.__game,null,{timeout:300_000});
  if(!picker.url().includes('level=lake')||await picker.evaluate(()=>window.__game.levelModule.meta.id)!=='lake')throw new Error('Lake selection mismatch');
  for(const id of ['jungle','lake']){const p=await context.newPage();wire(p);await p.goto(`${base}#manual&level=${id}`);await p.waitForFunction(()=>!!window.__game,null,{timeout:300_000});if(await p.locator('#levelPicker').count())throw new Error(`${id} deep link did not bypass picker`);await p.close();}
  const record=await picker.evaluate(()=>{const s=window.__game.session.state,id=window.__game.session.content.SUBJECTS[0].id;s.addPhoto(id,.777,null);return id;});
  await picker.evaluate(()=>window.__game.hud.setPaused(true));
  await Promise.all([picker.waitForURL(u=>!u.hash,{timeout:60_000}),picker.locator('#pauseLevels').click()]);
  await picker.waitForSelector('#levelPicker:not([hidden])');
  const saved=await picker.evaluate(()=>JSON.parse(localStorage.getItem('jungle-trail/save/v2')||localStorage.getItem('jungle-trail/save')||'null'));
  // Browser platform storage key is implementation-owned; discover the v2 save if needed.
  const actual=saved||await picker.evaluate(()=>Object.values(localStorage).map(v=>{try{return JSON.parse(v)}catch{return null}}).find(v=>v?.v===2));
  if(actual?.levels?.lake?.photos?.[record]!==.777)throw new Error('Lake photo was not flushed before picker navigation');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(`ok — 2 focusable buttons; Lake select/deep links; flushed ${record} before reload`);
} finally {await browser.close();server.close();}
