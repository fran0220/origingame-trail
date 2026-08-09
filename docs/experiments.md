# Experiments

A log of what was tried on the look, and what the measurement said — including,
especially, the things that did not work. A refuted hypothesis costs a round to
produce and saves the next person the same round, but only if it is written
down; the tempting alternative is to quietly revert and leave no trace, which
is how the same idea gets attempted three times.

Entries are newest first. Each one records the hypothesis, how it was measured,
and the verdict. "Reverted" is a perfectly good verdict.

---

## Lake asset max-out: Mackenzie suite before further look passes

**Hypothesis.** The lake stayed sparse not because of bad shader constants but
because the **asset vocabulary** was thin: 12 plant species, almost no
non-plant stage dressing, and 8 solitary animals. Jungle quality rides on a
dense multi-storey catalogue; an open glacial basin needs the same kind of
*asset breadth* even though the vertical structure is a floor, not a roof.

**Measured.** `shots/assets-max/14-community-shore.png` vs earlier
`dense-r1` / `audit-r3a`. Frame triangle count on community-shore rose from
~6.5M to ~20M with continuous sward + clumps + ~30 plant species + props +
fauna packs. Wet-margin gained driftwood, lichen slabs, thatch mats and denser
shore cobble (`assets-max-w`). `lake-truth` still 20/20 subjects.

**Built (procedural only).**

| Layer | Contents |
|---|---|
| Flora heroes | 30 NZ natives (tussock, shrubs, wetland, forbs) with habitatFit gradients |
| Ground cover | Dual storey: dense sward (0.32 m step) + clump layer |
| Props | Driftwood, lichen slabs, thatch mats, fan-rill cobble, erratics, snags, wetland stems |
| Fauna | 12 species, pack sizes 2–12 (notables still photo anchors) |
| Shore dressing | Shore/path stones 2200 → 5200 |

**Rejected artefacts from first max pass.** Upright “poles” on wet-margin were
wood columns never rotated to the ground plane; snag stubs had orphan verts
(no faces). Fixed: stems horizontal, snags inland only, branch faces wired.

**Verdict.** Keep the expanded catalogue and habitat-driven layout. Next look
pass (R6 water, mountain meshing, plant material depth) now has something to
sit in. Do not thin assets back to “performance” before a deliberate cull
pass with measured budgets.

**Evidence.** `shots/assets-max/`, `shots/assets-max-w/`.

---

## Lake R5 / R7: hard waterline, milky foam pads, and tan cover cards

**Hypothesis.** R5's bed-contour plane + elevation wetness + depth-gated foam
would make the waterline look ragged and wet by construction; ground-cover
cards with `alphaTest:.24` and alpine recolor would already read as filament
tussock rather than khaki quads.

**Measured (`shots/audit-r3a`, then `audit-r5` … `audit-r5e`).** Three separate
failures, and none of them needed more authored geometry.

1. **Cover cards were opaque tan by shader, not by density.**
   `buildGroundCover` replaced the bake's RGB with a solid alpine tint and only
   multiplied alpha. With six overlapping cards and a coverage mip chain
   calibrated at 0.36 against a material `alphaTest` of 0.24, the mid-distance
   clump filled solid. Fix: restore map RGB, match coverage to `alphaTest=.42`,
   drop to three cards, and thin the bake to 28 narrower blades. Atlas mean
   alpha of the live map sits around 0.17 with high σ (filament gaps still
   present). Near cards in `audit-r5e/05-wet-margin.png` now show blades rather
   than filled lozenges. Far cover on route stations is improved but still not
   as open as a ribbon tussock; density and step remain a later pass.

2. **Foam first vanished, then flooded.** The original reverse
   `smoothstep(runup+ε, runup-ε, vBed)` is undefined when edge0 > edge1; Metal
   returned zero. Replacing it with `1.0 - smoothstep(lo, hi, vBed)` made foam
   appear, but dry overshoot vertices have `aBed=0`, so the whole under-beach
   plane went milky before the depth buffer cut it (`audit-r5` / `r5b`). Positive
   bed alone was not enough: cusps below lake level still foam under dry cobble.
   The kept gate multiplies fetch: foam only where `0.05 ≲ aFetch ≲ 5.5 m` *and*
   bed > 0. That killed the inland pads; a thin travelling swash remains on the
   open-water lip in `audit-r5e`.

3. **Elevation wetness is right physics and still invisible from the station.**
   The wet-margin camera is 13 m inland on a ~1:5 face (`above ≈ 1.3 m`), so a
   pure 0.4–0.8 m run-up head left the entire in-frame beach dry. Kept: steep
   elevation head near the lip plus a residual splash term that fades by
   `fromShore` out to ~4.5 m and by height past ~1.4 m, plus a stronger albedo
   drop and a specular wet sheen on the basin material. Wet is now legible as
   darker, slightly shinier cobble against the mid-beach, not as a ruled ribbon.

