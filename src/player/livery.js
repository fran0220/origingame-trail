/* Rally livery, painted in object space.
 *
 * The car was a competent shell in one flat colour, and a single-colour car is
 * a road car however many vents it has. What identifies a rally car at a
 * glance is not its aerodynamics — it is that it is COVERED IN GRAPHICS: a
 * competition number on both doors and the roof, a hard division between two
 * or three colours, and sponsor blocks filling the panels between them. That
 * is the signal, and it was completely absent.
 *
 * It is painted procedurally in the fragment shader rather than modelled or
 * textured, for the same reason as everything else here: no assets. The body
 * has no UV map and does not need one. Every graphic is a function of the
 * OBJECT-SPACE position of the fragment, projected onto whichever of the car's
 * faces it belongs to, and selected by the surface normal:
 *
 *   the doors and quarters are seen along X, so they take a side projection;
 *   the bonnet, roof and boot are seen along Y, so they take a plan
 *   projection.
 *
 * Blending the two by the normal is a two-plane triplanar map. It costs
 * nothing, it wraps around the arches and the shut lines without a seam
 * because the shell is one continuous loft, and — the part that matters for a
 * procedural car — a graphic stays put when the body sections are retuned,
 * which a hand-placed decal would not.
 */
export const LIVERY_PARS = /* glsl */ `
  varying vec3 vCarLocal;
  varying vec3 vCarNrm;

  /* A blocky competition numeral. Rally numbers are stencils, so a
   * seven-segment construction is not a compromise here — it is close to what
   * is actually on the door. p is in "digit space": 0..1 across, 0..1 up. */
  float segBar(vec2 p, vec2 c, vec2 h) {
    vec2 d = abs(p - c) - h;
    return (max(d.x, d.y) < 0.0) ? 1.0 : 0.0;
  }
  float digit(vec2 p, int n) {
    if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return 0.0;
    float t = 0.115;                 // stroke half-thickness
    float a = segBar(p, vec2(0.50, 1.00 - t), vec2(0.38, t));   // top
    float b = segBar(p, vec2(0.88, 0.75), vec2(t, 0.25));       // upper right
    float c = segBar(p, vec2(0.88, 0.25), vec2(t, 0.25));       // lower right
    float d = segBar(p, vec2(0.50, t), vec2(0.38, t));          // bottom
    float e = segBar(p, vec2(0.12, 0.25), vec2(t, 0.25));       // lower left
    float f = segBar(p, vec2(0.12, 0.75), vec2(t, 0.25));       // upper left
    float g = segBar(p, vec2(0.50, 0.50), vec2(0.38, t));       // middle
    if (n == 0) return max(max(max(a,b),max(c,d)),max(e,f));
    if (n == 1) return max(b, c);
    if (n == 2) return max(max(max(a,b),max(g,e)), d);
    if (n == 3) return max(max(max(a,b),max(g,c)), d);
    if (n == 4) return max(max(f,b), max(g,c));
    if (n == 5) return max(max(max(a,f),max(g,c)), d);
    if (n == 6) return max(max(max(a,f),max(g,c)), max(d,e));
    if (n == 7) return max(a, max(b, c));
    if (n == 8) return max(max(max(a,b),max(c,d)),max(max(e,f),g));
    return max(max(max(a,b),max(c,d)),max(max(f,g),g));
  }

  /* A rounded rectangle, used for sponsor blocks. */
  float panel(vec2 p, vec2 c, vec2 h, float r) {
    vec2 d = abs(p - c) - h + r;
    return 1.0 - step(0.0, length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r);
  }
`;

