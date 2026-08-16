import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { TextResourcePool } from "../../../ecs/render/TextResourcePool.js";
import { layoutText } from "../../../ecs/render/TextLayout.js";

const SLOT_MASK = TextResourcePool.SLOT_MASK;
const SLOT_BITS = TextResourcePool.SLOT_BITS;

// A minimal glyph-record font: each glyph is a record
// ({ region, advance, offsetX, offsetY }) like any BitmapFont exposes.
function glyph(advance, sw, sh, offsetX = 0, offsetY = 0) {
  return {
    region: { sourceImage: {}, sx: 0, sy: 0, sw, sh },
    advance,
    offsetX,
    offsetY,
  };
}

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

// grid: 2px cells, 2px advance, 2px tall — mirrors the grid font used elsewhere
const gridFont = makeFont({ A: glyph(2, 2, 2), B: glyph(2, 2, 2) });

const prevDoc = globalThis.document;
before(() => {
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => null }),
  };
});
after(() => {
  if (prevDoc === undefined) delete globalThis.document;
  else globalThis.document = prevDoc;
});

describe("TextResourcePool allocation", () => {
  it("allocates a handle and returns the content via get", () => {
    const pool = new TextResourcePool();
    const handle = pool.allocate("hello");
    assert.ok(handle > 0);
    assert.strictEqual(pool.get(handle), "hello");
  });

  it("allocates distinct handles for consecutive allocations", () => {
    const pool = new TextResourcePool(4);
    const a = pool.allocate("a");
    const b = pool.allocate("b");
    assert.notStrictEqual(a, b);
    assert.strictEqual(pool.get(a), "a");
    assert.strictEqual(pool.get(b), "b");
  });

  it("never allocates slot zero; handle 0 is invalid", () => {
    const pool = new TextResourcePool();
    assert.strictEqual(pool.get(0), null);
    pool.allocate("x");
    assert.strictEqual(pool.get(0), null);
  });

  it("rejects non-string content", () => {
    const pool = new TextResourcePool();
    assert.throws(() => pool.allocate(42), /content must be a string/);
    assert.throws(() => pool.allocate(null), /content must be a string/);
  });

  it("grows beyond initial capacity without corruption", () => {
    const pool = new TextResourcePool(2);
    const handles = new Set();
    for (let i = 0; i < 100; i++) {
      const h = pool.allocate("c" + i);
      handles.add(h);
      assert.strictEqual(pool.get(h), "c" + i);
    }
    assert.strictEqual(handles.size, 100);
    assert.ok(pool.capacity >= 100);
    assert.strictEqual(pool.liveCount, 100);
  });
});

describe("TextResourcePool release and free-list reuse", () => {
  it("release frees the slot and get returns null", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("text");
    assert.strictEqual(pool.release(h), true);
    assert.strictEqual(pool.get(h), null);
  });

  it("reuses a released slot with a new generation", () => {
    const pool = new TextResourcePool();
    const a = pool.allocate("first");
    const slotA = a & SLOT_MASK;
    pool.release(a);
    const b = pool.allocate("second");
    const slotB = b & SLOT_MASK;
    assert.strictEqual(slotA, slotB);
    assert.notStrictEqual(a, b);
  });

  it("a stale handle from before reuse resolves to null", () => {
    const pool = new TextResourcePool();
    const old = pool.allocate("old");
    pool.release(old);
    const now = pool.allocate("new");
    assert.strictEqual(pool.get(old), null);
    assert.strictEqual(pool.get(now), "new");
  });

  it("double-release is a no-op (idempotent)", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    assert.strictEqual(pool.release(h), true);
    assert.strictEqual(pool.release(h), false);
    assert.strictEqual(pool.release(h), false);
  });

  it("releasing a stale or foreign handle is a no-op", () => {
    const pool = new TextResourcePool();
    const a = pool.allocate("a");
    const b = pool.allocate("b");
    pool.release(a);
    assert.strictEqual(pool.release(a), false);
    assert.strictEqual(pool.release(b), true);
    assert.strictEqual(pool.release(0), false);
    assert.strictEqual(pool.release((1 << SLOT_BITS) | 99), false);
  });
});

describe("TextResourcePool setContent", () => {
  it("updates content for a live handle", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("before");
    assert.strictEqual(pool.setContent(h, "after"), true);
    assert.strictEqual(pool.get(h), "after");
  });

  it("setContent fails for invalid or released handles", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    pool.release(h);
    assert.strictEqual(pool.setContent(h, "y"), false);
    assert.strictEqual(pool.setContent(0, "y"), false);
  });
});

