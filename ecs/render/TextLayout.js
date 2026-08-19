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

// ── NativeFont layout (Canvas2D text metrics) ───────────────────────────────
//
// NativeFont cannot produce glyph records, so its layout does not go through
// the bitmap pipeline at all. Instead the whole string is measured once with
// `ctx.measureText()` and the surface bounds come from the returned
// `TextMetrics` (ink box + alphabetic baseline), the same facts the rasterizer
// needs to place a single `fillText`. The two font kinds therefore produce the
// SAME retained layout target — `{ drawX, width, height }` plus surface-local
// draw origin — just from different measurement sources. No per-character
// `{ region, advance, offsetX, offsetY }` record is fabricated.

// The default logical font size for retained native text, before entity scale.
// This is the "logical text size" end of the resolution chain:
//   logical size (NATIVE_FONT_DEFAULT_SIZE / Text.fontSize)
//     → rasterization resolution (the surface, 1:1 device pixels today)
//     → texture dimensions (surface.width × surface.height)
//   final on-screen size = surface size × Transform.scale.
// A future resolution policy (e.g. rasterizing at device-pixel-ratio) can plug
// into the middle step without changing the Text API.
export const NATIVE_FONT_DEFAULT_SIZE = 16;

let _measureCanvas = null;
let _measureCtx = null;

// A single shared hidden 2D context used for text measurement only. It is
// never drawn to; `TextSystem` measures native text through it before the
// surface exists. Lazily created so environments without `document` (and tests
// that stub it) only allocate when native text is actually laid out.
function _measureContext() {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    if (!_measureCanvas) {
      _measureCanvas = document.createElement("canvas");
      _measureCtx = _measureCanvas.getContext ? _measureCanvas.getContext("2d") : null;
    }
  }
  return _measureCtx || null;
}

// Measures a string for retained native rasterization using Canvas2D text
// metrics. Returns:
//   {
//     px,         // final pixel size the metrics were measured at
//     total,      // advance width (m.width)
//     inkLeft,    // actualBoundingBoxLeft (0 when the API is unavailable)
//     inkRight,   // actualBoundingBoxRight (falls back to the advance width)
//     ascent,     // actualBoundingBoxAscent (falls back to fontBoundingBox,
//                 // then a fraction of px)
//     descent,    // actualBoundingBoxDescent (same fallback chain)
//     width,      // ink box width  = inkLeft + inkRight
//     height,     // ink box height = ascent + descent
//   }
// The ink box is what the raster surface must contain to never clip glyphs
// (italic overhangs land in inkLeft; descenders in descent). When the browser
// does not provide actualBoundingBox*, the advance width + font bounding box
// are the documented fallbacks.
export function measureNativeText(font, content, options = {}, ctx) {
  const str = String(content);
  const size = options.size != null ? options.size : NATIVE_FONT_DEFAULT_SIZE;
  const scale = options.scale != null ? options.scale : 1;
  const px = size * scale;
  const c = ctx || _measureContext();

  let total = 0;
  let inkLeft = 0;
  let inkRight = 0;
  let ascent = px * 0.8;
  let descent = px * 0.2;

  if (c && typeof c.measureText === "function") {
    font.applyToContext(c, px, options);
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    const m = c.measureText(str);
    total = m.width || 0;
    if (typeof m.actualBoundingBoxLeft === "number") inkLeft = m.actualBoundingBoxLeft;
    if (typeof m.actualBoundingBoxRight === "number") inkRight = m.actualBoundingBoxRight;
    else inkRight = total;
    if (typeof m.actualBoundingBoxAscent === "number") ascent = m.actualBoundingBoxAscent;
    else if (typeof m.fontBoundingBoxAscent === "number") ascent = m.fontBoundingBoxAscent;
    else ascent = px * 0.8;
    if (typeof m.actualBoundingBoxDescent === "number") descent = m.actualBoundingBoxDescent;
    else if (typeof m.fontBoundingBoxDescent === "number") descent = m.fontBoundingBoxDescent;
    else descent = px * 0.2;
  }

  return { px, total, inkLeft, inkRight, ascent, descent, width: inkLeft + inkRight, height: ascent + descent };
}

// Native layout: refills the shared layout target with the measured string
// bounds. The surface-local coordinate system is identical to the bitmap
// layout's — x = 0 is the left edge of the ink, y = 0 is the top of the ink —
// and `nativeX`/`nativeY` record where the alphabetic baseline origin must sit
// so one `fillText` lands exactly inside that box:
//
//   width  = inkLeft + inkRight
//   height = ascent + descent
//   drawX  = startX + inkLeft   (startX = 0 | -total/2 | -total by align)
//   fillText(text, -inkLeft, ascent)  → ink box fills [0..width] × [0..height]
//
// `drawX` mirrors the bitmap model exactly: how far the surface's left edge
// sits from the anchor point (0 left, -total/2 center, -total right, nudged by
// the ink left edge). The surface is therefore reusable when only the entity
// transform changes.
//
// `count` stays 0 — there are no glyph placements; the rasterizer draws the
// whole string in one `fillText`. `glyphs`/`chars` are emptied so a layout
// reused after a font change can never leak bitmap placements into the native
// path.
export function layoutNativeText(target, font, content, align, letterSpacing, fontSize) {
  const str = String(content);
  const m = measureNativeText(font, str, { size: fontSize || NATIVE_FONT_DEFAULT_SIZE });

  // The advance total drives alignment; Canvas2D cannot apply per-letter
  // spacing, so letterSpacing only widens the advance used for centering /
  // right-aligning, never the ink box itself.
  let total = m.total;
  if (letterSpacing && str.length > 1) total += letterSpacing * (str.length - 1);

  let startX = 0;
  if (align === 1) startX = -total / 2;
  else if (align === 2) startX = -total;

  const empty = str.length === 0;
  target.count = 0;
  target.glyphs.length = 0;
  target.chars.length = 0;
  target.width = empty ? 0 : m.width;
  target.height = empty ? 0 : m.height;
  target.drawX = empty ? 0 : startX + m.inkLeft;
  target.nativeX = -m.inkLeft;
  target.nativeY = m.ascent;
  target.fontSize = m.px;
  return target;
}
