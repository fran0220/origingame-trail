# Experiments

A log of what was tried on the look, and what the measurement said — including,
especially, the things that did not work. A refuted hypothesis costs a round to
produce and saves the next person the same round, but only if it is written
down; the tempting alternative is to quietly revert and leave no trace, which
is how the same idea gets attempted three times.

Entries are newest first. Each one records the hypothesis, how it was measured,
and the verdict. "Reverted" is a perfectly good verdict.

---

## The environment probe photographed a forest that had been culled away

**Hypothesis.** `sky.bake()` renders the scene from a probe fixed at trail
t=0.5. Vegetation and ruins are hidden per frame by distance to the *camera*.
Those two facts are incompatible: walk away from the probe and the world around
it is switched off, so the bake captures a clearing.

**Measured.** `tools/env-truth.mjs` renders a chrome ball lit only by
`scene.environment` and reads its pixels — the map is judged by looking at it,
not by recomputing what it ought to contain. Two bakes from the same probe with
the player standing in different places:

| | on the probe | at the falls | drift |
|---|---|---|---|
| mean | 0.0332 | 0.1578 | **+375%** |
| upper hemisphere | 0.0449 | 0.2589 | **+477%** |
| green | **+0.0149** | **−0.0100** | sign flip |

The green figure is the one that settles it. Sky is not green; a capture whose
canopy has been culled stops being green and goes negative. And because
`setSun()` rebakes and the sun advances with the player's progress, the error
grew as the walk went on — the second half of the game ran on an environment
map of a place that does not exist.

**Verdict.** Fixed. `cullAround(x, z)` was split out of both `Vegetation.update`
and `Ruins.update`, and `_bakeEnv()` re-centres both on the probe, aims the
shadow cascade there with one depth update requested, bakes, and hands
everything back to the camera. Drift fell to 8.0% mean / 1.8% upper, and green
stayed positive at both standpoints.

**What it did *not* buy.** The gallery frames moved about 0.005 in median — two
to four per cent, below the threshold of noticing. That is worth stating
plainly: this forest is lit mostly by the sun and the hemisphere fill, and the
environment map contributes mainly specular, so a map that is wrong by 375% is
a final image that is wrong by 3%. The fix is still right — the water is the
map's main consumer and it now reflects a real place — but "the map was badly
broken" and "the picture changes a lot" are different claims and only the first
one is supported.

**Still open.** The lower hemisphere continues to drift ~21% between
standpoints against a measured noise floor of 7.6% (the floor is a third bake
from the first standpoint, so it carries the wind and the water). Ruled out by
measurement, not by argument: re-culling the ruins (no measurable effect at
all), camera yaw (locked at both standpoints, unchanged), the shadow cascade (a
level-wide frustum made it slightly worse), the spray plume (additive and
unfogged, but a direct child of `water.root` and therefore excluded), and
terrain LOD (chosen at build time from distance to the trail, never
re-evaluated). The two mirror balls are structurally the same picture with a
slightly brighter floor in one. `TOL_LOWER` is set to catch a regression rather
than to certify the number.

---

## Coarse LOD for the probe bake

**Hypothesis.** The probe bake is expensive because it draws the world six
times, so rendering it at the low level of detail would make multi-probe
affordable.

**Measured.** Forcing all 1,612 two-level tiles to their coarse build:

| | bake |
|---|---|
| as-is | 35.7 ms |
| every tile coarse | 31.5 ms (**−12%**) |
| no vegetation at all | 8.8 ms (−75%) |

**Verdict.** Refuted. The cost is draw-call submission, not triangles: the
coarse build has fewer triangles per instance but exactly the same number of
`InstancedMesh` objects, so the submission count does not move. This is the
same fact as the bake being insensitive to cube resolution (64² / 128² / 256²
all cost within 17% of each other) — the pass is geometry-bound, and anything
that does not reduce the number of draws does not help.

---

## Distance-clipping the probe's vegetation

**Hypothesis.** The probe only needs vegetation as far as the fog lets it see.
`FogExp2(0.038)` puts transmittance at 80 m at about 1e-4, so tiles past that
could be dropped for a large saving.

**Measured.** True on its face — 35.7 ms → 15.8 ms at an 80 m radius. But the
number that made it look attractive was an artefact: it was taken immediately
after boot, before the frame loop had ever run, when all 2,577 tiles were still
visible. Once the game is actually running, the per-frame cull has already
reduced the set to about 350 tiles and the bake costs 10.4 ms.

