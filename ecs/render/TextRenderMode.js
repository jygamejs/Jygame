// TextRenderMode — the rendering representation a Text entity uses.
//
// Both modes consume the same TextLayout and the same glyph-region contract;
// they differ only in how the layout is turned into RenderQueue commands:
//
//   RASTERIZED (0, default) — glyphs are composited into one cached surface,
//     emitted as a single RenderQueue command.  Best for static or rarely
//     changing text; minimizes render work.
//
//   GLYPH (1) — each glyph stays an independent RenderQueue command, batched
//     by texture by the existing instanced quad infrastructure.  Best for
//     per-glyph control (future animation, effects).
//
// The mode lives in the `Text` component as a compact `u8` — no renderer
// object or reference ever enters ECS state.
export const TextRenderMode = {
  RASTERIZED: 0,
  GLYPH: 1,
};
