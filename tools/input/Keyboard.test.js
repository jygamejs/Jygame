import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Keyboard } from "../../input/Keyboard.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { KeyCode } from "../../input/KeyCode.js";
import { Modifier } from "../../input/Modifier.js";
import { Tier } from "../../input/Tier.js";

function keyDownEvent(code, options = {}) {
  return new InputEvent(EventType.KEY_DOWN, {
    key: options.key || "",
    code,
    repeat: options.repeat || false,
    ctrl: false, shift: false, alt: false, meta: false,
    printable: false,
    ...options,
  });
}

function keyUpEvent(code, options = {}) {
  return new InputEvent(EventType.KEY_UP, {
    key: options.key || "",
    code,
    ctrl: false, shift: false, alt: false, meta: false,
    ...options,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("Keyboard", () => {
  it("extends Device and has correct type", () => {
    const kb = new Keyboard();
    assert.strictEqual(kb.type, Keyboard);
  });

  it("starts with no keys down", () => {
    const kb = new Keyboard();
    assert.strictEqual(kb.anyDown(), false);
    assert.strictEqual(kb.isDown(KeyCode.SPACE), false);
  });

  it("registers KEY_DOWN via queue processing", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("Space")));
    assert.strictEqual(kb.isDown(KeyCode.SPACE), true);
  });

  it("registers KEY_UP via queue processing", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("Space")));
    kb.update(queueWith(keyUpEvent("Space")));
    assert.strictEqual(kb.isDown(KeyCode.SPACE), false);
  });

  it("justPressed is true for key down after first update", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("Space")));
    assert.strictEqual(kb.justPressed(KeyCode.SPACE), true);
  });

  it("justPressed is false for held key on second frame", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("Space")));
    kb.update(queueWith());  // empty queue
    assert.strictEqual(kb.justPressed(KeyCode.SPACE), false);
  });

  it("justReleased is true after key up", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("Enter")));
    kb.update(queueWith(keyUpEvent("Enter")));
    assert.strictEqual(kb.justReleased(KeyCode.ENTER), true);
  });

  it("justReleased is false on next frame", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("Enter")));
    kb.update(queueWith(keyUpEvent("Enter")));
    kb.update(queueWith());  // empty queue
    assert.strictEqual(kb.justReleased(KeyCode.ENTER), false);
  });

  it("repeat flag is set on key repeat events", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("KeyA", { repeat: false })));
    kb.update(queueWith(keyDownEvent("KeyA", { repeat: true })));
    assert.strictEqual(kb.repeat(KeyCode.KEY_A), true);
  });

  it("modifiers are updated from modifier key presses", () => {
    const kb = new Keyboard();
    assert.strictEqual(kb.modifiers, Modifier.NONE);
    kb.update(queueWith(keyDownEvent("ShiftLeft")));
    assert.ok(kb.modifiers & Modifier.SHIFT);
  });

  it("modifiers are cleared on modifier key release", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("ShiftLeft")));
    kb.update(queueWith(keyUpEvent("ShiftLeft")));
    assert.strictEqual(kb.modifiers, Modifier.NONE);
  });

  it("tracks multiple simultaneous modifiers", () => {
    const kb = new Keyboard();
    kb.update(queueWith(
      keyDownEvent("ShiftLeft"),
      keyDownEvent("ControlLeft"),
    ));
    assert.ok(kb.modifiers & Modifier.SHIFT);
    assert.ok(kb.modifiers & Modifier.CTRL);
  });

  it("anyDown returns true when a key is held", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("KeyW")));
    assert.strictEqual(kb.anyDown(), true);
  });

  it("pressedKeys returns all down keys", () => {
    const kb = new Keyboard();
    kb.update(queueWith(
      keyDownEvent("KeyA"),
      keyDownEvent("KeyB"),
      keyDownEvent("KeyC"),
    ));
    const keys = kb.pressedKeys;
    assert.strictEqual(keys.length, 3);
    assert.ok(keys.includes(KeyCode.KEY_A));
  });

  it("ignores unknown DOM codes", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("F13")));
    assert.strictEqual(kb.anyDown(), false);
  });
});
