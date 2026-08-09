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
