import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { GlyphBuffer } from "../../../ecs/render/GlyphBuffer.js";
import { fillGlyphBuffer, pushGlyphs, renderGlyphs } from "../../../ecs/render/GlyphRenderer.js";
import { layoutText } from "../../../ecs/render/TextLayout.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";

// ── helpers ────────────────────────────────────────────────────────────────

function glyphRecord(sourceImage, sx, sy, sw, sh, advance, offsetX = 0, offsetY = 0) {
  return { region: { sourceImage, sx, sy, sw, sh }, advance, offsetX, offsetY };
}

function makeFont(map, spaceAdvance = 0) {
  return {
    getGlyph(ch) { return map[ch] || null; },
    getTintedGlyph(ch, color) {
      const base = map[ch];
      if (!base) return null;
      const tintedSrc = { _tinted: color, _base: base.region.sourceImage };
      return {
        region: { sourceImage: tintedSrc, sx: 0, sy: 0, sw: base.region.sw, sh: base.region.sh },
        advance: base.advance,
        offsetX: base.offsetX,
        offsetY: base.offsetY,
      };
    },
    advance(ch) {
      if (ch === " ") return spaceAdvance;
      const g = map[ch];
      return g ? g.advance : 0;
    },
  };
}

function makeTarget() {
  return { glyphs: [], chars: [], positions: new Float32Array(0), count: 0, drawX: 0, width: 0, height: 0 };
}

function collectCommands(queue) {
  const cmds = [];
  queue.forEachCommandSorted((cmd) => cmds.push(cmd));
  return cmds;
}

// ── GlyphBuffer ────────────────────────────────────────────────────────────

describe("GlyphBuffer", () => {
  it("starts empty and grows geometrically", () => {
    const buf = new GlyphBuffer(2);
    assert.strictEqual(buf.count, 0);
    assert.strictEqual(buf.capacity, 2);

    const img = { width: 8, height: 12 };
    buf.push(img, 0, 0, 8, 12, 0, 0);
    buf.push(img, 8, 0, 8, 12, 10, 0);
    assert.strictEqual(buf.count, 2);
    assert.strictEqual(buf.capacity, 2);

    buf.push(img, 16, 0, 8, 12, 20, 0);
    assert.strictEqual(buf.count, 3);
    assert.strictEqual(buf.capacity, 4, "grows 2 → 4");
  });

  it("clear resets count without deallocating", () => {
    const buf = new GlyphBuffer(4);
    const img = { width: 8, height: 12 };
    for (let i = 0; i < 4; i++) buf.push(img, 0, 0, 8, 12, i * 10, 0);
    assert.strictEqual(buf.count, 4);
    buf.clear();
    assert.strictEqual(buf.count, 0);
    assert.strictEqual(buf.capacity, 4, "capacity unchanged");
  });

  it("reuse across clear cycles never reallocates within capacity", () => {
    const buf = new GlyphBuffer(4);
    const img = { width: 8, height: 12 };
    for (let i = 0; i < 3; i++) buf.push(img, 0, 0, 8, 12, i * 10, 0);
    const sxRef = buf._sx;
    const xRef = buf._x;

    buf.clear();
    for (let i = 0; i < 3; i++) buf.push(img, 0, 0, 8, 12, i * 10, 0);
    assert.strictEqual(buf._sx, sxRef, "typed array reused");
    assert.strictEqual(buf._x, xRef, "typed array reused");
    assert.strictEqual(buf.count, 3);
  });

  it("rejects invalid initialCapacity", () => {
    assert.throws(() => new GlyphBuffer(0), /positive integer/);
    assert.throws(() => new GlyphBuffer(-1), /positive integer/);
    assert.throws(() => new GlyphBuffer(1.5), /positive integer/);
  });
});

// ── fillGlyphBuffer ────────────────────────────────────────────────────────

