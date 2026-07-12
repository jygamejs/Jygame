import { describe, it } from "node:test";
import * as assert from "node:assert";
import { MouseButton } from "../../input/MouseButton.js";

describe("MouseButton", () => {
  it("LEFT is 0", () => { assert.strictEqual(MouseButton.LEFT, 0); });
  it("MIDDLE is 1", () => { assert.strictEqual(MouseButton.MIDDLE, 1); });
  it("RIGHT is 2", () => { assert.strictEqual(MouseButton.RIGHT, 2); });
  it("BACK is 3", () => { assert.strictEqual(MouseButton.BACK, 3); });
  it("FORWARD is 4", () => { assert.strictEqual(MouseButton.FORWARD, 4); });
});
