/* The inscription tablets.
 *
 * Twelve carved slabs standing where content.js put them. Each is one box with
 * one material: the dressed face maps into its own cell of the inscription
 * atlas and the other five faces map into the blank cells, so a tablet costs
 * one draw call and the whole set shares a single bake.
 *
 * A tablet is placed by the same rules the rest of the level is built by. It
 * is set into the finished heightfield rather than dropped on top of it, it
 * turns to face the trail because that is where a reader would have stood, and
 * it registers a collider so it is a thing in the world and not a picture of
 * one.
 */
import * as THREE from 'three';
import { bakeSurface } from '../gfx/bake.js';
import { TABLET_ATLAS, ATLAS_COLS, ATLAS_ROWS, BLANK_PANEL } from './glyphTex.js';
import { resolveAnchor } from './anchors.js';

const W = 0.92;         // slab width
/* A stele meant to be read standing up. At 1.72 with a foot buried the stone
 * tops out around 1.4 m and the dressed panel centres near 0.8 m, which is
 * where a standing reader's eyes land at conversational distance; the earlier
 * 1.36 put the whole face below the horizon and the player read it by looking
 * at their own boots. */
const H = 1.72;         // slab height
const D = 0.21;         // slab thickness
const SINK = 0.30;      // how far the foot of it is below the ground it stands in

/** Interaction reach, in metres from the reader's feet to the tablet. */
export const REACH = 2.6;

export class Glyphs {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{trail:object, terrain:object, veg:object}} world
   * @param {import('../player/collision.js').CollisionWorld} [collision]
   */
  constructor(renderer, world, collision = null, defs = []) {
    /** The level's tablets. Handed in, because which tablets exist — and
     * whether the level has any at all — is that level's content. */
    this.defs = defs;
    this.root = new THREE.Group();
    this.root.name = 'glyphs';
    this.items = [];

    const baked = bakeSurface(renderer, TABLET_ATLAS, {
      size: 1024,
      // Sixteen 256-pixel panels. The player reads the text in the notebook,
      // not off the stone, so the panel only has to carry the *look* of a
      // script at arm's length; 300 px per metre of face does that.
      normalStrength: 2.2,
    });
    this.baked = baked;

    this.material = new THREE.MeshStandardMaterial({
      map: baked.map,
      normalMap: baked.normalMap,
      aoMap: baked.ormMap,
      roughnessMap: baked.ormMap,
      metalness: 0,
      roughness: 1,
    });
    this.material.name = 'tablet';

    const geo = new THREE.BoxGeometry(W, H, D);
    /* aoMap reads uv2 in three. The box only has one UV set, and the atlas
     * cell is the same for both purposes, so the second channel is the first
     * one aliased rather than a duplicate attribute. */
    geo.setAttribute('uv1', geo.getAttribute('uv'));

    this.defs.forEach((def, i) => {
      const mesh = new THREE.Mesh(remapToPanel(geo.clone(), i), this.material);
      const ground = resolveAnchor(def.at, world);
      const facing = faceTowardTrail(ground, world.trail);

      mesh.position.set(ground.x, ground.y + H * 0.5 - SINK, ground.z);
      mesh.rotation.y = facing;
      /* Leaning back, and by a hashed rather than uniform amount. Nothing that
       * has stood in wet ground for centuries is still plumb, and twelve
       * tablets at exactly the same tilt would read as a fixture. */
      mesh.rotation.x = -0.06 - hash(i * 7.7) * 0.13;
      mesh.rotation.z = (hash(i * 3.1) - 0.5) * 0.10;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.root.add(mesh);

      if (collision) {
        collision.addBox({
          x: ground.x, z: ground.z,
          halfX: W * 0.5, halfZ: D * 0.5,
          angle: facing,
          minY: ground.y - SINK,
          maxY: ground.y + H - SINK,
          kind: 'tablet',
          stepable: false,
        });
      }

      this.items.push({
        kind: 'glyph',
        id: def.id,
        title: def.title,
        text: def.text,
        hint: def.hint ?? null,
        // The point a reader looks at, which is the middle of the dressed face
        // rather than the centre of a slab that is a quarter buried.
        focus: new THREE.Vector3(ground.x, ground.y + H * 0.64 - SINK, ground.z),
        position: ground,
        reach: REACH,
        mesh,
      });
    });
  }

  dispose() {
    this.baked.dispose();
    this.material.dispose();
    for (const it of this.items) it.mesh.geometry.dispose();
  }
}

/**
 * Point the dressed face (+Z) at the nearest point on the trail.
 *
 * A tablet was meant to be read, so it faces where the reader was: the path.
 * Deriving it rather than authoring a yaw per tablet means an offset can be
 * moved from one side of the trail to the other in content.js without the
 * stone ending up face down in the bank.
 */
function faceTowardTrail(p, trail) {
  const q = trail.nearest(p.x, p.z);
  const t = trail.pointAt(q.t, new THREE.Vector3());
  const dx = t.x - p.x, dz = t.z - p.z;
  if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return 0;
  return Math.atan2(dx, dz);
}

/**
 * Map a box's UVs into atlas cells: the +Z face gets panel `index`, the rest
 * get one of the blank panels.
 *
 * BoxGeometry emits its faces in a fixed order (+X, -X, +Y, -Y, +Z, -Z) with
 * four vertices each, so the dressed face is vertices 16 through 19. Relying
 * on that ordering is why this is a function with a comment rather than a
 * loop over `geometry.groups`: the groups carry the same information, but only
 * for a geometry that still has more than one material index.
 */
function remapToPanel(geo, index) {
  const uv = geo.getAttribute('uv');
  for (let v = 0; v < uv.count; v++) {
    const face = Math.floor(v / 4);
    const panel = face === 4 ? index : BLANK_PANEL + (face % (ATLAS_COLS * ATLAS_ROWS - BLANK_PANEL));
    const col = panel % ATLAS_COLS;
    const row = Math.floor(panel / ATLAS_COLS);
    uv.setXY(v, (col + uv.getX(v)) / ATLAS_COLS, (row + uv.getY(v)) / ATLAS_ROWS);
  }
  uv.needsUpdate = true;
  geo.setAttribute('uv1', uv);
  return geo;
}

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