**Side-effect caught by `tools/lake-truth.mjs`.** Beach relief + the overlook
cap (`Math.min(y, pathY * fromShore/span)`) pulled embayments below `LAKE_Y`
eight metres inland (z≈−170, `depthAt(shoreX+8)>0`). The overlook now applies
only for `fromShore > 12`. `lake-truth` passes again (20/20 subjects, dry@+8 /
wet@−8 on five shore samples).

**Verdict.** Keep the R5 architecture (overshoot plane, aFetch/aBed, elevation
wet, no foam ribbon). Keep the R7 cover-card shader/geometry fixes. Rejected:
wide milky foam gates, reverse `smoothstep`, solid alpine RGB replace, and
overlook-capping the berm face. Next loop is R6 surface quality (grazing
glint, body colour at distance) and a full 14-station gallery, not more
waterline geometry.

**Fixed evidence.**

- before: `shots/audit-r3a/05-wet-margin.png`
- after:  `shots/audit-r5f/05-wet-margin.png`, `shots/audit-r5c-flora/11-toetoe.png`

---

## Lake visual loop M1: a mountain range cannot be assembled from cones

**Hypothesis.** Raising the old skyline strip from 9 to more z rows, then adding
more noise and a lower snow line, would be enough to make the Southern Alps
read as terrain.

**Measured.** The fixed M0 gallery rejected that premise in all four mountain
views. The former meshes were one ridge profile extruded through a 620 m band:
5,184 triangles in total, with snow selected mainly by vertex height. In
`shots/lake-m0-mountains/03-aoraki-tele.png` the result was a row of independent
cones, horizontal snow caps and hard feet. No subdivision of that topology
could create a cirque, tributary ridge, glacier trough or alluvial apron.

The replacement uses three complete x/z mountain fields (139,840 triangles),
an authored asymmetric Aoraki main/shoulder chain, subsidiary ridges, eroded
height, one thermal relaxation pass, talus/cavity fields and slope/aspect/
concavity-dependent snow and glaciers. The material uses world-space
triplanar rock, snow and ice rather than UVs, and each range has its own bright
aerial wash. The playable basin's east wall was also reduced from a compressed
64 m cliff to a 29 m terrace riser; the old wall occupied almost half the route
frame and hid the range it was meant to frame.

Three plausible iterations were rejected by their pictures:

1. Taking the hard maximum of independent peak fields produced isolated
   volcanoes even on a complete mesh (`lake-m1-mountains-r1`).
2. Automatically connecting every nearby summit produced a straight mountain
   wall across the Aoraki view corridor (`r3`); only hand-authored divide links
   survived.
3. Strong five-way radial ridges worked on the high massif but printed long
   triangular chevrons across the lower foothills (`r7`–`r10`). Increasing
   mesh density and smoothing material classifications did not remove them,
   because they were real geometry. Near/mid radial ridge strength was removed
   and their relief now comes from broad divides plus erosion; Aoraki retains
   the strong subsidiary ridges. Reducing far gully depth from 14% to 7% of
   peak height removed the related vertical knife cuts.

**Fixed evidence.** The sun is 47°/22°, output 960×540, with route positions,
targets and lens written to each `report.json`:

- wide 58° production pass: `shots/lake-m1-mountains-r7-wide/01-aoraki-wide.png`;
- 34° long-lens production pass after the last geometry correction:
  `shots/lake-m1-mountains-r11-tele/03-aoraki-tele.png`;
- no-snow ablation: `shots/lake-m1-ablate-snow/03-aoraki-tele.png`;
- no-erosion ablation: `shots/lake-m1-ablate-erosion/03-aoraki-tele.png`.

The no-snow image loses the internal summit contrast while preserving the
silhouette. The no-erosion image returns to smooth cones while preserving the
same authored main masses. These are independent visible contributions rather
than extra code whose effect has only been inferred. The final fixed frames
reported 783k scene triangles in the wide station and 564k in the long-lens
station. They were rendered by SwiftShader, so those counts are useful but its
frame rate is not a real-GPU performance claim.

**Verdict.** Keep the complete heightfields, authored divide links, triplanar
material and level-specific basin framing. Revert neither to a skyline strip
nor to automatic all-neighbour peak linking. Two independent image-only gates
accepted the final wide and long-lens mountain views; that advances the loop
to water, not to overall scene completion. Water, shore and plants remain
prototype systems and cannot inherit this pass.

---

## Lake Pukaki: an object existing in the scene is not visual acceptance

