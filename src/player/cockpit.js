/* The inside of the car.
 *
 * The bonnet camera carries a comment explaining why it is a bonnet camera and
 * not a cockpit one: the shell is a front-sided loft, so from inside it you are
 * behind every face and the entire car disappears. A cockpit view therefore
 * needs its own geometry, built facing INWARD, and that geometry did not exist.
 * This file is that geometry.
 *
 * WHAT AN INTERIOR HAS TO DO, which is not the same as what an exterior does:
 *
 *   IT MUST FRAME THE VIEW. What makes a cockpit shot read is not the dash —
 *   it is the A-pillars and the header rail cutting into the corners of the
 *   screen. Without them the camera is floating in the open air with some
 *   furniture in front of it, which is precisely what the old "cockpit" mode
 *   looked like and why it was replaced by a bonnet cam.
 *
 *   IT MUST MOVE. A static interior is a photograph you are sitting in. The
 *   steering wheel is the one object the player is continuously commanding, so
 *   it is the one that has to answer: it turns with the input, and because the
 *   player's hands are on it in their head, it is worth more than every other
 *   interior detail combined.
 *
 *   IT MUST BE DARK. Interiors are lit almost entirely by bounce, and a cabin
 *   rendered at exterior brightness reads as a white box. Everything here sits
 *   between 0.02 and 0.09 albedo, which looks wrong in isolation and correct
 *   through a windscreen.
 *
 * It is built once and hidden unless the cockpit camera is active, because it
 * is invisible from outside and there is no reason to pay for it.
 */
import * as THREE from 'three';
import { buildInstruments } from './instruments.js';

/* The driver sits on the right — this is a New Zealand rally car. */
/* MEASURED FROM THE CAR, not chosen. The glazing spans y 0.80..1.47 and the
 * cabin z 0..2.35, with the dash top at y 0.985. An eye at 1.13 — my first
 * guess — sits four centimetres above the dash, which is a driver lying down.
 * 1.24 puts the eye a comfortable 0.25 m over the dash with 0.23 m of
 * headroom under the glass, and on the right, because this is a New Zealand
 * car on a New Zealand road. */
export const EYE = new THREE.Vector3(0.33, 1.30, 1.18);

function box(w, h, d, r = 0.01) {
  return new THREE.BoxGeometry(w, h, d);
}