describe("TextResourcePool retire-on-wrap", () => {
  it("retires a slot when its generation would overflow", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("a");
    const slot = h & SLOT_MASK;
    pool._generation[slot] = TextResourcePool.GEN_MAX;
    const overflowHandle = (TextResourcePool.GEN_MAX << SLOT_BITS) | slot;

    assert.strictEqual(pool.release(overflowHandle), true);
    assert.strictEqual(pool.get(overflowHandle), null);
    assert.strictEqual(pool._inUse[slot], 2);

    const next = pool.allocate("b");
    assert.notStrictEqual(next & SLOT_MASK, slot);
    assert.strictEqual(pool.get(next), "b");
  });
});

describe("TextResourcePool layout cache", () => {
  it("setLayout stores a filled layout and layout() exposes it", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("AB");
    assert.strictEqual(pool.layout(h), null);

    const layout = pool.layoutTarget(h);
    layoutText(layout, gridFont, "AB", 0, 0);
    assert.strictEqual(pool.setLayout(h, layout), true);

    const stored = pool.layout(h);
    assert.strictEqual(stored, layout);
    assert.strictEqual(stored.count, 2);
    assert.deepStrictEqual(stored.chars, ["A", "B"]);
    assert.deepStrictEqual(stored.glyphs, [gridFont.getGlyph("A"), gridFont.getGlyph("B")]);
    assert.strictEqual(stored.positions.length, 4);
    assert.deepStrictEqual(Array.from(stored.positions), [0, 0, 2, 0]);
    assert.strictEqual(stored.drawX, 0);
    assert.strictEqual(stored.width, 4);
    assert.strictEqual(stored.height, 2);
    assert.strictEqual(pool.width(h), 4);
    assert.strictEqual(pool.height(h), 2);
  });

  it("normalizes positions to surface coordinates and records the draw offset", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("AB");
    const layout = pool.layoutTarget(h);

    layoutText(layout, gridFont, "AB", 2, 0); // right-aligned: startX = -4
    pool.setLayout(h, layout);
    assert.strictEqual(layout.drawX, -4, "surface left edge sits at the alignment offset");
    assert.deepStrictEqual(Array.from(layout.positions), [0, 0, 2, 0], "glyphs normalized to surface-local x");
    assert.strictEqual(layout.width, 4);
    assert.strictEqual(layout.height, 2);
  });

  it("refills the same buffers in place across relayouts of the same capacity", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("AB");
    const layout = pool.layoutTarget(h);
    layoutText(layout, gridFont, "AB", 0, 0);
    pool.setLayout(h, layout);
    const positionsRef = layout.positions;
    const charsRef = layout.chars;
    const glyphsRef = layout.glyphs;

    layoutText(layout, gridFont, "AB", 1, 0); // same capacity, centered
    pool.setLayout(h, layout);
    const layout2 = pool.layout(h);
    assert.strictEqual(layout2, layout);
    assert.strictEqual(layout2.positions, positionsRef, "positions buffer reused");
    assert.strictEqual(layout2.chars, charsRef, "chars array reused");
    assert.strictEqual(layout2.glyphs, glyphsRef, "glyphs array reused");
    assert.deepStrictEqual(Array.from(layout2.positions), [0, 0, 2, 0]);
    assert.strictEqual(layout2.drawX, -2);
    assert.strictEqual(layout2.width, 4);
  });

  it("grows positions geometrically on longer content and preserves capacity on shrink", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("text");
    const layout = pool.layoutTarget(h);

    layoutText(layout, gridFont, "AB", 0, 0);
    pool.setLayout(h, layout);
    assert.strictEqual(layout.positions.length, 4);

    layoutText(layout, gridFont, "AAAAA", 0, 0);
    pool.setLayout(h, layout);
    assert.strictEqual(layout.positions.length, 16, "5 glyphs grow 2 → 8 slots");
    assert.strictEqual(layout.count, 5);

    layoutText(layout, gridFont, "A", 0, 0);
    pool.setLayout(h, layout);
    assert.strictEqual(layout.positions.length, 16, "shrink keeps the bigger buffer");
    assert.strictEqual(layout.count, 1);
  });

  it("measures bounds for left/center/right alignment", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("AB");
    const layout = pool.layoutTarget(h);
    const cases = { left: 0, center: -2, right: -4 };
    const widths = {};
    for (const [align, drawX] of Object.entries(cases)) {
      const numeric = align === "left" ? 0 : align === "center" ? 1 : 2;
      layoutText(layout, gridFont, "AB", numeric, 0);
      pool.setLayout(h, layout);
      widths[align] = pool.width(h);
      assert.strictEqual(pool.height(h), 2);
      assert.strictEqual(layout.drawX, drawX);
    }
    assert.strictEqual(widths.left, widths.center);
    assert.strictEqual(widths.center, widths.right);
    assert.strictEqual(widths.left, 4);
  });

  it("measures an empty layout as zero", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    const layout = pool.layoutTarget(h);
    layoutText(layout, gridFont, "", 0, 0);
    assert.strictEqual(pool.setLayout(h, layout), true);
    assert.strictEqual(layout.count, 0);
    assert.strictEqual(layout.width, 0);
    assert.strictEqual(layout.drawX, 0);
    assert.strictEqual(pool.width(h), 0);
    assert.strictEqual(pool.height(h), 0);
  });

  it("tracks layout version per slot", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    assert.strictEqual(pool.layoutVersion(h), 0);
    assert.strictEqual(pool.setLayoutVersion(h, 17), true);
    assert.strictEqual(pool.layoutVersion(h), 17);
    pool.release(h);
    assert.strictEqual(pool.layoutVersion(h), null);
    assert.strictEqual(pool.setLayoutVersion(h, 3), false);
  });

  it("layout accessors fail for invalid handles", () => {
    const pool = new TextResourcePool();
    assert.strictEqual(pool.layout(0), null);
    assert.strictEqual(pool.layoutTarget(0), null);
    assert.strictEqual(pool.setLayout(0, {}), false);
    assert.strictEqual(pool.layoutVersion(0), null);
    assert.strictEqual(pool.width(0), null);
    assert.strictEqual(pool.height(0), null);
  });

  it("setLayout rejects non-layout values", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    assert.throws(() => pool.setLayout(h, null), /layout/);
    assert.throws(() => pool.setLayout(h, []), /layout/);
    assert.throws(() => pool.setLayout(h, { count: "nope" }), /layout/);
  });
});

