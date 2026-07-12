import { describe, it } from "node:test";
import * as assert from "node:assert";
import { PointerHistory } from "../PointerHistory.js";

describe("PointerHistory", () => {
  it("starts empty", () => {
    const h = new PointerHistory(8);
    assert.strictEqual(h.length, 0);
  });

  it("push stores positions", () => {
    const h = new PointerHistory(8);
    h.push({ x: 10, y: 20 });
    assert.strictEqual(h.length, 1);
    const p = h.get(0);
    assert.strictEqual(p.x, 10);
    assert.strictEqual(p.y, 20);
  });

  it("get(0) returns most recent", () => {
    const h = new PointerHistory(8);
    h.push({ x: 1, y: 1 });
    h.push({ x: 2, y: 2 });
    h.push({ x: 3, y: 3 });
    assert.strictEqual(h.get(0).x, 3);
    assert.strictEqual(h.get(1).x, 2);
    assert.strictEqual(h.get(2).x, 1);
  });

  it("get returns null for out-of-range index", () => {
    const h = new PointerHistory(8);
    h.push({ x: 10, y: 10 });
    assert.strictEqual(h.get(5), null);
    assert.strictEqual(h.get(-1), null);
  });

  it("clear removes all entries", () => {
    const h = new PointerHistory(8);
    h.push({ x: 10, y: 10 });
    h.push({ x: 20, y: 20 });
    h.clear();
    assert.strictEqual(h.length, 0);
  });

  it("ring buffer overwrites oldest when at capacity", () => {
    const h = new PointerHistory(3);
    h.push({ x: 1, y: 1 });
    h.push({ x: 2, y: 2 });
    h.push({ x: 3, y: 3 });
    h.push({ x: 4, y: 4 });
    assert.strictEqual(h.length, 3);
    assert.strictEqual(h.get(0).x, 4);
    assert.strictEqual(h.get(1).x, 3);
    assert.strictEqual(h.get(2).x, 2);
  });

  it("constructor accepts custom capacity", () => {
    const h = new PointerHistory(16);
    for (let i = 0; i < 16; i++) h.push({ x: i, y: i });
    assert.strictEqual(h.length, 16);
    assert.strictEqual(h.get(0).x, 15);
  });
});
