// Rasterizes a cached text layout into a single bitmap surface.
//
// The rasterizer is the first consumer of the glyph-region contract: it draws
// each placement's region rect — `region.sourceImage` cut at `sx/sy/sw/sh` —
// into the final text surface. It does not care whether `sourceImage` is an
// individual glyph canvas or a shared font atlas; that distinction belongs
// entirely to the font resource. The result is one canvas containing the
// entire rendered text, which the renderer consumes as a single textured quad.
//
// `layout` is the cached layout produced by `TextLayout.layoutText` and stored
// by `TextResourcePool`:
//   { glyphs, chars, positions, count, drawX, width, height }
// where `glyphs[i]` is the placement's stable glyph record, `chars[i]` its
// character (used to resolve the tinted record), and `positions[i*2]` /
// `positions[i*2+1]` its surface-local coordinates.
//
// `tint` is a color string (e.g. "#ff0000") to apply to the glyph body, or
// `null` to keep the font's own pixels. Draws into `ctx`; returns nothing.
export function rasterizeText(ctx, font, layout, tint) {
  const glyphs = layout.glyphs;
  const chars = layout.chars;
  const positions = layout.positions;
  const count = layout.count;
  for (let i = 0; i < count; i++) {
    const rec = tint ? font.getTintedGlyph(chars[i], tint) : glyphs[i];
    if (!rec) continue;
    const r = rec.region;
    ctx.drawImage(
      r.sourceImage, r.sx, r.sy, r.sw, r.sh,
      positions[i * 2], positions[i * 2 + 1], r.sw, r.sh,
    );
  }
}