function put(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

/**
 * Build the cabin interior.
 *
 * Returns { root, wheel } — the wheel is separate so the driver can turn it.
 */
export function buildCockpit(detail = 1) {
  const root = new THREE.Group();
  root.name = 'car-cockpit';

  const trimMat = new THREE.MeshStandardMaterial({
    name: 'cockpit-trim', color: new THREE.Color(0x101216),
    roughness: 0.90, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.28,
  });
  const alcMat = new THREE.MeshStandardMaterial({
    name: 'cockpit-alcantara', color: new THREE.Color(0x16181c),
    roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.14,
  });
  const beltMat = new THREE.MeshStandardMaterial({
    name: 'cockpit-belt', color: new THREE.Color(0x5e161a),
    roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide,
  });

  const parts = [];
  const add = (mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    const mm = new THREE.Mesh(g, mat);
    /* Named after its material so the solidity audit can classify the whole
     * interior at once: it is the player's own car and is never solid. */
    mm.name = `cockpit:${mat.name || 'part'}`;
    parts.push(mm);
  };

  /* ── ONLY THE OPAQUE SURFACES ────────────────────────────────────────────
   *
   * The first version built a closed box around the driver and it blacked out
   * every window: an interior is not a cave, it is the set of panels that are
   * NOT glass, and the glazed band between y 0.80 and 1.47 has to stay open or
   * there is nothing to drive by. Each panel below is placed against the
   * measured cabin rather than against an idea of one.
   */
  /* Headliner, above the glass line. */
  add(trimMat, 1.36, 0.03, 1.90, 0, 1.455, 1.10);
  /* Floor and rear bulkhead. */
  add(trimMat, 1.40, 0.03, 2.10, 0, 0.605, 1.15);
  add(alcMat, 1.36, 0.60, 0.03, 0, 0.90, 0.10);
  /* Door cards, BELOW the window line only. */
  for (const s of [-1, 1]) {
    add(alcMat, 0.03, 0.36, 1.70, s * 0.705, 0.79, 1.15);
  }

  /* ── the dash ────────────────────────────────────────────────────────── */
  add(trimMat, 1.36, 0.09, 0.44, 0, 1.00, 2.10, -0.20);
  add(trimMat, 1.36, 0.26, 0.03, 0, 0.85, 1.92);
  /* Binnacle, ahead of the driver's eye, with a dial in it. */
  add(trimMat, 0.38, 0.17, 0.24, EYE.x, 1.05, 1.94, -0.28);
  const inst = buildInstruments(detail);
  /* Face angled back toward the eye, standing just proud of the binnacle. */
  /* THROUGH THE WHEEL, NOT BEHIND IT.
   *
   * The dial first went at y 1.075, which is below the top of the rim at
   * 1.15 — so the line of sight from the eye at 1.30 passed straight into the
   * back of the steering wheel and the tachometer was invisible in every
   * frame. A real cluster is read through the wheel's upper opening, which
   * means it has to sit above the rim's top edge from the driver's eye
   * position, not merely somewhere behind the wheel. */
  inst.root.position.set(EYE.x, 1.205, 1.875);
  /* TURNED TO FACE THE DRIVER.
   *
   * The dial is built in its own local space with the face at z 0 and the
   * marks and needle standing proud at +z. Dropped into the cabin unrotated,
   * that +z points at the NOSE — so the driver sees the back of the face, the
   * marks and needle are hidden behind it, and the instrument renders as a
   * plain black disc. It looked like an unlit dial, which sent me looking at
   * emissive intensity; it was a facing problem.
   *
   * Yawed by PI so its front points back down the cabin, and the rake sign
   * flips with it. */
  inst.root.rotation.set(0.34, Math.PI, 0);
  root.add(inst.root);

  /* ── A-pillars and header rail: THE FRAME ────────────────────────────────
   * These do more for the shot than everything else here. They run from the
   * dash corners up to the header, which is where the windscreen actually is:
   * z 2.30 at the bottom, z 1.72 at the top. */
  for (const s of [-1, 1]) {
    add(alcMat, 0.075, 0.075, 0.86, s * 0.60, 1.20, 2.02, 0.62);
  }
  add(alcMat, 1.30, 0.075, 0.09, 0, 1.435, 1.70);

  /* ── seats and harness, seen from just in front of them ───────────────── */
  for (const s of [-1, 1]) {
    add(alcMat, 0.44, 0.66, 0.11, s * 0.33, 1.02, 0.86, 0.16);
    add(alcMat, 0.44, 0.10, 0.46, s * 0.33, 0.70, 1.16);
    for (const t of [-1, 1]) {
      add(beltMat, 0.07, 0.56, 0.02, s * 0.33 + t * 0.12, 1.05, 0.80, 0.19);
    }
  }

  /* ── controls between the seats ──────────────────────────────────────── */
  add(trimMat, 0.045, 0.30, 0.045, 0.02, 0.83, 1.50, -0.12);
  /* A hydraulic handbrake lying almost flat is a rally fitting; a road car's
   * is short and upright. */
  add(trimMat, 0.040, 0.46, 0.040, -0.11, 0.80, 1.34, -1.28);

  /* ── the steering wheel ──────────────────────────────────────────────────
   * Its own group, because it is the only interior object that moves. Built
   * about the origin and placed by the group, so rotating the group turns the
   * wheel about its own hub instead of swinging it across the cabin — which
   * is what happens if you rotate geometry modelled in place. */
  const wheel = new THREE.Group();
  wheel.name = 'cockpit-wheel';
  const RIM = 0.165, TUBE = 0.018;
  const rim = new THREE.TorusGeometry(RIM, TUBE, detail > 0 ? 8 : 5, detail > 0 ? 26 : 14);
  const rimMesh = new THREE.Mesh(rim, trimMat);
  rimMesh.name = 'cockpit:wheel-rim';
  wheel.add(rimMesh);
  for (const a of [Math.PI * 0.5, Math.PI * 1.17, Math.PI * 1.83]) {
    const sp = new THREE.BoxGeometry(RIM * 0.92, 0.020, 0.030);
    sp.translate(RIM * 0.46, 0, 0);
    sp.rotateZ(a);
    wheel.add(new THREE.Mesh(sp, trimMat));
  }
  const hub = new THREE.CylinderGeometry(0.046, 0.050, 0.045, 12);
  hub.rotateX(Math.PI / 2);
  wheel.add(new THREE.Mesh(hub, trimMat));
  /* Just below and ahead of the eye, raked back toward the driver. */
  wheel.position.set(EYE.x, 1.00, 1.70);
  wheel.rotation.x = -0.38;
  root.add(wheel);

  for (const m of parts) { m.castShadow = false; m.receiveShadow = false; root.add(m); }
  root.traverse((o) => { o.frustumCulled = false; });

  return { root, wheel, instruments: inst,
           materials: [trimMat, alcMat, beltMat, ...inst.materials] };
}