**Hypothesis.** The first P1–P3 pass had all the requested nouns — a water
mesh, three mountain meshes and twelve plant species — so structural counts
and finite coordinates would be enough to move on to fauna.

**Measured.** They were not. The first screenshots read as a narrow river, a
row of paper cut-outs and generic sphere/cone placeholders. A second failure
was subtler: after the lake became genuinely kilometres wide, a four-metre
moraine berm between the route and `shoreX(z)` hid it from eye height for most
of the walk. Looking inland, or looking at an old screenshot taken with the
wrong yaw, could then produce either the false claim that the lake was missing
or the equally false claim that it was fine. The useful views were route-level
captures looking lakeward at yaw about +π/2, plus close views of each plant
silhouette and a long lens toward Aoraki.

**Verdict.** The first pass was refuted and replaced, not polished. The shipped
sequence was deliberately dependency-ordered:

1. P1 established three genuinely separated Southern Alps ranges, snowline,
   Aoraki and distance wash; increasing the camera far plane alone had bought
   none of those cues.
2. P2 generated a 2.26 km-wide lake from the same `shoreX(z)` and `LAKE_Y`
   functions as the terrain and map, with shallow bed colour, two wave scales,
   Fresnel sky colour and a sun glint.
3. P3 gave all twelve plants a species-specific silhouette, habitat, ground
   alignment, slope limit, culling chunks and non-empty notable locations.
4. P4 added eight stable fauna identities with local movement, followed by P5's
   twenty reachable photographs and no artificial tablet collection.
5. P6 put both levels behind one host-owned picker/save lifecycle; P7 added the
   level-owned, gesture-gated alpine soundscape; P8 made a rendered world frame
   the startup gate and added repeated cold-start coverage.

The persistent test now checks 20 unique subjects, 12 finite/non-empty flora
sets, eight moving fauna identities, 8,160 water triangles, five dry/wet shore
cross-sections and 21 dry route samples. The photographic reachability sweep
found all 20 subjects at quality ≥ 0.42 (threshold 0.28). Those measurements
certify structure and playability; screenshots remain the authority for
whether the result actually reads as a glacial lake.

---

## Open-country distance needs less micro-detail, not more

**Hypothesis.** The jungle's treatment could be extended to the basin: a long
far plane, normal-mapped gravel and terrain self-shadowing should add realism
to distant slopes, while the existing dark atmospheric treatment should add
depth.

**Measured.** A longer far plane only exposed more undifferentiated geometry.
At hundreds of metres, the independently rotated shingle and thatch samples
lost useful detail. More seriously, the Jungle depth-derived AO's sub-pixel
sample rings locked to the 60 cm terrain grid at a grazing view and drew a
dense black screen-door over the whole shore. An AO-off ablation removed the
pattern completely; merely disabling terrain shadow casting did not. Jungle-like
dark fog then closed the very view this level exists to show. In contrast,
three physically separated ridge scales, overlapping silhouettes and
progressive mixing toward a bright blue-grey air colour produced readable
parallax and depth.

**Verdict.** The Lake level keeps receiving real object shadows but its broad
terrain does not cast them, and it opts out of the contact/wide AO designed for
leaves on litter. Fine albedo is faded toward each material's measured middle
colour from 55–210 m and the corresponding tangent normal is flattened by up
to 92%. The atmosphere is a thin bright alpine veil rather than transplanted
jungle mist. These are level-owned choices: the Jungle terrain, fog, AO and
shadow behaviour were left untouched.

---

## A shader patch's complete variant is part of its cache identity

**Hypothesis.** The intermittent black basin and missing sun were a flaky
SwiftShader bake or an open-sky canopy/contact-lighting error. Adding an
open-sky early return, or giving just the newly injected basin material a
distinct cache key, should make boot deterministic.

**Measured.** The open-sky change was physically sound but did not change the
bimodal result. Good runs reported fourteen relevant programs and normal
luminance; bad runs reported twelve, with identical sun, environment,
exposure, tier and shadow state. The basin material had its own
`onBeforeCompile`, then received the shared canopy patch. A key that described
only one injection still allowed a compiled program for a different combined
shader to win by compile order.

**Verdict.** Every material-owned `onBeforeCompile` now declares its own
`customProgramCacheKey`, and `patchCanopyLight` composes that previous key with
its own `|canopy` variant instead of replacing it. It also refuses to patch a
material that injects shader source without declaring a key, turning a silent
visual race into a first-frame stack trace. `ShaderMaterial` instances are
already defined by their explicit source and do not need this mechanism. The
current cold-start probe produced the same program count and histogram on all
three Lake runs (`programs=19`, `median=0.557`, `black=0%`) as well as all three
Jungle runs.

---

## “Ready after 220 ms” was a timer, not a readiness contract

