import { describe, it } from "node:test";
import * as assert from "node:assert";
import { PointerStorage } from "../PointerStorage.js";

describe("PointerStorage", () => {
  it("starts with no active pointers", () => {
    const ps = new PointerStorage();
    assert.strictEqual(ps.activeCount, 0);
  });

  it("allocate returns a valid slot", () => {
    const ps = new PointerStorage();
    const slot = ps.allocate();
    assert.ok(slot >= 0);
    assert.strictEqual(ps.activeCount, 1);
  });

  it("allocate returns fresh pointer data", () => {
    const ps = new PointerStorage();
    const slot = ps.allocate();
    const data = ps.getPointerData(slot);
    assert.ok(data);
    assert.strictEqual(data.active, true);
  });

  it("release marks slot as inactive", () => {
    const ps = new PointerStorage();
    const slot = ps.allocate();
    assert.ok(ps.getPointerData(slot));
    ps.release(slot);
    assert.strictEqual(ps.getPointerData(slot), null);
    assert.strictEqual(ps.activeCount, 0);
  });

  it("handles up to 10 simultaneous allocations", () => {
    const ps = new PointerStorage();
    const slots = [];
    for (let i = 0; i < 10; i++) {
      slots.push(ps.allocate());
    }
    assert.strictEqual(ps.activeCount, 10);
    for (const s of slots) assert.ok(s >= 0);
    // 11th allocation fails
    assert.strictEqual(ps.allocate(), -1);
  });

  it("recycles slots after release", () => {
    const ps = new PointerStorage();
    const s1 = ps.allocate();
    const s2 = ps.allocate();
    ps.release(s1);
    const s3 = ps.allocate();
    assert.strictEqual(s3, s1);
    assert.strictEqual(ps.activeCount, 2);
  });

  it("forEachActive iterates only active pointers", () => {
    const ps = new PointerStorage();
    const s1 = ps.allocate();
    const s2 = ps.allocate();
    ps.release(s2);
    const count = [];
    ps.forEachActive((d) => count.push(d.slot));
    assert.strictEqual(count.length, 1);
  });

  it("release ignores invalid slot", () => {
    const ps = new PointerStorage();
    ps.release(-1);
    ps.release(99);
    assert.strictEqual(ps.activeCount, 0);
  });

  it("capacity getter returns 10", () => {
    const ps = new PointerStorage();
    assert.strictEqual(ps.capacity, 10);
  });

  it("historyCapacity getter/setter", () => {
    const ps = new PointerStorage(8);
    assert.strictEqual(ps.historyCapacity, 8);
    ps.historyCapacity = 16;
    assert.strictEqual(ps.historyCapacity, 16);
  });

  it("historyCapacity clamps to [1, 64]", () => {
    const ps = new PointerStorage(8);
    ps.historyCapacity = 0;
    assert.strictEqual(ps.historyCapacity, 1);
    ps.historyCapacity = 100;
    assert.strictEqual(ps.historyCapacity, 64);
  });
});
