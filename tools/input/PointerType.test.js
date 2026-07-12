import { describe, it } from "node:test";
import * as assert from "node:assert";
import { PointerType } from "../../input/PointerType.js";

describe("PointerType", () => {
  it("defines MOUSE", () => {
    assert.strictEqual(PointerType.MOUSE, "mouse");
  });

  it("defines TOUCH", () => {
    assert.strictEqual(PointerType.TOUCH, "touch");
  });

  it("defines PEN", () => {
    assert.strictEqual(PointerType.PEN, "pen");
  });
});
