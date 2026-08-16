// Lays out a text string from the font's glyph records.
//
// TextLayout is the renderer-independent stage between the font and the
// rasterizer. It consumes only glyph records — `{ region, advance, offsetX,
// offsetY }` — and emits glyph references plus surface-local positions. It
// never touches a Canvas, a texture cache, WebGL, WebGPU, or any concrete
// image representation: the glyph's `region` is read purely for its sw/sh
// box so the geometry is correct regardless of what `region.sourceImage` is.
//
// `target` is the reusable layout structure owned by `TextResourcePool` and
// refilled in place (no allocation — `positions` grows geometrically only
// when the content gets longer):
//
//   {
//     glyphs,     // (stable glyph record | undefined)[i] for placement i
//     chars,      // the character that produced placement i (for tint lookup)
//     positions,  // Float32Array of x/y pairs per placement, normalized so
//                 // the leftmost glyph sits at x = 0 (surface coordinates)
//     count,      // number of placements (characters without a glyph are
//                 // skipped, but their advance still applies)
//     drawX,      // the anchor offset — how far the surface's left edge sits
//                 // from the anchor point (0 for left, -width/2 for center,
//                 // -width for right, possibly nudged by offsetX)
//     width,      // laid-out extent of the whole string
//     height,     // tallest glyph box in the string
//   }
//
// Returns the same `target` object.
export function layoutText(target, font, content, align, letterSpacing) {
  const str = content;

  let total = 0;
  for (let k = 0; k < str.length; k++) total += font.advance(str[k]) + letterSpacing;

  let startX = 0;
  if (align === 1) startX = -total / 2;
  else if (align === 2) startX = -total;

  const glyphCount = str.length;
  const curGlyphs = target.positions.length / 2;
  if (curGlyphs < glyphCount) {
    let newGlyphs = curGlyphs === 0 ? 1 : curGlyphs;
    while (newGlyphs < glyphCount) newGlyphs *= 2;
    const newPositions = new Float32Array(newGlyphs * 2);
    newPositions.set(target.positions);
    target.positions = newPositions;
  }

  const glyphs = target.glyphs;
  const chars = target.chars;
  const pos = target.positions;

  let cx = startX;
  let n = 0;
  let minX = Infinity;
  let maxRight = -Infinity;
  let maxH = 0;
  for (let k = 0; k < glyphCount; k++) {
    const ch = str[k];
    const glyph = font.getGlyph(ch);
    const adv = font.advance(ch) + letterSpacing;
    if (glyph) {
      const x = cx + glyph.offsetX;
      const y = glyph.offsetY;
      const w = glyph.region.sw;
      const h = glyph.region.sh;
      glyphs[n] = glyph;
      chars[n] = ch;
      pos[n * 2] = x;
      pos[n * 2 + 1] = y;
      if (x < minX) minX = x;
      const right = x + w;
      if (right > maxRight) maxRight = right;
      if (h > maxH) maxH = h;
      n++;
    }
    cx += adv;
  }

  glyphs.length = n;
  chars.length = n;
  target.count = n;

  if (n === 0) {
    target.drawX = 0;
    target.width = 0;
    target.height = 0;
    return target;
  }

  const width = maxRight - minX;
  target.drawX = minX;
  target.width = width;
  target.height = maxH;
  if (minX !== 0) {
    for (let i = 0; i < n; i++) pos[i * 2] -= minX;
  }
  return target;
}
