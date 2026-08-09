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
