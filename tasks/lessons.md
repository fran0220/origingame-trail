# Lessons

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