describe("fillGlyphBuffer", () => {
  it("fills local positions centered on the text surface", () => {
    const src = { width: 16, height: 24 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    // width = 17, height = 12.  hw = 8.5, hh = 6.
    // A at (0, 0): cx = 0 + 4 - 8.5 = -4.5, cy = 0 + 6 - 6 = 0
    // B at (9, 0): cx = 9 + 4 - 8.5 = 4.5,  cy = 0

    const buf = new GlyphBuffer(8);
    fillGlyphBuffer(buf, layout, font, null);
    assert.strictEqual(buf.count, 2);
    assert.strictEqual(buf._sourceImage[0], src);
    assert.strictEqual(buf._sx[0], 0);
    assert.strictEqual(buf._sw[0], 8);
    assert.ok(Math.abs(buf._x[0] - (-4.5)) < 1e-6, "A local cx");
    assert.ok(Math.abs(buf._y[0]) < 1e-6, "A local cy = 0");
    assert.ok(Math.abs(buf._x[1] - 4.5) < 1e-6, "B local cx");
  });

  it("uses tinted glyph records when tint is set", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "A", 0, 0);

    const buf = new GlyphBuffer(4);
    fillGlyphBuffer(buf, layout, font, "#ff0000");
    assert.strictEqual(buf.count, 1);
    assert.strictEqual(buf._sourceImage[0]._tinted, "#ff0000",
      "tinted source used");
    assert.strictEqual(buf._sourceImage[0]._base, src,
      "base source preserved for reference");
  });

  it("respects offsetX and offsetY in glyph records", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9, 1, 2), // offsetX=1, offsetY=2
    });
    const layout = layoutText(makeTarget(), font, "A", 0, 0);
    // A at (0+1, 2).  width=8, height=12.  hw=4, hh=6.
    // Local center: cx = 0+4-4 = 0, cy = 2+6-6 = 2

    const buf = new GlyphBuffer(4);
    fillGlyphBuffer(buf, layout, font, null);
    assert.strictEqual(buf.count, 1);
    assert.ok(Math.abs(buf._x[0]) < 1e-6, "local cx = 0");
    assert.ok(Math.abs(buf._y[0] - 2) < 1e-6, "local cy reflects offsetY");
    assert.strictEqual(layout.positions[0], 0, "x normalized (1 - drawX)");
    assert.strictEqual(layout.positions[1], 2, "y includes offsetY");
  });

  it("empty layout produces an empty buffer", () => {
    const font = makeFont({ A: glyphRecord({ width: 8, height: 12 }, 0, 0, 8, 12, 9) });
    const layout = layoutText(makeTarget(), font, "", 0, 0);
    const buf = new GlyphBuffer(4);
    fillGlyphBuffer(buf, layout, font, null);
    assert.strictEqual(buf.count, 0);
  });

  it("skips glyphs without a record", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont(
      {
        A: glyphRecord(src, 0, 0, 8, 12, 9),
        B: glyphRecord(src, 8, 0, 8, 12, 9),
      },
      4 // spaceAdvance
    );
    const layout = layoutText(makeTarget(), font, "A B", 0, 0);
    const buf = new GlyphBuffer(8);
    fillGlyphBuffer(buf, layout, font, null);
    assert.strictEqual(buf.count, 2, "space skipped, A and B present");
  });

  it("reuses the same buffer across multiple fills", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const buf = new GlyphBuffer(8);
    const layout1 = layoutText(makeTarget(), font, "AB", 0, 0);
    fillGlyphBuffer(buf, layout1, font, null);
    const sxRef = buf._sx;
    const xRef = buf._x;

    const layout2 = layoutText(makeTarget(), font, "A", 0, 0);
    fillGlyphBuffer(buf, layout2, font, null);
    assert.strictEqual(buf._sx, sxRef, "typed arrays reused");
    assert.strictEqual(buf._x, xRef);
    assert.strictEqual(buf.count, 1);
  });
});

