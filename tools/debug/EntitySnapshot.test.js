import { describe, it } from "node:test";
import * as assert from "node:assert";
import { EntitySnapshot } from "../../debug/snapshots/EntitySnapshot.js";

describe("EntitySnapshot", () => {
  it("starts with default values", () => {
    const s = new EntitySnapshot();
    assert.strictEqual(s.entityId, 0);
    assert.strictEqual(s.archetypeId, 0);
    assert.deepStrictEqual(s.components, []);
  });

  it("reset clears all fields", () => {
    const s = new EntitySnapshot();
    s.entityId = 42;
    s.archetypeId = 3;
    s.components.push({ dummy: true });
    s.reset();
    assert.strictEqual(s.entityId, 0);
    assert.strictEqual(s.archetypeId, 0);
    assert.deepStrictEqual(s.components, []);
  });

  it("has pool compatibility fields", () => {
    const s = new EntitySnapshot();
    assert.strictEqual(s.__jygamePoolActive, false);
    assert.strictEqual(s.__jygamePoolIndex, -1);
  });

  it("stores entity data", () => {
    const s = new EntitySnapshot();
    s.entityId = 100;
    s.archetypeId = 5;
    assert.strictEqual(s.entityId, 100);
    assert.strictEqual(s.archetypeId, 5);
  });
});
