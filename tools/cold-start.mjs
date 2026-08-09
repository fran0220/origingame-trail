/* Sequential fresh-context cold starts; never retries a bad first frame. */
import { chromium } from 'playwright';
import { serve } from './harness.mjs';
const runs=Number(process.env.COLD_START_RUNS||3);
const levels=(process.env.COLD_START_LEVELS||'jungle,lake').split(',').map(x=>x.trim()).filter(Boolean);
const server=serve();await new Promise(r=>server.listen(0,r));const base=`http://localhost:${server.address().port}/`;
const browser=await chromium.launch({headless:true,args:['--ignore-gpu-blocklist','--enable-webgl']});
try {
 for(const level of levels)for(let n=1;n<=runs;n++){
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}#manual&level=${level}`,{waitUntil:'domcontentloaded',timeout:300_000});
  await page.waitForFunction(()=>!!window.__game,null,{timeout:300_000});
  const r=await page.evaluate(()=>({info:window.__game.info(),probe:window.__game.probe()}));
  const {calls,triangles,programs}=r.info,{median,blackPct,blownPct}=r.probe;
  console.log(`${level} ${n}/${runs}: programs=${programs} calls=${calls} tris=${triangles} median=${median} black=${blackPct}%`);
  if(errors.length||calls<=1||triangles<=0||median<=.015||median>=.985||blackPct>65||blownPct>65)throw new Error(`EMPTY FRAME / abnormal cold start ${level} #${n}: ${JSON.stringify({calls,triangles,median,blackPct,blownPct,errors})}`);
  await context.close();
 }
 console.log(`ok — ${levels.length*runs} sequential cold starts`);
} finally {await browser.close();server.close();}
