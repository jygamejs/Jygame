// TextRenderMode — the rendering representation a Text entity uses.
//
// Both modes consume the same TextLayout and the same glyph-region contract;
// they differ only in how the layout is turned into RenderQueue commands:
//
//   GLYPH (0) — each glyph stays an independent RenderQueue command, batched
//     by texture by the existing instanced quad infrastructure.  Best for
//     per-glyph control (future animation, effects).  Value 0 is the ECS `u8`
//     zero-fill, so a raw ECS text entity without an explicit mode is glyph.
//
//   RASTERIZED (1) — glyphs are composited into one cached surface, emitted
//     as a single RenderQueue command.  Best for static or rarely changing
//     text; minimizes render work.
//
// The `Text` facade picks the default mode automatically from the font's
// capabilities (GLYPH for bitmap fonts, RASTERIZED for native fonts) unless an
// explicit `renderMode` is given.
//
// The mode lives in the `Text` component as a compact `u8` — no renderer
// object or reference ever enters ECS state.
export const TextRenderMode = {
  GLYPH: 0,
  RASTERIZED: 1,
  // Alias for the rasterized representation. RASTERIZED is the canonical name;
  // RASTER exists so capability checks and docs can speak in glyph/raster terms.
  RASTER: 1,
};

// The display name of a render mode, used in capability errors. Mirrors the
// font capability keys ("glyph" / "raster").
export function renderModeName(mode) {
  return mode === TextRenderMode.RASTERIZED ? "raster" : "glyph";
}