// ── pushGlyphs ─────────────────────────────────────────────────────────────

describe("pushGlyphs", () => {
  it("pushes one command per glyph with correct positions", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    const buf = new GlyphBuffer(8);
    fillGlyphBuffer(buf, layout, font, null);

    const queue = new RenderQueue();
    pushGlyphs(queue, buf, 100, 50, 0, 1, 1, 100, 50, false, 1, 0, 0xffffff, 1);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 2);
    // A: world_cx = 100 + (-4.5) = 95.5, world_cy = 50
    assert.ok(Math.abs(cmds[0].x - 95.5) < 1e-5, `A x = ${cmds[0].x}`);
    assert.ok(Math.abs(cmds[0].y - 50) < 1e-5, `A y = ${cmds[0].y}`);
    assert.strictEqual(cmds[0].sourceImage, src);
    assert.strictEqual(cmds[0].sw, 8);
    assert.strictEqual(cmds[0].sh, 12);
    // B: world_cx = 100 + 4.5 = 104.5
    assert.ok(Math.abs(cmds[1].x - 104.5) < 1e-5, `B x = ${cmds[1].x}`);
    assert.ok(Math.abs(cmds[1].y - 50) < 1e-5, `B y = ${cmds[1].y}`);
  });

  it("applies entity rotation to glyph positions", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "A", 0, 0);
    // width=8, height=12. hw=4, hh=6. A at (0,0).
    // cx = 0+4-4 = 0, cy = 0+6-6 = 0. Local center at (0,0).
    const buf = new GlyphBuffer(4);
    fillGlyphBuffer(buf, layout, font, null);

    const queue = new RenderQueue();
    pushGlyphs(queue, buf, 100, 100, Math.PI / 2, 1, 1, 100, 100, false, 1, 0, 0xffffff, 1);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    // With local (0,0) and rotation π/2:
    // dx = 100 + cos(π/2)*0*1 - sin(π/2)*0*1 = 100
    // dy = 100 + sin(π/2)*0*1 + cos(π/2)*0*1 = 100
    assert.ok(Math.abs(cmds[0].x - 100) < 1e-5);
    assert.ok(Math.abs(cmds[0].y - 100) < 1e-5);
    assert.ok(Math.abs(cmds[0].rotation - Math.PI / 2) < 1e-10);
  });

  it("applies entity rotation to offset glyph positions", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    // width=17, height=12. hw=8.5, hh=6.
    // A: cx=-4.5, cy=0.  B: cx=4.5, cy=0.
    const buf = new GlyphBuffer(8);
    fillGlyphBuffer(buf, layout, font, null);

    const queue = new RenderQueue();
    const cos = Math.cos(Math.PI); // -1
    const sin = Math.sin(Math.PI); // ~0
    pushGlyphs(queue, buf, 100, 100, Math.PI, 1, 1, 100, 100, false, 1, 0, 0xffffff, 1);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 2);
    // A: dx = 100 + (-1)*(-4.5)*1 - 0*0*1 = 104.5
    assert.ok(Math.abs(cmds[0].x - 104.5) < 1e-5, `rotated A x = ${cmds[0].x}`);
    // B: dx = 100 + (-1)*(4.5)*1 = 95.5
    assert.ok(Math.abs(cmds[1].x - 95.5) < 1e-5, `rotated B x = ${cmds[1].x}`);
  });

  it("applies entity scale to glyph positions", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    const buf = new GlyphBuffer(8);
    fillGlyphBuffer(buf, layout, font, null);

    const queue = new RenderQueue();
    pushGlyphs(queue, buf, 100, 100, 0, 2, 2, 100, 100, false, 1, 0, 0xffffff, 1);
    const cmds = collectCommands(queue);
    // A: dx = 100 + 1*(-4.5)*2 - 0*0*2 = 91
    assert.ok(Math.abs(cmds[0].x - 91) < 1e-5, `scaled A x = ${cmds[0].x}`);
    assert.ok(Math.abs(cmds[0].y - 100) < 1e-5);
    // B: dx = 100 + 1*(4.5)*2 = 109
    assert.ok(Math.abs(cmds[1].x - 109) < 1e-5, `scaled B x = ${cmds[1].x}`);
    assert.strictEqual(cmds[0].scaleX, 2);
    assert.strictEqual(cmds[0].scaleY, 2);
  });

  it("computes interpolation prev positions from prev entity anchor", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "A", 0, 0);
    const buf = new GlyphBuffer(4);
    fillGlyphBuffer(buf, layout, font, null);
    // Local cx=0, cy=0 for single centered glyph.

    const queue = new RenderQueue();
    pushGlyphs(queue, buf, 110, 60, 0, 1, 1, 100, 50, true, 1, 0, 0xffffff, 1);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    // Current: dx=110, dy=60.  Prev: pdx=100, pdy=50.
    assert.ok(Math.abs(cmds[0].x - 110) < 1e-5);
    assert.ok(Math.abs(cmds[0].y - 60) < 1e-5);
    assert.ok(Math.abs(cmds[0]._prevX - 100) < 1e-5, "prevX from prev anchor");
    assert.ok(Math.abs(cmds[0]._prevY - 50) < 1e-5, "prevY from prev anchor");
    assert.strictEqual(cmds[0]._interp, 1);
  });

  it("passes layer, depth, fillColor, and imageSmoothing through", () => {
    const src = { width: 8, height: 12 };
    const font = makeFont({ A: glyphRecord(src, 0, 0, 8, 12, 8) });
    const layout = layoutText(makeTarget(), font, "A", 0, 0);
    const buf = new GlyphBuffer(4);
    fillGlyphBuffer(buf, layout, font, null);

    const queue = new RenderQueue();
    pushGlyphs(queue, buf, 0, 0, 0, 1, 1, 0, 0, false, 3, 5.5, 0xffcc00, 0);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds[0].layer, 3);
    assert.strictEqual(cmds[0].depth, 5.5);
    assert.strictEqual(cmds[0].fillColor, 0xffcc00);
    assert.strictEqual(cmds[0].imageSmoothing, 0);
  });

  it("does nothing for an empty buffer", () => {
    const queue = new RenderQueue();
    const buf = new GlyphBuffer(4);
    pushGlyphs(queue, buf, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);
    assert.strictEqual(collectCommands(queue).length, 0);
  });
});

