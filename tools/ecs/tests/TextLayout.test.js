import { describe, it } from "node:test";
import * as assert from "node:assert";
import { layoutText } from "../../../ecs/render/TextLayout.js";
import { rasterizeText } from "../../../ecs/render/TextRasterizer.js";

// ── helpers ────────────────────────────────────────────────────────────────

// A glyph record in the contract shape:
// { region: { sourceImage, sx, sy, sw, sh }, advance, offsetX, offsetY }
function glyphRecord(sourceImage, sx, sy, sw, sh, advance, offsetX = 0, offsetY = 0) {
  return { region: { sourceImage, sx, sy, sw, sh }, advance, offsetX, offsetY };
}

// A font-like glyph provider: exposes only the record contract
// (`getGlyph` / `advance`). It does not need to be a real BitmapFont.
function makeFont(map, spaceAdvance = 0) {
  return {
    getGlyph(ch) {
      return map[ch] || null;
    },
    advance(ch) {
      if (ch === " ") return spaceAdvance;
      const g = map[ch];
      return g ? g.advance : 0;
    },
  };
}

function makeTarget() {
  return {
    glyphs: [],
    chars: [],
    positions: new Float32Array(0),
    count: 0,
    drawX: 0,
    width: 0,
    height: 0,
  };
}

function makeCtx() {
  const calls = [];
  return {
    calls,
    drawImage(...args) {
      calls.push(args);
    },
  };
}

// ── layout consumes metrics, not the concrete image ────────────────────────

describe("TextLayout consumes glyph records", () => {
  it("uses the region box and metrics, not the source resource's dimensions", () => {
    // The source is much bigger than the glyph boxes — like a shared atlas.
    // Layout must derive geometry from region.sw/sh + advance, never from
    // sourceImage.width/height.
    const source = { width: 100, height: 100 };
    const font = makeFont({
      A: glyphRecord(source, 0, 0, 8, 12, 9),
      B: glyphRecord(source, 8, 0, 8, 12, 9),
    });

    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    assert.strictEqual(layout.count, 2);
    assert.strictEqual(layout.width, 17, "rightmost glyph right edge, not source width");
    assert.strictEqual(layout.height, 12, "tallest glyph box, not source height");
    assert.deepStrictEqual(Array.from(layout.positions), [0, 0, 9, 0]);
    assert.strictEqual(layout.drawX, 0);
  });

  it("honors explicit advance, offsetX, and offsetY", () => {
    const src = { width: 64, height: 32 };
    const font = makeFont({
      A: glyphRecord(src, 4, 2, 8, 12, 10, 1, 2),
      B: glyphRecord(src, 12, 2, 8, 12, 10, 3, 1),
    });

    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    assert.strictEqual(layout.count, 2);
    assert.deepStrictEqual(layout.glyphs, [font.getGlyph("A"), font.getGlyph("B")],
      "layout stores the stable glyph records");
    assert.strictEqual(layout.drawX, 1, "leftmost glyph sits at its offsetX");
    assert.deepStrictEqual(Array.from(layout.positions), [0, 2, 12, 1],
      "x normalized to surface-local; y carries the glyph's offsetY");
    assert.strictEqual(layout.width, 20);
    assert.strictEqual(layout.height, 12);
  });

  it("stores the same record objects layout after layout (no per-call allocation)", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const target = makeTarget();
    layoutText(target, font, "AB", 0, 0);
    const glyphs = target.glyphs;
    assert.strictEqual(glyphs[0], font.getGlyph("A"));
    assert.strictEqual(glyphs[1], font.getGlyph("B"));

    layoutText(target, font, "AB", 0, 0);
    assert.strictEqual(target.glyphs, glyphs, "glyphs array reused in place");
    assert.strictEqual(target.glyphs[0], font.getGlyph("A"), "records themselves are stable");
  });

  it("aligns around the anchor by shifting the whole layout", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });

    const left = layoutText(makeTarget(), font, "AB", 0, 0);
    const center = layoutText(makeTarget(), font, "AB", 1, 0);
    const right = layoutText(makeTarget(), font, "AB", 2, 0);

    assert.strictEqual(left.drawX, 0);
    assert.strictEqual(center.drawX, -9, "total advance 18 → half of it left of the anchor");
    assert.strictEqual(right.drawX, -18);
    for (const layout of [left, center, right]) {
      assert.deepStrictEqual(Array.from(layout.positions), [0, 0, 9, 0],
        "positions are surface-local regardless of alignment");
      assert.strictEqual(layout.width, 17);
    }
  });

  it("measures an empty string as zero", () => {
    const font = makeFont({ A: glyphRecord({ width: 8, height: 12 }, 0, 0, 8, 12, 9) });
    const layout = layoutText(makeTarget(), font, "", 0, 0);
    assert.strictEqual(layout.count, 0);
    assert.strictEqual(layout.width, 0);
    assert.strictEqual(layout.height, 0);
    assert.strictEqual(layout.drawX, 0);
  });

  it("skips characters without a glyph while preserving their advance", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont(
      {
        A: glyphRecord(src, 0, 0, 8, 12, 9),
        B: glyphRecord(src, 8, 0, 8, 12, 9),
      },
      4 // space advance
    );

    const layout = layoutText(makeTarget(), font, "A B", 0, 0);
    assert.strictEqual(layout.count, 2, "space produces no placement");
    assert.deepStrictEqual(layout.chars, ["A", "B"]);
    assert.deepStrictEqual(Array.from(layout.positions.slice(0, layout.count * 2)), [0, 0, 13, 0],
      "B advanced by 9 + 4 + 9");
    assert.strictEqual(layout.width, 21);
  });

  it("refills one target in place, growing positions geometrically", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const target = makeTarget();
    layoutText(target, font, "AB", 0, 0);
    const positionsRef = target.positions;
    const charsRef = target.chars;
    const glyphsRef = target.glyphs;

    layoutText(target, font, "AB", 0, 0);
    assert.strictEqual(target.positions, positionsRef, "same-capacity relayout reuses the buffer");
    assert.strictEqual(target.glyphs, glyphsRef);
    assert.strictEqual(target.chars, charsRef);

    layoutText(target, font, "ABAB", 0, 0);
    assert.strictEqual(target.count, 4);
    assert.strictEqual(target.positions.length, 8, "4 glyphs grow 2 → 4 slots");
    assert.strictEqual(target.glyphs, glyphsRef, "glyphs/chars arrays reused across growth");
    assert.strictEqual(target.chars, charsRef);
    const grownPositions = target.positions;

    layoutText(target, font, "A", 0, 0);
    assert.strictEqual(target.count, 1);
    assert.strictEqual(target.chars.length, 1, "shorter content truncates in place");
    assert.strictEqual(target.positions, grownPositions, "shrink keeps the bigger buffer");
  });
});

