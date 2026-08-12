# Lessons

## A reflection sampled by the wrong size is a decal

- `gl_FragCoord / textureSize(tMirror)` is only correct when the target is
  the same size as the drawing buffer. A 1600×900 frame over a 384² target
  puts every lake pixel past 1; `clamp` then paints one texel across the
  whole surface. That can still *look* like a mountain if the edge texel
  happens to be snow.
- Pass `renderer.getDrawingBufferSize()` and build the target at the camera
  aspect. Recapture on camera motion, not on a fixed cadence that still
  pays the pass when the car is parked.

## A landmark behind the shoulder is scenery

- Karangahake's stamp battery sat 4.6 m off a bend at t=0.70. Default
  cameras at 0.62–0.70 never framed it. Measuring the bounding box from
  the live scene, then placing the machine 1.7 m off t=0.675, is what
  put rust in the walk.
- `hardGround` does not apply to authored verge plants or to canopy
  scatter. A dedicated hole *and* an up-trail corridor are required or
  the machine sits inside a wall of ponga.

## Do not strip the summit to expose the mid-range

- One snow-break term on every layer turned Aoraki into grey rock. Hold
  more snow on the far massif (`uLayer`) and let the foothills show
  ribs. A white pyramid with dark shoulders is the postcard; a grey
  pyramid is a different mountain.

## Ten thousand rocks will not un-lawn a valley

- 1800 extra blocks/km² on Mangatepopo dropped Tongariro to 25 fps and
  still left a green mid-ground. The lawn is the ash splat plus tussock
  density. Paint lava tongues in `evalChannels` and thin the red tussock
  stand; keep only a handful of person-scale slabs.



## Visual acceptance is not render correctness

- Do not call a scene visually complete because black frames, moiré, culling bugs, or unreachable content are fixed. Those checks certify rendering and gameplay correctness only.
- Track each visual system separately as prototype, production-ready, or polished. Lake Pukaki's mountains, water, flora, and fauna remain prototypes until reference-based fixed-view reviews accept their form, material response, composition, and close-range detail.
- A visual gate must compare fixed authored views against explicit reference qualities and reject generic primitives, repeated silhouettes, flat materials, and empty composition. Numeric truth tests remain necessary but cannot overrule a failed screenshot review.
- Require two consecutive image-only reviews with no blocking defect before advancing a system, and record refuted attempts in `docs/experiments.md`.

## Object-level polish cannot repair the wrong biome

- Before spending another round on hero-species topology, review the complete frame at thumbnail size against real-location photography. Palette, ground cover, vegetation massing, atmospheric contrast, and material response must already identify the biome without relying on a close-up.
- If the full frame reads as a different biome (for example, a pale sparse desert instead of Lake Pukaki high-country grassland), freeze micro-detail work. Rebuild the terrain/ground-cover/lighting hierarchy first; better individual plants only make the wrong direction more expensive.
- Per-system image gates can create tunnel vision. Add an overall photographic gate after every two local rounds, and reject a local “pass” when its integration makes the complete scene less plausible.
- Procedural nouns are not photographic materials. If photo-quality is the target, prefer scanned CC0 PBR ground data and botanically credible production assets over adding more primitives or shader noise merely to preserve an all-procedural implementation claim.

## A parameter that means two things is a bug with no symptoms

- `Trail.nearest()` returned normalised arc length while `Trail.pointAt()` consumed its
  argument as a fraction of the sample index. Both were called `t`. On the lakeshore
  alignment they differ by up to 0.03, which is 23 m of road.
- It survived indefinitely because every existing consumer was smooth in `t`: scatter rules
  and a walking track do not care whether a bush is 23 m further along. It became visible
  the instant two *different* systems used the two different meanings to describe one
  surface — a road mesh placed with `pointAt()` on ground carved with `nearest()` floated
  1.34 m over its own formation.
- Test for agreement between systems, not for plausibility within one. `road-truth.mjs`
  compares the seal's design surface against the terrain underneath it, because a floating
  road and an embankment are identical from the driving position.
- When such a fix "breaks" content, suspect the content was compensating. Correcting the
  parameterisation swung a tablet round to face the pool it addresses and revealed that a
  reader would have to stand 2.9 m below it, under water. The placement was always wrong;
  the bug was hiding it.

## Screen-space footprint, not camera distance, is what decides detail