// ── renderGlyphs (fill + push) ─────────────────────────────────────────────

describe("renderGlyphs", () => {
  it("produces correct commands for HELLO", () => {
    const src = { width: 50, height: 12 };
    const font = makeFont({
      H: glyphRecord(src, 0, 0, 10, 12, 11),
      E: glyphRecord(src, 10, 0, 10, 12, 11),
      L: glyphRecord(src, 20, 0, 10, 12, 11),
      O: glyphRecord(src, 30, 0, 10, 12, 11),
    });
    const layout = layoutText(makeTarget(), font, "HELLO", 0, 0);
    // advance=11, sw=10. 5 glyphs.
    // positions: 0, 11, 22, 33, 44.  maxRight=54.  width=54.  hw=27.
    const buf = new GlyphBuffer(16);
    const queue = new RenderQueue();
    renderGlyphs(queue, buf, layout, font, null, 200, 100, 0, 1, 1, 200, 100, false, 1, 0, 0xffffff, 1);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 5, "one command per letter");
    for (const cmd of cmds) {
      assert.ok(Math.abs(cmd.y - 100) < 1e-5);
    }
    // H: cx = 0+5-27 = -22 → world 178
    assert.ok(Math.abs(cmds[0].x - 178) < 1e-5, `H x = ${cmds[0].x}`);
    // O: cx = 44+5-27 = 22 → world 222
    assert.ok(Math.abs(cmds[4].x - 222) < 1e-5, `O x = ${cmds[4].x}`);
  });

  it("handles spaces correctly (HELLO WORLD)", () => {
    const src = { width: 110, height: 12 };
    const chars = "HELLOWORLD";
    const fontMap = {};
    for (let i = 0; i < chars.length; i++) {
      fontMap[chars[i]] = glyphRecord(src, i * 10, 0, 10, 12, 11);
    }
    const font = makeFont(fontMap, 6); // spaceAdvance = 6
    const layout = layoutText(makeTarget(), font, "HELLO WORLD", 0, 0);
    const buf = new GlyphBuffer(32);
    const queue = new RenderQueue();
    renderGlyphs(queue, buf, layout, font, null, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 10, "space produces no command");
    // W is the 6th glyph (index 5 in the output):
    // H=0, E=11, L=22, L=33, O=44, advance+6 → cx=61, W=61
    // 10 glyphs, last (D) at x=105, right=115.  hw = 57.5.
    // cx_W = 61 + 5 - 57.5 = 8.5.  world_x = 0 + 8.5 = 8.5
    assert.ok(Math.abs(cmds[5].x - 8.5) < 1e-5, `W x = ${cmds[5].x}`);
  });

  it("atlas glyphs share sourceImage — same texture for all", () => {
    const atlas = { width: 80, height: 12 };
    const font = makeFont({
      A: glyphRecord(atlas, 0, 0, 8, 12, 9),
      B: glyphRecord(atlas, 8, 0, 8, 12, 9),
      C: glyphRecord(atlas, 16, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "ABC", 0, 0);
    const buf = new GlyphBuffer(8);
    const queue = new RenderQueue();
    renderGlyphs(queue, buf, layout, font, null, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 3);
    assert.strictEqual(cmds[0].sourceImage, atlas);
    assert.strictEqual(cmds[1].sourceImage, atlas);
    assert.strictEqual(cmds[2].sourceImage, atlas);
    // Different source rects (sub-regions of the atlas)
    assert.strictEqual(cmds[0].sx, 0);
    assert.strictEqual(cmds[1].sx, 8);
    assert.strictEqual(cmds[2].sx, 16);
  });

  it("different textures produce separate commands (batch breaks happen at renderer level)", () => {
    const imgA = { width: 16, height: 12 };
    const imgB = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(imgA, 0, 0, 8, 12, 9),
      B: glyphRecord(imgB, 0, 0, 8, 12, 9),
    });
    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    const buf = new GlyphBuffer(8);
    const queue = new RenderQueue();
    renderGlyphs(queue, buf, layout, font, null, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 2);
    assert.strictEqual(cmds[0].sourceImage, imgA);
    assert.strictEqual(cmds[1].sourceImage, imgB);
    assert.notStrictEqual(cmds[0].sourceImage, cmds[1].sourceImage,
      "different source images → separate batches at the renderer");
  });

  it("respects layer/depth ordering with sprites", () => {
    const src = { width: 8, height: 12 };
    const font = makeFont({ A: glyphRecord(src, 0, 0, 8, 12, 8) });
    const layout = layoutText(makeTarget(), font, "A", 0, 0);
    const buf = new GlyphBuffer(4);
    const queue = new RenderQueue();

    // Sprite at depth 0
    queue.push(null, 0, 0, 0, 0, 0, 0, 0, 1, 1, 10, 10, 0xff0000, 0, 1, 1, 0, 0, 0, false);
    // Glyph at depth 1
    renderGlyphs(queue, buf, layout, font, null, 50, 50, 0, 1, 1, 50, 50, false, 1, 1, 0xffffff, 1);
    // Sprite at depth 2
    queue.push(null, 0, 0, 0, 0, 100, 100, 0, 1, 1, 10, 10, 0x00ff00, 0, 1, 1, 2, 100, 100, false);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 3);
    assert.deepStrictEqual(cmds.map((c) => c.depth), [0, 1, 2]);
    assert.strictEqual(cmds[1].sourceImage, src, "glyph command in the middle");
  });

  it("empty text produces no commands", () => {
    const font = makeFont({ A: glyphRecord({ width: 8, height: 12 }, 0, 0, 8, 12, 9) });
    const layout = layoutText(makeTarget(), font, "", 0, 0);
    const buf = new GlyphBuffer(4);
    const queue = new RenderQueue();
    renderGlyphs(queue, buf, layout, font, null, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);
    assert.strictEqual(collectCommands(queue).length, 0);
  });

  it("no per-frame allocation: second call reuses the buffer", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const buf = new GlyphBuffer(8);
    const queue = new RenderQueue();

    const layout = layoutText(makeTarget(), font, "AB", 0, 0);
    renderGlyphs(queue, buf, layout, font, null, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);
    const sxRef = buf._sx;
    const xRef = buf._x;
    const srcRef = buf._sourceImage;

    queue.clear();
    renderGlyphs(queue, buf, layout, font, null, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);
    assert.strictEqual(buf._sx, sxRef, "typed arrays reused across frames");
    assert.strictEqual(buf._x, xRef);
    assert.strictEqual(buf._sourceImage, srcRef);
    assert.strictEqual(collectCommands(queue).length, 2);
  });

  it("text mutation produces different glyph positions", () => {
    const src = { width: 16, height: 12 };
    const font = makeFont({
      A: glyphRecord(src, 0, 0, 8, 12, 9),
      B: glyphRecord(src, 8, 0, 8, 12, 9),
    });
    const buf = new GlyphBuffer(8);
    const queue = new RenderQueue();

    const layout1 = layoutText(makeTarget(), font, "AB", 0, 0);
    renderGlyphs(queue, buf, layout1, font, null, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);
    // Snapshot before queue.clear() — the queue reuses pooled command objects.
    const firstSx1 = collectCommands(queue)[0].sx;

    queue.clear();
    const layout2 = layoutText(makeTarget(), font, "BA", 0, 0);
    renderGlyphs(queue, buf, layout2, font, null, 0, 0, 0, 1, 1, 0, 0, false, 1, 0, 0xffffff, 1);
    const firstSx2 = collectCommands(queue)[0].sx;

    assert.strictEqual(firstSx1, 0, "AB first glyph is A (sx=0)");
    assert.strictEqual(firstSx2, 8, "BA first glyph is B (sx=8)");
    assert.notStrictEqual(firstSx1, firstSx2, "swapped text → different first glyph");
  });

  it("Canvas backend: queue commands produce correct drawImage calls", () => {
    const src = { width: 8, height: 12 };
    const font = makeFont({ A: glyphRecord(src, 0, 0, 8, 12, 8) });
    const layout = layoutText(makeTarget(), font, "A", 0, 0);
    const buf = new GlyphBuffer(4);
    const queue = new RenderQueue();
    renderGlyphs(queue, buf, layout, font, null, 50, 50, 0, 1, 1, 50, 50, false, 1, 0, 0xffffff, 1);

    const drawCalls = [];
    const mockCtx = {
      save() {},
      restore() {},
      getTransform() {
        return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      },
      setTransform() {},
      set imageSmoothingEnabled(v) {},
      drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
        drawCalls.push({ img, sx, sy, sw, sh, dx, dy, dw, dh });
      },
      fillStyle: null,
      fillRect() {},
      beginPath() {},
      arc() {},
      fill() {},
    };
    queue.execute(mockCtx);
    assert.strictEqual(drawCalls.length, 1);
    assert.strictEqual(drawCalls[0].img, src);
    assert.strictEqual(drawCalls[0].sx, 0);
    assert.strictEqual(drawCalls[0].sw, 8);
  });
});