**Verdict.** Withdrawn — the optimisation already exists and runs every frame.
The investigation was not wasted, though: asking why the cull was not helping
the probe is what turned up the entry above, where the same cull was being
applied around the wrong point.

---

## Doubling the stone blocks' tessellation

**Hypothesis.** The ruins' arrises read too sharp because `seg = 3` cannot
express a worn edge.

**Measured.** 44,688 → 178,752 triangles. The arrises came out **sharper**: the
chamfer threshold covers a smaller fraction of a finer grid, so refining the
mesh shrinks the rounded band.

**Verdict.** Refuted by its own screenshot, and reverted. Four times the
geometry for a worse picture.

---

## Shadow reach was a tier knob; it should have been the fog

**Hypothesis.** Shadows carry a large share of this picture, and the single
cascade is spending its texels on distance nobody can see through.

**Measured.** A lighting budget first, by switching each term off and reading
the frame's median back:

| term removed | t=0.22 (closed forest) | t=0.80 (ruins clearing) |
|---|---|---|
| hemisphere fill | **−19.7%** | −12.7% |
| environment map | −13.4% | −8.4% |
| sun | −10.2% | **−29.5%** |
| shadows | **+18.1%** | +3.0% |
| SSAO + volumetrics | +8.7% | +1.8% |

So the closed forest is lit mostly by the fill, as the vegetation comments have
said all along, and shadows are removing 18% of its light — the largest lever
in there after the fill itself.

`shadowDist` then rose with the quality tier, 45 m to 100 m. That is backwards.
A cascade is a fixed number of texels spread over whatever it covers, so
reaching further is not more quality, it is the same quality thinned out:
3072 texels over 100 m is 6.5 cm and 2048 over 80 m is 7.8 cm, which is almost
no gain for twice the map. Meanwhile `FogExp2(0.038)` leaves a surface at 46 m
with under 5% of its own colour and by 60 m with half a per cent, so shadows
past that cannot change the frame.

**Verdict.** Shipped. One `SHADOW_REACH = 46` for every tier; the tier now
varies only the map size, which is the honest knob. Texels go from 7.8 cm to
4.5 cm at `high` (1.7x) and 6.5 cm to 3.0 cm at `ultra` (2.2x), at no cost —
same map, same casters, same draws.

The pictures are where this is decided, and the gallery's `01-forest` shows it:
the sunflecks on the litter separate into individual leaf-shaped patches
instead of a soft wash, and the fleck on the trail gains an edge and a
neighbour. Dappled light is the signature of a forest floor and it now reads as
leaves rather than blobs. The frame also darkens slightly (median −0.007),
which is the penumbra no longer leaking.

Checked first that the sun shafts do not depend on this map: the volumetric
march gates itself on the canopy transmittance field, so shortening the frustum
cannot truncate them.

---

## How far should the shadow cascade actually reach?

**Hypothesis.** The fog argument that set `SHADOW_REACH = 46` says shadows past
that cannot change the frame. It does not say 46 is optimal — pulling in
further would sharpen the near field, which is where the eye is.

**Measured.** `detail` exists now, so the question can be asked directly.
Sweeping the frustum at the dense-forest station, `high` tier (2048 map):

| reach | texel | detail | verdict |
|---|---|---|---|
| 64 m | 6.3 cm | 0.0366 | |
| 46 m | 4.5 cm | 0.0365 | shipped |
| 36 m | 3.5 cm | 0.0367 | no gain |
| 28 m | 2.7 cm | 0.0380 (+4.1%) | |
| 22 m | 2.1 cm | 0.0416 (+13.7%) | |

The curve is flat from 36 m to 64 m and only climbs below 28 m, which looks
like an argument for pulling in hard. It is not. The gallery run at 28 m raised
`lower` by 0.006 to 0.010 across the stations — the frame getting *brighter* is
the signature of shadows going missing — and the picture says the same thing:
the near sunflecks do sharpen, to the point of losing the penumbra a real one
would have at that distance, while the understorey at twenty to thirty metres
flattens out and reads as evenly lit. Two things explain it. Fog at 22 m still
passes half a surface's own colour, so a shadow missing out there is plainly
visible; and a 26 m canopy tree at a 38-degree sun throws a shadow 33 m long,
so a frustum that excludes casters at 35 m loses shadows that land right next
to the player.

**Verdict.** 46 m stands, now on a measurement rather than only on the fog
argument that suggested it. 36 m buys nothing at all and costs mid-distance
shading; below 28 m the trade is real but wrong.
