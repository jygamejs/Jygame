import { describe, it } from "node:test";
import * as assert from "node:assert";
import { KeyboardState } from "../KeyboardState.js";
import { KeyCode } from "../KeyCode.js";

describe("KeyboardState", () => {
  it("starts with all keys up", () => {
    const ks = new KeyboardState();
    assert.strictEqual(ks.isDown(KeyCode.KEY_A), false);
    assert.strictEqual(ks.anyDown(), false);
  });

  it("press marks key as down", () => {
    const ks = new KeyboardState();
    ks.press(KeyCode.KEY_W);
    assert.strictEqual(ks.isDown(KeyCode.KEY_W), true);
  });

  it("release marks key as up", () => {
    const ks = new KeyboardState();
    ks.press(KeyCode.KEY_W);
    ks.release(KeyCode.KEY_W);
    assert.strictEqual(ks.isDown(KeyCode.KEY_W), false);
  });

  it("justPressed is true for newly pressed keys", () => {
    const ks = new KeyboardState();
    ks.snapshot();              // mark previous state (all up)
    ks.press(KeyCode.SPACE); // current state: SPACE down
    assert.strictEqual(ks.justPressed(KeyCode.SPACE), true);
  });

  it("justPressed is false for keys held across frames", () => {
    const ks = new KeyboardState();
    ks.snapshot();              // frame 1 start
    ks.press(KeyCode.SPACE); // frame 1: press SPACE
    ks.snapshot();              // frame 2 start (SPACE was down in prev frame)
    assert.strictEqual(ks.justPressed(KeyCode.SPACE), false);
  });

  it("justReleased is true for newly released keys", () => {
    const ks = new KeyboardState();
    ks.snapshot();              // frame 1 start
    ks.press(KeyCode.SPACE); // frame 1: press SPACE
    ks.snapshot();              // frame 2 start (SPACE was down)
    ks.release(KeyCode.SPACE); // frame 2: release SPACE
    assert.strictEqual(ks.justReleased(KeyCode.SPACE), true);
  });

  it("repeat is set after setRepeat", () => {
    const ks = new KeyboardState();
    ks.snapshot();               // snapshot clears repeat array
    ks.setRepeat(KeyCode.KEY_A); // now set it
    assert.strictEqual(ks.repeat(KeyCode.KEY_A), true);
  });

  it("repeat is cleared after snapshot", () => {
    const ks = new KeyboardState();
    ks.snapshot();
    ks.setRepeat(KeyCode.KEY_A);
    ks.snapshot();               // clears repeat
    assert.strictEqual(ks.repeat(KeyCode.KEY_A), false);
  });

  it("anyDown returns true when any key is down", () => {
    const ks = new KeyboardState();
    ks.press(KeyCode.KEY_X);
    assert.strictEqual(ks.anyDown(), true);
  });

  it("pressedKeys lists all down keys", () => {
    const ks = new KeyboardState();
    ks.press(KeyCode.KEY_A);
    ks.press(KeyCode.KEY_B);
    ks.press(KeyCode.KEY_C);
    const keys = ks.pressedKeys;
    assert.strictEqual(keys.length, 3);
    assert.ok(keys.includes(KeyCode.KEY_A));
    assert.ok(keys.includes(KeyCode.KEY_B));
    assert.ok(keys.includes(KeyCode.KEY_C));
  });

  it("isDown returns false for out-of-range code", () => {
    const ks = new KeyboardState();
    assert.strictEqual(ks.isDown(-1), false);
    assert.strictEqual(ks.isDown(999), false);
  });

  it("press does nothing for out-of-range code", () => {
    const ks = new KeyboardState();
    ks.press(-1);
    ks.press(999);
    assert.strictEqual(ks.anyDown(), false);
  });

  it("modifiers getter/setter", () => {
    const ks = new KeyboardState();
    assert.strictEqual(ks.modifiers, 0);
    ks.modifiers = 3;
    assert.strictEqual(ks.modifiers, 3);
  });
});
