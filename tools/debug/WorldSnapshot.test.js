import { describe, it } from "node:test";
import * as assert from "node:assert";
import { WorldSnapshot } from "../../debug/snapshots/WorldSnapshot.js";

describe("WorldSnapshot", () => {
  it("starts with default values", () => {
    const s = new WorldSnapshot();
    assert.strictEqual(s.frameNumber, 0);
    assert.strictEqual(s.timestamp, 0);
    assert.strictEqual(s.diagnostics, null);
    assert.deepStrictEqual(s.worlds, []);
  });

  it("reset clears all fields", () => {
    const s = new WorldSnapshot();
    s.frameNumber = 100;
    s.timestamp = 123456;
    s.diagnostics = { frame: 100 };
    s.worlds.push({ worldId: "main", entities: [] });
    s.reset();
    assert.strictEqual(s.frameNumber, 0);
    assert.strictEqual(s.timestamp, 0);
    assert.strictEqual(s.diagnostics, null);
    assert.deepStrictEqual(s.worlds, []);
  });

  it("has pool compatibility fields", () => {
    const s = new WorldSnapshot();
    assert.strictEqual(s.__jygamePoolActive, false);
    assert.strictEqual(s.__jygamePoolIndex, -1);
  });

  it("stores world snapshot data", () => {
    const s = new WorldSnapshot();
    s.frameNumber = 42;
    s.timestamp = Date.now();
    s.diagnostics = { fps: 60, frameTime: 16.67 };
    s.worlds.push({ worldId: "main", entityCount: 2, entities: [{ id: 1 }, { id: 2 }] });
    assert.strictEqual(s.frameNumber, 42);
    assert.strictEqual(s.worlds.length, 1);
    assert.strictEqual(s.worlds[0].entityCount, 2);
  });
});
