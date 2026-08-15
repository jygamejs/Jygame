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