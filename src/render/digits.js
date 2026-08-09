/* Seven-segment numerals and a rounded panel, as GLSL.
 *
 * Written for the car's door numbers, and now also drawn on the stage's
 * distance boards. Extracted here rather than copied, because the second user
 * would otherwise be a second implementation of the same glyphs — and glyphs
 * that disagree between two objects in the same scene are worse than either
 * shape being wrong, since the eye reads them as different typefaces and
 * therefore as different systems.
 *
 * Seven segments is not a compromise for either user. Rally competition
 * numbers are stencils and road distance boards are cut vinyl; both are
 * blocky, and a smooth typeface on either would be the anachronism.
 *
 * All of it is pure GLSL in `p`-space: x and y from 0 to 1 across one digit.
 * Nothing here knows how it is projected, which is what lets the car map it
 * through an object-space triplanar and the boards map it through a flat
 * panel UV without either knowing about the other.
 */

export const DIGIT_GLSL = /* glsl */ `
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

  /* A rounded rectangle: sponsor blocks on the car, board grounds on the
   * stage markers. */
  float panel(vec2 p, vec2 c, vec2 h, float r) {
    vec2 d = abs(p - c) - h + r;
    return 1.0 - step(0.0, length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r);
  }
  /* A whole number, right-aligned in a box, up to three digits. Returns
   * coverage. Leading zeros are suppressed, because a board reading "007"
   * is a lift indicator, not a kilometre marker. */
  float number(vec2 p, int value, float w, float gap) {
    float cov = 0.0;
    int v = value;
    for (int slot = 0; slot < 3; slot++) {
      int d = v - (v / 10) * 10;
      vec2 q = vec2((p.x - (1.0 - float(slot + 1) * (w + gap))) / w, p.y);
      cov = max(cov, digit(q, d));
      v = v / 10;
      if (v == 0) break;
    }
    return cov;
  }
`;