- Procedural surface detail has no mip chain, so it must be faded by hand. Fading it on
  distance is wrong on any surface seen at a grazing angle: a road fifteen metres ahead of
  a windscreen is at a few degrees of incidence, so one pixel covers centimetres across and
  a third of a metre along, while `distance()` still says "near, keep full detail".
- The result is not a texture, it is an aliasing artefact of one — a comb pattern running up
  the middle of every driving frame.
- `fwidth()` of world position answers it directly and collapses correctly for distance and
  incidence at once. Use the geometric mean of the two derivatives, which is what an
  anisotropic filter with a capped ratio actually resolves; the larger derivative alone
  over-blurs and leaves the near surface completely smooth.
- Albedo fades to its mean, normals must fade sooner and harder — an unresolved normal does
  not average to its mean, it averages to a random direction per pixel, which is sparkle.

## Judge a vehicle from the view that ships, and let the reviewer see its own output

- A car is the one object on screen for the entire level, and it cannot be reviewed from
  scenery stations: fixed-view tools leave the physics body parked on the lens.
- Two tools were needed and neither is optional — a turntable of the car at the size the
  player sees it, and a gallery shot from the real chase camera after actually driving
  there, because a chase camera is a filter with seconds of memory and a teleported camera
  is not the one the player would have had.
- A first pass produced a credible triangle count, an honest material list and a bar of
  soap with detached horseshoe blisters around the wheels. Neither `node --check` nor a
  triangle budget can see that. Give the agent doing the work the render-and-look loop.

## Physics is validated by the shape of its trade-offs, not by a number

- `drive-truth.mjs` drives the stage through the real input path. Told to attack, the same
  controller ran 32% of frames off the road and finished in 52.8 s; told to be smooth, with
  a *lower* top speed, it ran 7.4% off and finished in 42.7 s.
- Overdriving being ten seconds slower is the assertion worth keeping, because it is the
  signature of a tyre that saturates. Pinning the stage time to a constant would fail on
  every tune and prove nothing.

## When a scene looks bare, suspect the fade before adding geometry

- The Lake near field read as a photograph of grass painted on a smooth surface, and the
  obvious response — put a card grass layer over it — was tried three times and refuted
  three times. The detail was already authored; the shader was throwing it away.
- `farDetail` faded the ground's scanned taps on *camera distance*. On a basin seen at a
  shallow angle from a car, distance is a poor proxy for footprint: a hillside 40 m across
  the valley resolves far more than the verge 25 m ahead down the road. Most of the frame
  was losing texture it could still show.
- Same correction as the road's chipseal, for the same reason: fade on `fwidth()` of world
  position, geometric mean of the two derivatives, with distance kept only as a far
  backstop. No geometry added, and the reason for wanting the grass layer disappeared.
- Generalisation: before adding a system to fix an appearance, check whether an existing
  system is suppressing what you are about to duplicate.

## A refutation is only useful if it names the right variable

- Card ground cover had been rejected twice for becoming "wires or a crop at landscape
  scale". Both are failures of *distance*, so restricting it to 34 m should have worked —
  and it did fix both named failures, and still did not read as cover.
- The real limit was never distance: a two-triangle card at 0.3 m cannot be a tussock sward
  at any density that also looks like one. Dense enough to close the ground it is a crop;
  sparse enough not to be, it is speckle — and speckle the same value as the ground is
  indistinguishable from the stones already on it.
- Record the variable the refutation actually constrains, or the next attempt will "fix"
  the stated reason and rediscover the real one.

## Symmetric-looking geometry fixes are not always symmetric

- Raising a superellipse section exponent turned the car's tail into a stamped tailgate,
  because holding near-full width at a high exponent puts all the closing into a 45 mm cap.
- The identical change applied to the nose made it worse. A higher exponent is a *fuller*
  section, and a fuller section on a front end that must still fall from bonnet to bumper
  while narrowing is a bigger dome, which swallowed the lamps and grille.
- A tailgate is a panel standing across the end of the car; a nose is a surface closing over
  an overhang. Check whether the two ends of a thing are actually the same problem before
  applying one answer to both, and record the asymmetry where the numbers live.

## Albedo authored for one state, applied to all of them

- Shore cobbles carried 0.06-0.13 linear and erratics 0.14-0.26 — the values of *wet* stone
  in shade — applied to every stone whether the swash reached it or not. Under a 0.50
  exposure that is not "dark rock", it is a hole, and the beach read as litter on sand.
- The wet band at the waterline was correct the whole time and simply had nothing to be
  darker than. Fixing the dry state made the already-working wet state visible.
- When a material looks wrong, check which of its states the constant was measured in.

