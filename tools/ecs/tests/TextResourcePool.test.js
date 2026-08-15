import { describe, it } from "node:test";
import * as assert from "node:assert";
import { TextResourcePool } from "../../../ecs/render/TextResourcePool.js";

const SLOT_MASK = TextResourcePool.SLOT_MASK;
const SLOT_BITS = TextResourcePool.SLOT_BITS;

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
  function makeCanvas(w, h) {
    return { width: w, height: h };
  }

  it("setLayout stores glyphs and layout() exposes them", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("AB");
    assert.strictEqual(pool.layout(h), null);

    assert.strictEqual(pool.setLayout(h, [
      { canvas: makeCanvas(4, 2), x: 0, y: 0, w: 4, h: 2 },
      { canvas: makeCanvas(4, 2), x: 6, y: 0, w: 4, h: 2 },
    ]), true);

    const layout = pool.layout(h);
    assert.ok(layout);
    assert.strictEqual(layout.count, 2);
    assert.strictEqual(layout.canvases.length, 2);
    assert.strictEqual(layout.positions.length, 8);
    assert.deepStrictEqual(Array.from(layout.positions), [0, 0, 4, 2, 6, 0, 4, 2]);
  });

  it("refills the same buffers in place across relayouts of the same capacity", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("AB");
    pool.setLayout(h, [
      { canvas: makeCanvas(4, 2), x: 0, y: 0, w: 4, h: 2 },
      { canvas: makeCanvas(4, 2), x: 6, y: 0, w: 4, h: 2 },
    ]);
    const layout = pool.layout(h);
    const positionsRef = layout.positions;
    const canvasesRef = layout.canvases;

    pool.setLayout(h, [
      { canvas: makeCanvas(8, 4), x: 1, y: 1, w: 8, h: 4 },
      { canvas: makeCanvas(8, 4), x: 10, y: 1, w: 8, h: 4 },
    ]);
    const layout2 = pool.layout(h);
    assert.strictEqual(layout2, layout);
    assert.strictEqual(layout2.positions, positionsRef);
    assert.strictEqual(layout2.canvases, canvasesRef);
    assert.deepStrictEqual(Array.from(layout2.positions), [1, 1, 8, 4, 10, 1, 8, 4]);
  });

  it("grows positions geometrically on longer content and preserves capacity on shrink", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("text");
    pool.setLayout(h, [
      { canvas: makeCanvas(1, 1), x: 0, y: 0, w: 1, h: 1 },
      { canvas: makeCanvas(1, 1), x: 1, y: 0, w: 1, h: 1 },
    ]);
    assert.strictEqual(pool.layout(h).positions.length, 8);

    const placements = [];
    for (let i = 0; i < 5; i++) {
      placements.push({ canvas: makeCanvas(1, 1), x: i, y: 0, w: 1, h: 1 });
    }
    pool.setLayout(h, placements);
    const grown = pool.layout(h);
    assert.strictEqual(grown.positions.length, 32);
    assert.strictEqual(grown.count, 5);

    pool.setLayout(h, [{ canvas: makeCanvas(1, 1), x: 0, y: 0, w: 1, h: 1 }]);
    const shrunk = pool.layout(h);
    assert.strictEqual(shrunk.positions.length, 32);
    assert.strictEqual(shrunk.count, 1);
  });

  it("measures bounds for left/center/right alignment", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("AB");
    const gw = 4;
    const gh = 2;
    const adv = 6;
    const cases = { left: 0, center: -5, right: -10 };
    const widths = {};
    for (const [align, startX] of Object.entries(cases)) {
      pool.setLayout(h, [
        { canvas: makeCanvas(gw, gh), x: startX, y: 0, w: gw, h: gh },
        { canvas: makeCanvas(gw, gh), x: startX + adv, y: 0, w: gw, h: gh },
      ]);
      widths[align] = pool.width(h);
      assert.strictEqual(pool.height(h), gh);
    }
    assert.strictEqual(widths.left, widths.center);
    assert.strictEqual(widths.center, widths.right);
    assert.strictEqual(widths.left, 10);
  });

  it("measures an empty layout as zero", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    assert.strictEqual(pool.setLayout(h, []), true);
    assert.strictEqual(pool.width(h), 0);
    assert.strictEqual(pool.height(h), 0);
    assert.strictEqual(pool.layout(h).count, 0);
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
    assert.strictEqual(pool.setLayout(0, []), false);
    assert.strictEqual(pool.layoutVersion(0), null);
    assert.strictEqual(pool.width(0), null);
    assert.strictEqual(pool.height(0), null);
  });

  it("setLayout rejects non-array placements", () => {
    const pool = new TextResourcePool();
    const h = pool.allocate("x");
    assert.throws(() => pool.setLayout(h, null), /placements/);
  });
});