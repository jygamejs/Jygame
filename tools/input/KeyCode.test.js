import { describe, it } from "node:test";
import * as assert from "node:assert";
import { KeyCode } from "../../input/KeyCode.js";

describe("KeyCode", () => {
  it("has KEY_COUNT set to 115", () => {
    assert.strictEqual(KeyCode.KEY_COUNT, 115);
  });

  it("defines letter keys A–Z with sequential values", () => {
    assert.strictEqual(KeyCode.KEY_A, 0);
    assert.strictEqual(KeyCode.KEY_Z, 25);
  });

  it("defines digit keys 0–9", () => {
    assert.strictEqual(KeyCode.DIGIT_0, 26);
    assert.strictEqual(KeyCode.DIGIT_9, 35);
  });

  it("defines modifier keys", () => {
    assert.strictEqual(KeyCode.SHIFT_LEFT, 36);
    assert.strictEqual(KeyCode.SHIFT_RIGHT, 37);
    assert.strictEqual(KeyCode.CTRL_LEFT, 38);
    assert.strictEqual(KeyCode.CTRL_RIGHT, 39);
    assert.strictEqual(KeyCode.ALT_LEFT, 40);
    assert.strictEqual(KeyCode.ALT_RIGHT, 41);
    assert.strictEqual(KeyCode.META_LEFT, 42);
    assert.strictEqual(KeyCode.META_RIGHT, 43);
  });

  it("defines navigation keys", () => {
    assert.strictEqual(KeyCode.ARROW_UP, 55);
    assert.strictEqual(KeyCode.ARROW_DOWN, 56);
  });

  it("defines function keys F1–F12", () => {
    assert.strictEqual(KeyCode.F1, 63);
    assert.strictEqual(KeyCode.F12, 74);
  });
});

describe("KeyCode.fromDOMCode", () => {
  it("maps 'KeyW' to KEY_W", () => {
    assert.strictEqual(KeyCode.fromDOMCode("KeyW"), KeyCode.KEY_W);
  });

  it("maps 'Space' to SPACE", () => {
    assert.strictEqual(KeyCode.fromDOMCode("Space"), KeyCode.SPACE);
  });

  it("maps 'ArrowUp' to ARROW_UP", () => {
    assert.strictEqual(KeyCode.fromDOMCode("ArrowUp"), KeyCode.ARROW_UP);
  });

  it("maps 'ShiftLeft' to SHIFT_LEFT", () => {
    assert.strictEqual(KeyCode.fromDOMCode("ShiftLeft"), KeyCode.SHIFT_LEFT);
  });

  it("maps 'Digit5' to DIGIT_5", () => {
    assert.strictEqual(KeyCode.fromDOMCode("Digit5"), KeyCode.DIGIT_5);
  });

  it("maps 'F1' to F1", () => {
    assert.strictEqual(KeyCode.fromDOMCode("F1"), KeyCode.F1);
  });

  it("returns -1 for unknown code", () => {
    assert.strictEqual(KeyCode.fromDOMCode("F13"), -1);
    assert.strictEqual(KeyCode.fromDOMCode("Unidentified"), -1);
  });
});

describe("KeyCode.fromName", () => {
  it("maps 'KEY_A' to KEY_A", () => {
    assert.strictEqual(KeyCode.fromName("KEY_A"), KeyCode.KEY_A);
  });

  it("returns -1 for unknown name", () => {
    assert.strictEqual(KeyCode.fromName("NONEXISTENT"), -1);
  });
});

describe("KeyCode.nameOf", () => {
  it("returns name for a known code", () => {
    assert.strictEqual(KeyCode.nameOf(KeyCode.SPACE), "SPACE");
    assert.strictEqual(KeyCode.nameOf(KeyCode.KEY_W), "KEY_W");
  });

  it("returns null for unknown code", () => {
    assert.strictEqual(KeyCode.nameOf(999), null);
  });
});