## A test that shares the code's frame will agree with the code's bug

- `control-truth.mjs` was written specifically to catch reversed steering. It asserted "D
  moves the car toward its right", computed the car's right as `(cos yaw, -sin yaw)`, and
  passed — while D steered left on screen. That expression is the car's *left*: in a
  right-handed Y-up frame an object facing +Z has its right at −X. The test and the code
  shared the mirrored convention, so they agreed perfectly with each other and with nothing
  else.
- The autopilots hid it a second time and independently: they steered on a heading error
  with the matching mirrored mapping, so two faults cancelled and the stage was driven
  cleanly end to end with the controls reversed.
- The same sign was wrong three times in the glance: first derived (wrong), then "measured"
  against the driver's own mirrored axis (agreed with the bug), and only settled by
  projecting to NDC.
- Rule: for anything the player judges visually — steering, look direction, body roll,
  which way a thing leans — assert in SCREEN space (project to NDC), with the camera matrix
  frozen before the input so a follow camera cannot hide the answer. World-space assertions
  test self-consistency, not correctness, whenever the frame convention is itself suspect.
- Corollary: when a user reports a reversal that your green test denies, suspect the test's
  frame before suspecting the user.

## Assertion tests were the wrong instrument for this project, twice over

- Five `*-truth.mjs` files asserted pass/fail on the racing level and were all green on a
  build with reversed steering, a spawn straddling the centreline, a 27-second road, and a
  world edge the car drove off. Every one of those is obvious within ten seconds of playing.
- Two distinct failure modes, and both are inherent to the format here:
  1. **They asserted against conventions this code invented.** A test that computes the car's
     "right" the same wrong way the physics does agrees with the bug.
  2. **They asserted the things that are easy to assert**, which are not the things that are
     wrong. No assertion was ever going to say "this road is too short to be fun".
- The method this project already had is in `tools/gallery.mjs`: fixed stations, images
  *plus* a `metrics.json`, and `--compare <baseline>` to diff two runs — with gates only wide
  enough to catch a frame that has stopped being a picture at all. Its own header: "Pictures
  are the judgement, but they are not the record." That is the loop. Change one thing, render
  the same stations, look, and read the deltas.
- `tools/telemetry.mjs` is the same idea for feel. It cannot pass or fail — there is no lap
  time that is "correct" — it drives a fixed line, records what the car did, and diffs two
  runs. It diagnosed the handling in a single run: 34.9% of the stage off the seal, 9.7° of
  average steering, 39 wheel reversals per kilometre. That is a car that will not turn and
  rings rather than settles, and none of it needed an assertion.
- Rule: for anything a player experiences — look, feel, pace, length — build an instrument
  that *reports and compares*, not one that passes. Reserve assertions for contracts that are
  genuinely binary and externally defined (a save round-trips, a level boots without throwing).

## "It handles badly" was a road fault, and only an instrument found it

- The car was blamed for four rounds. Held to a strict standard the trace kept failing in
  one place, and driving it *more slowly* made it worse — which is not how a grip problem
  behaves, and was the clue that the fault was not in the tyre model.
- Watching that place answered it in one frame: 20 degrees of steering applied, lateral
  acceleration 0.00 g. All four wheels were airborne and the tyre model was correctly
  multiplying grip by zero. The road was launching the car.
- A 1-2-1 smoothing pass has sigma ~ sqrt(n/2) samples, so the 400 passes on the elevation
  profile smoothed about 7 m of road — fine for a walker, and nowhere near enough for a car,
  which leaves the ground when v²/R > g, i.e. any crest tighter than 92 m at 30 m/s. Smooth
  to ~45 m and crest-limit to a vertical radius derived from that physics.
- Generalisation: when a vehicle "feels wrong", measure whether it is *in contact*. Zero
  lateral force with lock applied is unambiguous, and no amount of tuning grip, stiffness or
  damping would ever have fixed it.

## Judge a road by its curvature, not by driving it

- Offsetting a shoreline that carries alluvial-fan lobes produced 34 m radius hairpins on a
  state highway. Smoothing the shoreline enough to remove them left a 316 m minimum radius —
  flat out end to end, 0.41° of average steering. Both are the same error: the alignment was
  never measured, only driven and judged.
- Corners are authorable. R = L²/(4π²A) for a sinusoidal lateral offset, so choosing the
  corner you want fixes the amplitude. Target and verify the curvature distribution — min,
  10th percentile, median, and how many corners are under 200 m — before driving it.
