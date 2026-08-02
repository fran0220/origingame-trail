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