**Hypothesis.** Once world construction resolved, exposing `window.__game` and
waiting a fixed settling interval before capture was equivalent to having a
playable first frame.

**Measured.** On the software renderer, shader compilation and the first full
scene/composite pass sometimes exceeded the interval. Automation then observed
only the post-process triangle (`calls=1`, `triangles=1`) or sampled an old/black
buffer. Increasing the timeout reduced frequency but could never prove the
race absent. It also made parse errors painful: the harness had already
received `pageerror`, yet waited out its whole timeout for a global that could
never appear.

**Verdict.** Restore now happens before presentation, then boot explicitly
runs `step(0)` and `renderOnce()`. It requires the visible scene pass to report
more than one call and non-zero geometry before publishing `window.__game` or
calling the host's `ready()`. The harness polls readiness and already-seen fatal
errors against one deadline, without leaving the losing branch of a
`Promise.race` alive. A separate cold-start test creates a fresh browser context
for each attempt and rejects empty, nearly black or blown frames without retry.
Readiness is now a successful world render handshake, not elapsed time.

---

## Habitat, photography and saving need one source of truth but different identities

**Hypothesis.** A signed offset from the trail could stand in for habitat, and
the static content anchor used as a save key could also serve as the live
position of an animal.

**Measured.** The shoreline moves by more than a hundred metres around the
fans. Both swimming birds received a nominal “lakeward” trail offset while
actually landing over gravel; setting only their y coordinate to water level
made the visual error worse. Moving fauna also invalidated a copied static
camera anchor after its first update. Conversely, making saves follow entity
objects would make persistence unstable across sessions. Flora exposed a
second lifecycle version of the same mistake: it had a `cullAround` method, but
Lake never called it as the camera moved. After boot's environment bake restored
the cull around the trailhead, later route sections stayed empty even though
all 4,320 instances existed.

**Verdict.** Terrain depth, water boundary, map paint, wetland flora and
swimming fauna all derive from `shoreX(z)` / `LAKE_Y`. Runtime photography holds
references to each entity's moving `position` and `focus`, while content IDs
remain immutable strings and are the only save identity. Lake now updates the
flora cull from the live camera every frame and rejects every plant within the
tread plus 3.5 m clearance; the truth test verifies both that clearance and
that visible chunks change between route t=0.1 and t=0.8. The reachability test
also rejects wet or over-steep camera positions, so a good score cannot be
obtained from an impossible viewpoint.

---

## Level switching belongs to the host; a level owns only its world

**Hypothesis.** Hot-swapping level groups inside one `Game` would be the most
seamless picker implementation.

**Measured.** A swap would also have to transfer or recreate the renderer,
pointer-lock listeners, `AudioContext`, procedural texture state, session
bindings, post-processing and every level resource. Those systems did not have
a transactional hot-swap contract. The save did: its version-2 envelope was
already capable of retaining independent level records, and an explicit flush
could be observed before navigation.

**Verdict.** A bare URL displays a lightweight, keyboard-focusable picker and
constructs no `Game`, HUD or platform loading lifecycle. A choice enters the
same `LEVELS` / `pickLevel()` route used by deep links and tests. Leaving from
pause or finale first awaits `state.flush()`, clears the hash and performs a
full reload. That document boundary is intentionally the reset boundary. A
browser test verifies both buttons, both deep links and the persisted Lake
photo across the reload. Lake owns its water, flora, fauna, mountains and
ambience and disposes them through the host's generic `level.dispose()` hook.

---

## Process liveness, screenshots and baselines answer different questions

**Hypothesis.** A Droid PID, one successful launch or one screenshot was enough
evidence that the delegated iteration was still progressing and the result was
stable.

**Measured.** Session `0bde7d63-514f-405b-94ac-0c50532967cc` remained present
after its model request failed with HTTP 403, but the transcript ended in a
JSON-RPC wait after the error — no implementation was continuing. One old Lake
frame was shot inland, one fauna frame caught a bird in its authored flight
cycle and was misread as a grounded animal floating, and an old visual baseline
correctly differed after a deliberate art pass but described that change as a
regression. None of those observations was wrong; the inference drawn from it
was.

**Verdict.** Check the session tail and last successful tool result, not only
the process table. For visual work, retain an intentional station/direction,
compare before/after and ablation captures, inspect behavior state when an
image is ambiguous, and pair the image with structural truth. Treat a baseline
as a change detector, not as an oracle that all change is bad. The continuing
iteration loop is therefore: truth tests → repeated fresh-context starts →
authored-direction gallery → close silhouettes/behavior → Jungle regression →
packaged build. Failed and reverted hypotheses stay in this log so the same
plausible mistake is not proposed again.

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
