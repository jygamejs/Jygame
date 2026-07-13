import { describe, it } from "node:test";
import * as assert from "node:assert";
import { ComponentSnapshot } from "../../debug/snapshots/ComponentSnapshot.js";

describe("ComponentSnapshot", () => {
  it("starts with default values", () => {
    const s = new ComponentSnapshot();
    assert.strictEqual(s.componentId, 0);
    assert.strictEqual(s.componentName, "");
    assert.deepStrictEqual(s.fields, {});
  });

  it("reset clears all fields", () => {
    const s = new ComponentSnapshot();
    s.componentId = 10;
    s.componentName = "Transform";
    s.fields = { x: 100, y: 200 };
    s.reset();
    assert.strictEqual(s.componentId, 0);
    assert.strictEqual(s.componentName, "");
    assert.deepStrictEqual(s.fields, {});
  });

  it("has pool compatibility fields", () => {
    const s = new ComponentSnapshot();
    assert.strictEqual(s.__jygamePoolActive, false);
    assert.strictEqual(s.__jygamePoolIndex, -1);
  });

  it("stores component data", () => {
    const s = new ComponentSnapshot();
    s.componentId = 64;
    s.componentName = "Health";
    s.fields = { hp: 100, maxHp: 100 };
    assert.strictEqual(s.componentId, 64);
    assert.strictEqual(s.componentName, "Health");
    assert.strictEqual(s.fields.hp, 100);
    assert.strictEqual(s.fields.maxHp, 100);
  });
});
