# Lake environment assets

All files in this directory are bundled locally and loaded before the Lake
level reports ready. They are released under CC0 1.0; attribution is retained
here for provenance even though it is not legally required.

## ambientCG

- `ground/Grass004_1K-JPG_*`
- Source: https://ambientcg.com/view?id=Grass004
- License: https://ambientcg.com/license
- Role: scanned green meadow albedo, OpenGL normal, and packed AO/roughness.

The local ORM file packs ambient occlusion into R and roughness into G. It was
derived from the source bundle without changing the source measurements.

## Poly Haven

- `grass/grass_medium_01_*`
- Source: https://polyhaven.com/a/grass_medium_01
- `flowers/flower_heliophila_*`
- Source: https://polyhaven.com/a/flower_heliophila
- `habitat/fern_02/*`
- Source: https://polyhaven.com/a/fern_02
- `habitat/grass_medium_02/*`
- Source: https://polyhaven.com/a/grass_medium_02
- `habitat/shrub_03/*`
- Source: https://polyhaven.com/a/shrub_03
- `habitat/shrub_04/*`
- Source: https://polyhaven.com/a/shrub_04
- `habitat/boulder_01/*`
- Source: https://polyhaven.com/a/boulder_01
- `habitat/rock_moss_set_01/*`
- Source: https://polyhaven.com/a/rock_moss_set_01
- `habitat/dead_tree_trunk/*`
- Source: https://polyhaven.com/a/dead_tree_trunk
- `habitat/shrub_02/*`
- Source: https://polyhaven.com/a/shrub_02
- `habitat/grass_bermuda_01/*`
- Source: https://polyhaven.com/a/grass_bermuda_01
- `habitat/moss_01/*`
- Source: https://polyhaven.com/a/moss_01
- `habitat/dead_tree_trunk_02/*`
- Source: https://polyhaven.com/a/dead_tree_trunk_02
- `habitat/rock_07/*`
- Source: https://polyhaven.com/a/rock_07
- `habitat/rock_09/*`
- Source: https://polyhaven.com/a/rock_09
- `ground/gravel_stones/*`
- Source: https://polyhaven.com/a/gravel_stones
- License: https://polyhaven.com/license
- Role: sparse flower islands; the photoscanned fern, meadow, scrub and stone
  families used by the habitat middle storey; and measured two-metre grey
  gravel PBR for the Lake Pukaki shingle margin.

The checked-in glTF files reference only sibling files in this directory. No
runtime request uses Poly Haven or another external host. Standalone opacity
maps are explicitly loaded by the runtime because these Poly Haven glTF files
do not reference them.
