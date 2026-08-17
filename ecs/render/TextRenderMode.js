// TextRenderMode — the rendering representation a Text entity uses.
//
// Both modes consume the same TextLayout and the same glyph-region contract;
// they differ only in how the layout is turned into RenderQueue commands:
//
//   GLYPH (0, default) — each glyph stays an independent RenderQueue command,
//     batched by texture by the existing instanced quad infrastructure.  Best
//     for per-glyph control (future animation, effects).  Value 0 is the
//     default: a bare `new Text(...)` renders in glyph mode without any
//     opt-in, because the ECS `u8` field zero-fills to it.
//
//   RASTERIZED (1) — glyphs are composited into one cached surface, emitted
//     as a single RenderQueue command.  Best for static or rarely changing
//     text; minimizes render work.
//
// The mode lives in the `Text` component as a compact `u8` — no renderer
// object or reference ever enters ECS state.
export const TextRenderMode = {
  GLYPH: 0,
  RASTERIZED: 1,
};