export const LIVERY_BODY = /* glsl */ `
  {
    vec3 lp = vCarLocal;
    vec3 nr = normalize(vCarNrm);

    /* Which face is this fragment on. */
    float sideFace = smoothstep(0.35, 0.80, abs(nr.x));
    float topFace  = smoothstep(0.35, 0.80, abs(nr.y)) * step(0.0, nr.y);

    vec3 WHITE  = vec3(0.780, 0.790, 0.800);
    vec3 ACCENT = vec3(0.780, 0.120, 0.075);
    vec3 GOLD   = vec3(0.720, 0.520, 0.075);
    vec3 INK    = vec3(0.020, 0.024, 0.030);

    vec3 col = diffuseColor.rgb;

    /* ── the two-tone break ──────────────────────────────────────────────
     * A hard diagonal across the flank, low at the nose and rising over the
     * rear arch. Rally schemes almost always break the body in two like this,
     * and the diagonal is what stops it reading as a bus stripe. */
    float breakLine = 0.62 + lp.z * 0.085;
    float upper = smoothstep(breakLine - 0.02, breakLine + 0.02, lp.y);
    col = mix(col, WHITE, upper * sideFace * 0.92);
    col = mix(col, WHITE, upper * topFace * 0.92);

    /* A thin accent stripe riding the break. */
    float stripe = smoothstep(0.030, 0.012, abs(lp.y - breakLine + 0.055));
    col = mix(col, ACCENT, stripe * max(sideFace, topFace) * 0.95);

    /* ── the sill ────────────────────────────────────────────────────────── */
    float sill = 1.0 - smoothstep(0.34, 0.395, lp.y);
    col = mix(col, INK, sill * sideFace * 0.85);

    /* ── door roundel and number ──────────────────────────────────────────
     *
     * ON THE DOOR, below the two-tone break, which is where it goes and also
     * the only place it can be seen. The first attempt centred it at y = 0.80
     * — above the break, so a white disc was drawn on white bodywork and
     * vanished, leaving the digits floating in the middle of nothing. The
     * roundel exists to give the number a contrasting ground; putting it on
     * the same colour is the one placement that defeats its whole purpose. */
    vec2 sideP = vec2(lp.z, lp.y);
    /* MEASURED, not guessed. The body's object space runs x -1..1,
     * y 0.15..1.49 and z -0.89..3.46 with the origin at the tail and the nose
     * forward, so the doors sit around z = 1.35 and the waist around y = 0.62.
     * Both earlier attempts placed this from imagination — first at y = 0.80
     * where it was white on white, then at z = 0.16 which is the rear
     * bumper — and neither survived a look. */
    float disc = 1.0 - smoothstep(0.255, 0.275,
                    length((sideP - vec2(1.35, 0.62)) * vec2(0.72, 1.0)));
    col = mix(col, WHITE, disc * sideFace);
    /* Two digits, "1" and "4", sized to sit inside the disc with a margin. */
    vec2 dsp  = (sideP - vec2(1.14, 0.505)) / vec2(0.175, 0.235);
    float num = digit(dsp, 1);
    vec2 dsp2 = (sideP - vec2(1.38, 0.505)) / vec2(0.175, 0.235);
    num = max(num, digit(dsp2, 4));
    col = mix(col, INK, num * disc * sideFace);

    /* ── roof number, read from above by a helicopter and a spectator on a
     * bank, which is exactly why every rally car carries one ──────────────── */
    vec2 topP = vec2(lp.x, lp.z);
    float roof = smoothstep(0.55, 0.75, lp.y);
    vec2 rd = (vec2(-topP.x, topP.y) - vec2(-0.34, 0.92)) / vec2(0.30, 0.46);
    float rnum = digit(rd, 1);
    vec2 rd2 = (vec2(-topP.x, topP.y) - vec2(0.04, 0.92)) / vec2(0.30, 0.46);
    rnum = max(rnum, digit(rd2, 4));
    col = mix(col, INK, rnum * topFace * roof);

    /* ── sponsor blocks ──────────────────────────────────────────────────── */
    float blk = panel(sideP, vec2(0.35, 0.58), vec2(0.34, 0.080), 0.02);
    col = mix(col, ACCENT, blk * sideFace * 0.9);
    float blk2 = panel(sideP, vec2(2.45, 0.98), vec2(0.30, 0.070), 0.02);
    col = mix(col, GOLD, blk2 * sideFace * 0.85);
    /* Bonnet block, ahead of the screen. */
    float bon = panel(topP, vec2(0.0, 2.95), vec2(0.34, 0.11), 0.03);
    col = mix(col, ACCENT, bon * topFace * 0.85);

    diffuseColor.rgb = col;
  }
`;
