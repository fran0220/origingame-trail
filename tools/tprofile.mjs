/* The Crossing's topology, measured before any of it is drawn.
 *
 * The whole argument for a third level is that it has relief the other two
 * cannot have. Probing the existing levels for a point where the ground falls
 * away on BOTH sides of the path found 1.14 m on the lake and 0.23 m of notch
 * on the jungle walk, and two set-pieces were abandoned because of it. This
 * reports the same number for Tongariro, plus the elevation profile and the
 * per-stage cross-section, straight off the height function.
 *
 * Run it before building anything on top: if the ridge stops reading as a
 * ridge in this table it will not read as one on screen either.
 *
 *   node tools/tprofile.mjs
 */

import { trackElevation, STAGES, stageAt } from '../src/levels/tongariro/route.js';
import { elevation } from '../src/levels/tongariro/terrain.js';
/* Walk the route as a straight-ish line for measurement: the topology claim is
 * about the cross-section, which does not depend on the plan curve. */
const rows=[];
let maxBoth=0, maxBothT=0;
for(let k=0;k<=400;k++){
  const t=k/400;
  const z=30-910*t, x=0;
  const on=elevation(x,z,t,0);
  /* How far does the ground fall away on BOTH sides within 60 m? */
  let dl=0, dr=0;
  for(const d of [5,10,18,28,40,55]){
    dl=Math.max(dl, on-elevation(x+d,z,t,+d));
    dr=Math.max(dr, on-elevation(x-d,z,t,-d));
  }
  const both=Math.min(dl,dr);
  if(both>maxBoth){maxBoth=both; maxBothT=t;}
  if(k%25===0) rows.push({t:+t.toFixed(2), stage:stageAt(t), elev:Math.round(trackElevation(t)),
                          fallL:+dl.toFixed(1), fallR:+dr.toFixed(1), both:+both.toFixed(1)});
}
console.log(JSON.stringify({rows, maxBoth:+maxBoth.toFixed(1), maxBothT:+maxBothT.toFixed(3)}));
