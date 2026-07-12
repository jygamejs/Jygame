import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Modifier } from "../Modifier.js";

describe("Modifier", () => {
  it("NONE is 0", () => {
    assert.strictEqual(Modifier.NONE, 0);
  });

  it("SHIFT is bit 0", () => {
    assert.strictEqual(Modifier.SHIFT, 1);
  });

  it("CTRL is bit 1", () => {
    assert.strictEqual(Modifier.CTRL, 2);
  });

  it("ALT is bit 2", () => {
    assert.strictEqual(Modifier.ALT, 4);
  });

  it("META is bit 3", () => {
    assert.strictEqual(Modifier.META, 8);
  });

  it("supports bitwise OR for combined modifiers", () => {
    const combos = [
      { bits: Modifier.SHIFT | Modifier.CTRL, expected: 3 },
      { bits: Modifier.CTRL | Modifier.ALT, expected: 6 },
      { bits: Modifier.SHIFT | Modifier.CTRL | Modifier.ALT | Modifier.META, expected: 15 },
    ];
    for (const { bits, expected } of combos) {
      assert.strictEqual(bits, expected);
    }
  });

  it("supports bitwise AND to test presence", () => {
    const bits = Modifier.SHIFT | Modifier.CTRL;
    assert.ok(bits & Modifier.SHIFT);
    assert.ok(bits & Modifier.CTRL);
    assert.ok(!(bits & Modifier.ALT));
  });
});