describe("TextResourcePool surface cache", () => {
  it("ensureSurface creates a canvas sized to the layout", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    assert.strictEqual(pool.surface(h), null);
    const s = pool.ensureSurface(h, 40, 12);
    assert.ok(s);
    assert.strictEqual(s.width, 40);
    assert.strictEqual(s.height, 12);
    assert.strictEqual(pool.surface(h), s);
  });

  it("reuses the surface when the text fits; grows only when it gets larger", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    const s1 = pool.ensureSurface(h, 40, 12);
    const s2 = pool.ensureSurface(h, 30, 8);
    assert.strictEqual(s2, s1, "smaller text reuses the existing surface");
    const s3 = pool.ensureSurface(h, 200, 12);
    assert.notStrictEqual(s3, s1, "larger text grows a new surface");
    const s4 = pool.ensureSurface(h, 100, 10);
    assert.strictEqual(s4, s3, "fits again — no further allocation");
  });

  it("tracks surfaceVersion independently of layoutVersion", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    assert.strictEqual(pool.layoutVersion(h), 0);
    assert.strictEqual(pool.surfaceVersion(h), 0);
    const layout = pool.layoutTarget(h);
    layoutText(layout, gridFont, "A", 0, 0);
    pool.setLayout(h, layout);
    pool.setLayoutVersion(h, 1);
    pool.setSurfaceVersion(h, 1);
    assert.strictEqual(pool.layoutVersion(h), 1);
    assert.strictEqual(pool.surfaceVersion(h), 1);
  });

  it("release clears the surface and layout; a stale handle sees nothing", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    const layout = pool.layoutTarget(h);
    layoutText(layout, gridFont, "A", 0, 0);
    pool.setLayout(h, layout);
    pool.ensureSurface(h, 20, 10);
    pool.setSurfaceVersion(h, 2);
    assert.ok(pool.surface(h));

    pool.release(h);
    assert.strictEqual(pool.layout(h), null);
    assert.strictEqual(pool.surface(h), null);
    assert.strictEqual(pool.surfaceVersion(h), null);

    const fresh = pool.allocate("y");
    assert.notStrictEqual(fresh, h, "slot reused with a new generation");
    assert.strictEqual(pool.layout(h), null, "old handle never sees the new slot's state");
    assert.strictEqual(pool.surface(h), null);
  });
});