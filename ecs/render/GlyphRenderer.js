// GlyphRenderer — turns a laid-out text into per-glyph RenderQueue commands.
//
// This is the second consumer of the glyph-region contract (the first being
// TextRasterizer).  Where the rasterizer composites every glyph into one
// cached surface, GlyphRenderer emits one RenderQueue command per glyph —
// each glyph stays an independent rendering primitive that the existing
// QuadBatch / WgpuSpriteBatch infrastructure batches by texture automatically.
//
// The three exported functions form a pipeline:
//
//   fillGlyphBuffer(buffer, layout, font, tint)
//       ↓
//   GlyphBuffer   (reusable, SoA — glyph centers in entity-local space)
//       ↓
//   pushGlyphs(queue, buffer, tx, ty, ...)
//       ↓
//   RenderQueue   (N pooled commands, consumed by Canvas / WebGL / WebGPU)
//
// `fillGlyphBuffer` and `pushGlyphs` are separated so future animation can
// modify the buffer between the two steps (per-glyph position, rotation,
// scale, color).  `renderGlyphs` is a convenience that calls both.
//
// ── Coordinate model ──────────────────────────────────────────────────────
//
// Layout positions are in "surface-local" coordinates: x = 0 at the
// leftmost glyph's left edge, y = 0 at the top.  The text surface is
// `layout.width × layout.height` and is centered on the entity anchor
// (the same convention the rasterized path uses).
//
// `fillGlyphBuffer` converts each glyph's layout position to an
// entity-local center:
//
//   local_cx = gx + sw/2 − width/2
//   local_cy = gy + sh/2 − height/2
//
// `pushGlyphs` then applies the entity's world transform (position,
// rotation, scale) to place the glyph in world space.  The renderer
// draws each glyph image centered at its world position, with the
// entity's rotation/scale applied — matching the existing quad-batch
// vertex shader convention (the image is centered at (0, 0) in local
// space, extends ±width/2, ±height/2, and the instance position is
// the center).
//
// ── Layer / depth / ordering ──────────────────────────────────────────────
//
// Every glyph command from one entity carries the same layer, depth,
// and fillColor.  The RenderQueue sorts by (layer → depth → insertion
// order), so all N glyph commands sort together and interleave with
// sprites at the same layer/depth — identical ordering semantics to
// the rasterized single-command path.
//
// ── Atlas batching ────────────────────────────────────────────────────────
//
// When glyphs share a single atlas sourceImage, the GPU texture cache
// keys them to one texture.  The existing QuadBatch / WgpuSpriteBatch
// breaks only on texture change, so atlas-backed glyphs naturally land
// in one instanced draw call — no special batching logic needed.

import { GlyphBuffer } from "./GlyphBuffer.js";

// ── Step 1: fill the buffer from a layout ─────────────────────────────────

// Resolves each glyph record (applying `tint` when set) and stores the
// glyph's source region and entity-local center position in `buffer`.
// The buffer is cleared first and reused across frames — no allocation
// in steady state.
export function fillGlyphBuffer(buffer, layout, font, tint) {
  buffer.clear();
  const glyphs = layout.glyphs;
  const chars = layout.chars;
  const positions = layout.positions;
  const count = layout.count;
  if (count === 0) return;

  const hw = layout.width / 2;
  const hh = layout.height / 2;

  for (let i = 0; i < count; i++) {
    const rec = tint ? font.getTintedGlyph(chars[i], tint) : glyphs[i];
    if (!rec) continue;
    const r = rec.region;
    const gx = positions[i * 2];
    const gy = positions[i * 2 + 1];
    // Glyph center relative to the text surface center (entity-local).
    const cx = gx + r.sw / 2 - hw;
    const cy = gy + r.sh / 2 - hh;
    buffer.push(r.sourceImage, r.sx, r.sy, r.sw, r.sh, cx, cy);
  }
}

// ── Step 2: push the buffer into the RenderQueue ──────────────────────────

// Applies the entity's world transform (position, rotation, scale) to
// each glyph's local position and pushes one pooled RenderQueue command
// per glyph.  The queue reuses command objects — no allocation after
// warmup.
//
// `tpx/tpy` are the entity's previous-tick position for interpolation;
// `trot/tsx/tsy` are the current-tick rotation and scale.  When
// interpolation is disabled, `tpx/tpy` should equal `tx/ty`.
export function pushGlyphs(queue, buffer, tx, ty, trot, tsx, tsy, tpx, tpy, canInterp, layer, depth, fillColor, imageSmoothing) {
  const count = buffer.count;
  if (count === 0) return;

  const cos = Math.cos(trot);
  const sin = Math.sin(trot);
  const prevX = canInterp && tpx != null ? tpx : tx;
  const prevY = canInterp && tpy != null ? tpy : ty;

  const srcImg = buffer._sourceImage;
  const sx = buffer._sx;
  const sy = buffer._sy;
  const sw = buffer._sw;
  const sh = buffer._sh;
  const lx = buffer._x;
  const ly = buffer._y;

  for (let i = 0; i < count; i++) {
    const lxi = lx[i];
    const lyi = ly[i];
    // Current-tick world position (glyph center).
    const dx = tx + cos * lxi * tsx - sin * lyi * tsy;
    const dy = ty + sin * lxi * tsx + cos * lyi * tsy;
    // Previous-tick world position (same transform, prev anchor).
    const pdx = prevX + cos * lxi * tsx - sin * lyi * tsy;
    const pdy = prevY + sin * lxi * tsx + cos * lyi * tsy;

    queue.push(
      srcImg[i], sx[i], sy[i], sw[i], sh[i],
      dx, dy,
      trot, tsx, tsy,
      sw[i], sh[i],
      fillColor, 0, layer, imageSmoothing, depth,
      pdx, pdy,
      canInterp
    );
  }
}

// ── Convenience: fill + push in one call ──────────────────────────────────

// Fills the buffer from the layout and immediately pushes N commands
// into the queue.  Equivalent to `fillGlyphBuffer` + `pushGlyphs` but
// avoids exposing the buffer to callers that don't need to modify it.
export function renderGlyphs(queue, buffer, layout, font, tint, tx, ty, trot, tsx, tsy, tpx, tpy, canInterp, layer, depth, fillColor, imageSmoothing) {
  fillGlyphBuffer(buffer, layout, font, tint);
  pushGlyphs(queue, buffer, tx, ty, trot, tsx, tsy, tpx, tpy, canInterp, layer, depth, fillColor, imageSmoothing);
}