// ── rasterizer consumes regions — representation-independent ───────────────

describe("TextRasterizer consumes glyph regions", () => {
  it("draws identical text whether glyphs come from per-glyph canvases or a shared atlas", () => {
    // Per-glyph canvases: each glyph's region is the whole of its own canvas.
    const canvasA = { width: 8, height: 12 };
    const canvasB = { width: 8, height: 12 };
    const canvasFont = makeFont({
      A: glyphRecord(canvasA, 0, 0, 8, 12, 9),
      B: glyphRecord(canvasB, 0, 0, 8, 12, 9),
    });

    // Shared atlas: one source, sub-rects per glyph — same metrics as above.
    const atlas = { width: 16, height: 12 };
    const atlasFont = makeFont({
      A: glyphRecord(atlas, 0, 0, 8, 12, 9),
      B: glyphRecord(atlas, 8, 0, 8, 12, 9),
    });

    const layoutCanvas = layoutText(makeTarget(), canvasFont, "AB", 0, 0);
    const layoutAtlas = layoutText(makeTarget(), atlasFont, "AB", 0, 0);
    assert.strictEqual(layoutCanvas.width, layoutAtlas.width);
    assert.strictEqual(layoutCanvas.height, layoutAtlas.height);
    assert.deepStrictEqual(Array.from(layoutCanvas.positions), Array.from(layoutAtlas.positions));

    const ctxCanvas = makeCtx();
    const ctxAtlas = makeCtx();
    rasterizeText(ctxCanvas, canvasFont, layoutCanvas, null);
    rasterizeText(ctxAtlas, atlasFont, layoutAtlas, null);

    assert.strictEqual(ctxCanvas.calls.length, 2);
    assert.strictEqual(ctxAtlas.calls.length, 2);
    // The destination rect (args 5–8) must be identical across representations…
    assert.deepStrictEqual(ctxCanvas.calls[0].slice(5), ctxAtlas.calls[0].slice(5));
    assert.deepStrictEqual(ctxCanvas.calls[1].slice(5), ctxAtlas.calls[1].slice(5));
    assert.deepStrictEqual(ctxCanvas.calls[1].slice(5), [9, 0, 8, 12]);
    // …while the atlas draw cuts each glyph's sub-rect out of the shared source.
    assert.deepStrictEqual(ctxAtlas.calls[0].slice(0, 5), [atlas, 0, 0, 8, 12]);
    assert.deepStrictEqual(ctxAtlas.calls[1].slice(0, 5), [atlas, 8, 0, 8, 12]);
    assert.deepStrictEqual(ctxCanvas.calls[0].slice(0, 5), [canvasA, 0, 0, 8, 12]);
    assert.deepStrictEqual(ctxCanvas.calls[1].slice(0, 5), [canvasB, 0, 0, 8, 12]);
  });

  it("resolves the tint through the glyph record API, not a parallel canvas path", () => {
    const src = { width: 16, height: 12 };
    const tintedSrc = { width: 8, height: 12 };
    const base = {
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    };
    let tintedCalls = 0;
    const font = {
      getGlyph(ch) {
        return base[ch] || null;
      },
      getTintedGlyph(ch, color) {
        tintedCalls++;
        const b = base[ch];
        if (!b) return null;
        return { region: { sourceImage: tintedSrc, sx: 0, sy: 0, sw: b.region.sw, sh: b.region.sh }, advance: b.advance, offsetX: b.offsetX, offsetY: b.offsetY };
      },
      advance(ch) {
        return 9;
      },
    };

    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    const ctx = makeCtx();
    rasterizeText(ctx, font, layout, "#ff0000");

    assert.strictEqual(tintedCalls, 2, "tint resolved per placement");
    assert.strictEqual(ctx.calls.length, 2);
    assert.strictEqual(ctx.calls[0][0], tintedSrc, "drew the tinted record's region source");
    assert.deepStrictEqual(ctx.calls[0].slice(5), [0, 0, 8, 12]);
    assert.deepStrictEqual(ctx.calls[1].slice(5), [9, 0, 8, 12]);
  });

  it("lays out at zero cost to the font registry — only records matter", () => {
    // A provider with getGlyph/advance only (no BitmapFont surface) proves the
    // whole pipeline is representation-independent end to end.
    const source = { width: 16, height: 12 };
    const provider = makeFont({
      A: glyphRecord(source, 0, 0, 8, 12, 9),
      B: glyphRecord(source, 8, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), provider, "AB", 0, 0);
    const ctx = makeCtx();
    rasterizeText(ctx, provider, layout, null);
    assert.strictEqual(layout.count, 2);
    assert.strictEqual(ctx.calls.length, 2);
    assert.strictEqual(ctx.calls[1][0], source);
  });
});
