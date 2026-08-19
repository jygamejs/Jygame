// Rasterizes a cached text layout into a single bitmap surface.
//
// The rasterizer is the first consumer of the glyph-region contract: it draws
// each placement's region rect — `region.sourceImage` cut at `sx/sy/sw/sh` —
// into the final text surface. It does not care whether `sourceImage` is an
// individual glyph canvas or a shared font atlas; that distinction belongs
// entirely to the font resource. The result is one canvas containing the
// entire rendered text, which the renderer consumes as a single textured quad.
//
// The rasterizer also handles NativeFont text: fonts without glyph records
// (no `getGlyph`) are rasterized with a single `fillText` from the metrics the
// native layout stored (`layout.nativeX`/`nativeY`/`fontSize`). Either way the
// output is the SAME representation — one cached bitmap surface — and the
// renderer never knows which font kind produced it.
//
// `layout` is the cached layout produced by `TextLayout.layoutText` /
// `TextLayout.layoutNativeText` and stored by `TextResourcePool`:
//   { glyphs, chars, positions, count, drawX, width, height }
// where `glyphs[i]` is the placement's stable glyph record, `chars[i]` its
// character (used to resolve the tinted record), and `positions[i*2]` /
// `positions[i*2+1]` its surface-local coordinates. Native layouts carry
// `nativeX`/`nativeY`/`fontSize` instead and leave `count` at 0.
//
// `tint` is a color string (e.g. "#ff0000") to apply to the glyph body, or
// `null` to keep the font's own pixels. For native fonts `tint` (or the white
// default) is the real `fillStyle` of the `fillText`. `content` is the string,
// only needed by the native path. Draws into `ctx`; returns nothing.
import { NATIVE_FONT_DEFAULT_SIZE } from "./TextLayout.js";

export function rasterizeText(ctx, font, layout, tint, content) {
  if (typeof font.getGlyph !== "function") {
    // NativeFont rasterization ends here: one cached surface, exactly like the
    // bitmap path. Everything downstream is generic retained-text rendering.
    rasterizeNativeText(ctx, font, content, layout, tint || "#ffffff");
    return;
  }

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

// Rasterizes a whole native string into the surface with one `fillText`. The
// surface-local origin comes from the layout: the alphabetic baseline sits at
// `layout.nativeY` above the ink top, the left alignment origin at
// `layout.nativeX` right of the ink left edge. Color is baked directly into
// the pixels (fillStyle) — there are no glyph colors to tint, so `"#ffffff"`
// genuinely produces white.
export function rasterizeNativeText(ctx, font, content, layout, color) {
  font.applyToContext(ctx, layout.fontSize || NATIVE_FONT_DEFAULT_SIZE);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color || "#ffffff";
  ctx.fillText(String(content), layout.nativeX || 0, layout.nativeY || 0);
}