- A real highway cuts across the back of an alluvial fan and lets the shingle run out to the
  water on its own. Terrain features that the road should ignore must be filtered out of the
  alignment with a window wider than the feature.

## For a fixed-line instrument, the driver has to be competent

- A bang-bang autopilot that spends a third of the stage off the road makes every handling
  number a measurement of the driver. Tuning the car against it means tuning the car to
  flatter a bad driver.
- The shared driver plans corner speed by working backwards through the braking it can
  actually do — v = sqrt(v_req² + 2 a s), minimised over the lookahead — rather than reacting
  to the worst curvature in a window, which brakes too early for far corners and too late for
  near ones.
- With a binary keyboard, steer to a target *angle* and release, rather than holding a key
  until the error goes away. Holding always overshoots. A reversal count on the hands then
  measures the controller's dithering, not the car — measure yaw-rate sign changes instead.

## Density is not cover: three properties have to be right

- Reaching 1.5 clumps/m² still looked like a planted crop. Density was necessary and nowhere
  near sufficient.
- Even spacing at one scale is a crop. Real grassland grows as discrete stools that spread
  and merge, so randomise *sites* and give each several plants, with a third of them much
  larger than their neighbours.
- Upright narrow blades read as seedlings. A tussock is a fountain — the outer blades arch
  out nearly as far as they rise — and that is what makes neighbouring clumps touch.
- Dry vegetation against dry ground differs in texture and silhouette, not in tone. Anything
  darker than what it stands in reads as an object dropped on the ground.

## Enlarging a world silently un-tunes everything counted for the old one

- Tripling the valley turned every absolute scatter count into a third of its density. Only
  the system being actively worked on got corrected; props, meadow, fauna and the photo
  anchors were all left behind and none of it announced itself.
- Export an `AREA_SCALE` (new area / the area the counts were tuned against) and multiply
  absolute populations by it. Densities per square metre survive a resize; counts do not.
- Route-anchored content needs a different fix from area-anchored content. Fauna is one
  colony per species at one arc length, so scaling by area does nothing — it needs repeating
  per kilometre of route, with the authored `t` becoming a position *within* a repeat.
- Anything authored in absolute metres that refers to something else that moved is now
  wrong. The backdrop was translated 1330 m so the road could not drive into it, which left
  two photographic anchors pointing at empty sky beside the peaks they name.
- Survey for this rather than remembering it: list every scattered system's density per km²
  and every authored point's distance to the road, and read the outliers.

## Constants derived for one level get applied to the next one silently

- `SHADOW_REACH = 46` was correctly derived from the jungle's fog: FogExp2 at 0.038 leaves a
  surface at 46 m with 5% of its own colour, so shadows past that cannot change the frame.
  The lake's fog is 0.00135 and its subject is forty kilometres away.
- It only became visible when the level was driven. At 150 km/h the car covers 46 m in
  1.1 s, so the shadow cascade was a ring of darkness travelling with the player.
- When a constant is justified by a *level's* physical properties, it belongs to the level.
  Give it a default and let the level override it.

## Dark detail on a dark surface has no edge at any size

- The grille aperture read as a plain black slot. The first fix made the vanes bigger, which
  changed nothing, because they were the same near-black trim as the recess floor behind
  them.
- Size is only worth spending when there is a tonal boundary to resolve. Body-colour bars
  against a shadowed opening read instantly at the same dimensions.
- The same error, twice in one file: mud flaps hung outboard of a flank that had been pulled
  in, so they floated as separate black shapes. Detail parts must be positioned against the
  surface they attach to, not against a number that was right before the surface moved.

## A loading indicator is only useful on the layer the player can see

- Do not claim an in-game progress UI fixes deployed loading without checking
  the host integration. OriginGame keeps its own cover above the game until
  `OG.ready()`, while this game hides its local boot details whenever `window.OG`
  exists; therefore truthful local stage labels are not visible to deployed
  players at all.
- A list of named milestones is real *state*, not real percentage completion.
  Hand-authored weights can regress and cannot measure time spent inside a
  synchronous procedural constructor. Call it milestone progress unless work
  units or measured stage durations actually support a percentage.

## A game demo represents the whole shipped game unless scoped otherwise

- When a user asks for a shareable demo of a multi-level game, do not silently
  choose the most cinematic level and call it the game. Inventory the shipped
  levels first and cover each one, or explicitly ask whether a single-level
  teaser is acceptable before spending time recording it.

## An open alpine scene is a different lighting problem from a forest

