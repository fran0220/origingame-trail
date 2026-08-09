/* The instruments, for the cockpit view.
 *
 * A binnacle with nothing in it is worse than no binnacle: the eye goes
 * straight to the one place on a dashboard that is supposed to be telling you
 * something, and finds a smooth black lump.
 *
 * WHAT A COMPETITION DASH ACTUALLY HAS, which is not what a road car has:
 *
 *   ONE BIG TACHOMETER, centred, and nothing competing with it. A rally driver
 *   changes gear by ear and by the shift lights; the tacho is there for the
 *   times the noise is wrong. Road cars put a speedometer of equal size beside
 *   it because road cars are driven to a speed limit.
 *
 *   THE DIAL ROTATED so the useful range is at the top. On a road car 0 rpm is
 *   at seven o'clock and the redline is somewhere off to the right where you
 *   have to look for it; on a competition dial the band you actually use sits
 *   under the needle's vertical, so a glance reads it without interpretation.
 *
 *   SHIFT LIGHTS across the top, which come on before the limiter rather than
 *   at it — they are a cue to act, and a cue that arrives at the event it is
 *   warning about is not a cue.
 *
 * The needle is a separate object because it moves; everything else is baked
 * into one geometry. Marks are drawn as geometry rather than as a texture for
 * the usual reason: no assets, and a dial drawn at 512 pixels would be blurry
 * at the distance a cockpit camera sits from it anyway.
 */
import * as THREE from 'three';

const SWEEP_START = -2.44;   // rad, where 0 rpm sits
const SWEEP_END = 2.44;      // rad, where the limiter sits
const REDLINE = 6350 / 6800; // fraction of the sweep the red band starts at

/**
 * Build the cluster.
 *
 * @returns {{ root, needle, shiftLights, materials }}
 */
export function buildInstruments(detail = 1) {
  const root = new THREE.Group();
  root.name = 'car-instruments';

  const faceMat = new THREE.MeshStandardMaterial({
    name: 'inst-face', color: new THREE.Color(0x07080a),
    roughness: 0.86, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.2,
  });
  /* The marks and the needle are EMISSIVE. A dial lit only by the ambient
   * light inside a dark cabin is unreadable, and every real competition dash
   * is backlit for exactly that reason — it is not a stylistic choice. */
  const markMat = new THREE.MeshStandardMaterial({
    name: 'inst-mark', color: new THREE.Color(0x0a0a0a),
    emissive: new THREE.Color(0xd8e4ee), emissiveIntensity: 1.0,
    roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide,
  });
  const redMat = new THREE.MeshStandardMaterial({
    name: 'inst-red', color: new THREE.Color(0x0a0000),
    emissive: new THREE.Color(0xd8321e), emissiveIntensity: 1.0,
    roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide,
  });
  const needleMat = new THREE.MeshStandardMaterial({
    name: 'inst-needle', color: new THREE.Color(0x160303),
    emissive: new THREE.Color(0xf05a2a), emissiveIntensity: 1.2,
    roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
  });

  const R = 0.082;
  const parts = [];
  const push = (geo, mat) => parts.push(new THREE.Mesh(geo, mat));

  /* Dial face. */
  const face = new THREE.CircleGeometry(R, detail > 0 ? 32 : 16);
  push(face, faceMat);

  /* Marks. One per 1000 rpm, with the last two red. The dial reads to 8. */
  const MARKS = 8;
  for (let i = 0; i <= MARKS; i++) {
    const u = i / MARKS;
    const a = SWEEP_START + (SWEEP_END - SWEEP_START) * u;
    const major = i % 1 === 0;
    const len = major ? 0.020 : 0.012;
    const g = new THREE.PlaneGeometry(0.0055, len);
    g.translate(0, R - len * 0.5 - 0.006, 0);
    /* The cluster is yawed by PI to face the driver — see cockpit.js — so the
     * frame the marks are drawn in is mirrored relative to the one they are
     * specified in. This sign puts 0 rpm at seven o'clock and the redline
     * between two and five, which is where a dial reads correctly from the
     * seat.
     *
     * The needle takes the OPPOSITE sign, and that is not an inconsistency to
     * be tidied away: the marks are built as geometry inside this mirrored
     * space, while the needle is a node rotated at runtime in the group's own
     * space. Making them match cost a render, because with both flipped the
     * dial looked plausible and the needle simply fell as the engine revved. */
    g.rotateZ(-a);
    g.translate(0, 0, 0.0016);
    push(g, u >= REDLINE ? redMat : markMat);
  }

  /* Needle. Its own group so it turns about the hub rather than swinging
   * across the dial — the same trap as the steering wheel. */
  const needle = new THREE.Group();
  needle.name = 'inst-needle';
  const nGeo = new THREE.PlaneGeometry(0.0075, R * 0.86);
  nGeo.translate(0, R * 0.40, 0);
  needle.add(new THREE.Mesh(nGeo, needleMat));
  const hub = new THREE.CircleGeometry(0.011, 12);
  needle.add(new THREE.Mesh(hub, needleMat));
  needle.position.z = 0.003;
  root.add(needle);

  /* Shift lights: five across the top of the binnacle, dark until asked. */
  const shiftLights = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({
      name: `inst-shift-${i}`, color: new THREE.Color(0x0a0a0a),
      emissive: new THREE.Color(i < 3 ? 0x30d848 : i < 4 ? 0xe8b820 : 0xe8281e),
      emissiveIntensity: 0.0,
      roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
    });
    const g = new THREE.CircleGeometry(0.0085, 10);
    g.translate((i - 2) * 0.026, R + 0.020, 0.002);
    root.add(new THREE.Mesh(g, m));
    shiftLights.push(m);
  }

  for (const m of parts) root.add(m);
  root.traverse((o) => { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; });

  return {
    root, needle, shiftLights,
    materials: [faceMat, markMat, redMat, needleMat, ...shiftLights],
  };
}

/**
 * Point the needle and light the lamps.
 *
 * @param {object} inst   what buildInstruments returned
 * @param {number} rpm
 * @param {number} limit  redline rpm
 */
export function setInstruments(inst, rpm, limit = 6800) {
  if (!inst) return;
  const u = Math.max(0, Math.min(1, rpm / limit));
  /* Same sign as the marks. Both are specified in the group's own space and
   * both are seen through the PI yaw that turns the cluster toward the driver,
   * so they have to agree — and checking that they do took two renders,
   * because a needle mirrored about the vertical still looks like a needle. */
  inst.needle.rotation.z = -(SWEEP_START + (SWEEP_END - SWEEP_START) * u);
  /* Lights come up in sequence from about 70% of the limiter. Sequential
   * rather than all at once: the sequence is the information. */
  for (let i = 0; i < inst.shiftLights.length; i++) {
    const on = u > 0.70 + i * 0.055;
    inst.shiftLights[i].emissiveIntensity = on ? 1.6 : 0.0;
  }
}
