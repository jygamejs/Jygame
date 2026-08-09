import { describe, it } from "node:test";
import * as assert from "node:assert";
import { GamepadState } from "../../input/GamepadState.js";
import { GamepadButton } from "../../input/GamepadButton.js";
import { GamepadAxis } from "../../input/GamepadAxis.js";

describe("GamepadState", () => {
  it("starts disconnected with no state", () => {
    const s = new GamepadState();
    assert.strictEqual(s.connected, false);
    assert.strictEqual(s.isDown(GamepadButton.A), false);
    assert.strictEqual(s.axis(GamepadAxis.LEFT_X), 0);
  });

  it("connect tracks id, mapping and index", () => {
    const s = new GamepadState();
    s.connect("Xbox 360", "standard", 2);
    assert.strictEqual(s.connected, true);
    assert.strictEqual(s.id, "Xbox 360");
    assert.strictEqual(s.mapping, "standard");
    assert.strictEqual(s.index, 2);
  });

  it("press/release toggle the digital button", () => {
    const s = new GamepadState();
    s.connect("pad", "", 0);
    s.press(GamepadButton.A);
    assert.strictEqual(s.isDown(GamepadButton.A), true);
    s.release(GamepadButton.A);
    assert.strictEqual(s.isDown(GamepadButton.A), false);
  });

  it("justPressed is true for a fresh press, false when held", () => {
    const s = new GamepadState();
    s.connect("pad", "", 0);
    s.snapshot();
    s.press(GamepadButton.A);
    assert.strictEqual(s.justPressed(GamepadButton.A), true);
    s.snapshot();
    assert.strictEqual(s.justPressed(GamepadButton.A), false);
    assert.strictEqual(s.isDown(GamepadButton.A), true);
  });

  it("justReleased is true on release, false after", () => {
    const s = new GamepadState();
    s.connect("pad", "", 0);
    s.snapshot();
    s.press(GamepadButton.A);
    s.snapshot();
    s.release(GamepadButton.A);
    assert.strictEqual(s.justReleased(GamepadButton.A), true);
    s.snapshot();
    assert.strictEqual(s.justReleased(GamepadButton.A), false);
  });

  it("tracks analog values separately from the digital flag", () => {
    const s = new GamepadState();
    s.connect("pad", "", 0);
    s.setValue(GamepadButton.RT, 0.7);
    assert.ok(Math.abs(s.value(GamepadButton.RT) - 0.7) < 1e-6);
    assert.strictEqual(s.isDown(GamepadButton.RT), false, "analog value alone is not a press");
  });

  it("tracks axes", () => {
    const s = new GamepadState();
    s.connect("pad", "", 0);
    s.setAxis(GamepadAxis.LEFT_X, 0.5);
    s.setAxis(GamepadAxis.LEFT_Y, -1);
    assert.strictEqual(s.axis(GamepadAxis.LEFT_X), 0.5);
    assert.strictEqual(s.axis(GamepadAxis.LEFT_Y), -1);
  });

  it("disconnect clears all state", () => {
    const s = new GamepadState();
    s.connect("pad", "", 0);
    s.press(GamepadButton.A);
    s.setAxis(GamepadAxis.LEFT_X, 0.9);
    s.disconnect();
    assert.strictEqual(s.connected, false);
    assert.strictEqual(s.id, null);
    assert.strictEqual(s.isDown(GamepadButton.A), false);
    assert.strictEqual(s.axis(GamepadAxis.LEFT_X), 0);
  });

  it("connect resets stale state from a previous occupant", () => {
    const s = new GamepadState();
    s.connect("old", "", 0);
    s.press(GamepadButton.B);
    s.disconnect();
    s.connect("new", "", 0);
    assert.strictEqual(s.isDown(GamepadButton.B), false, "a fresh connect starts clean");
  });
});