- Tongariro shipped with the jungle's hemisphere (1.35), contact AO (0.62) and
  46 m shadow aim. The result was a clay model under studio lights, a grid
  printed on every slope, and a travelling ring of darkness. Lake already knew
  this (`openSky`, `shadowReach`, `contactStrength = 0`) and the third level
  did not inherit it.
- A hemisphere at forest intensity is a second sun with no direction. Alpine
  daylight is hard; fill has to sit near 0.7 or landform disappears.
- Screen-space contact AO latches to an open heightfield and becomes moiré.
  Disable the tight ring on any level whose subject is bare ground at a
  shallow angle. The cascade and the normals already carry the landform.
- `_configureShadow` and `_aimShadow` must share the same reach. Sizing a
  cascade to 210 m and aiming it from 46 m spends the far half on empty air.

## Colour keyed off the path is invisible from the path

- Red Crater was red only for `side >= 0 && dist > 4`, so every photograph
  taken from the poled route showed beige. A level named for a colour has to
  carry that colour on the crest the player actually walks.
- The drop had the same fault in profile: a 7→190 m ramp is a hill from eye
  height. Spend the first 30 m of fall steeply enough that a walker can see
  into the crater without leaving the poles.

## Do not spend triangles the frame cannot keep

- Tightening Tongariro's heightfield from 1.7 m to 1.25 m and holding LOD out
  to 210 m put 82 M triangles on screen and 34 fps. The pictures did not get
  sharper; the grain fade and the lighting did. Put the budget back (1.45 m,
  LOD 80/175) and keep the shader work. Geometry that exists only to fight
  aliasing the shader already fades is the grass-card mistake again.

## A New Zealand forest is not a generic rainforest with local names

- Renaming the site Karangahake while leaving morpho-blue butterflies,
  metre-high flying buttresses, lateritic red clay, limestone swallow holes
  and motmot/macaw comments is still the wrong biome. Thumbnail-size frames
  decide this before any species label does.
- New Zealand lowland bush tells: nīkau crownshafts, ponga/mamaku skirts,
  supplejack cane, pūriri/tawa boles with low surface roots, greywacke grit,
  kahukōwhai orange, korimako/ruru/riroriro/tūī/kākā. Anything that needs a
  tropical noun to explain itself does not belong.
- Industrial masonry is the only honest ruin in this country. Temple copy
  (`弃殿`, priests, limestone karst) is leftover from the first brief and
  has to be mined out of content, README and comments together.

## A chase camera looking at the boot lid cannot review a mountain

- Lake start frames kept reporting \"no Alps\" after the ranges were moved
  closer and the fog thinned. The chase rig sits 2 m up and aims 3 m ahead
  at the car. The moraine terrace is the whole near field. Looking up is a
  different photograph. Review a driving level from a glance that can see
  the subject, not only from the default tow-rope.
- FogExp2 at 0.00135 leaves 5% of a 4 km peak. Weather tables silently
  overwrite a mood fog. Change both or the next boot puts the milk back.

## A hollow cone reads as a black crack

- Ngauruhoe was a radial heightfield with an open foot. From South Crater the
  camera looked under the eastern apron and saw sky through the mountain.
  Extra inner rings and double-sided materials did not close that hole; they
  only spent fill rate. A disc at the last ring, plus moving the cone west
  so the foot sits behind the plateau, is the actual join.
- Double-sided kilometre-scale cones dropped Tongariro from 59 fps to 45
  with no visible change. Close the mesh; do not shade the interior.

## A terrace surveyed from a 15 m bench is a cliff

- Lake start sat 50 m above the water because fans and till stacked on a
  15 m bench and the road profile was *measured from that stack*. Flattening
  the face after the survey is too late. Cap the land before `_buildPathProfile`
  samples it, or the car inherits the wall.
- A 2 m chase camera looking at the boot lid cannot review Aoraki. The
  dedicated showcase has to look north-west after `warp()`, not before it.

## Path litter is a density rule, not a sink

- Sinking a card 12 cm still leaves a silhouette if the card is standing.
  Flatten curl/roll/twist *and* stop placing litter inside the packed
  tread. Cards on clay read as paper no matter how deep they sit.

## Boards that float are a seating number, not a material

- Trackwork planks sat on `height + 0.20`. They looked like a ladder in the
  air. Sit the deck on the mud and let the piles carry the idea of a deck.
- A grey pole on a Karangahake track is often a DOC marker, not a missing
  bark texture. Weather the stake before rebuilding the tree.
