import { describe, it } from "node:test";
import * as assert from "node:assert";
import { DeviceRegistry } from "../DeviceRegistry.js";
import { Keyboard } from "../Keyboard.js";
import { Mouse } from "../Mouse.js";
import { KeyCode } from "../KeyCode.js";
import { MouseButton } from "../MouseButton.js";
import { InputEventQueue } from "../InputEventQueue.js";
import { InputEvent } from "../InputEvent.js";
import { EventType } from "../EventType.js";
import { Tier } from "../Tier.js";
import { KeyBinding } from "../actions/KeyBinding.js";
import { MouseButtonBinding } from "../actions/MouseButtonBinding.js";
import { WheelBinding } from "../actions/WheelBinding.js";
import { Binding } from "../actions/Binding.js";

function keyDown(domCode) {
  return new InputEvent(EventType.KEY_DOWN, {
    key: "?", code: domCode, repeat: false,
    ctrl: false, shift: false, alt: false, meta: false,
    printable: false,
  });
}

function keyUp(domCode) {
  return new InputEvent(EventType.KEY_UP, {
    key: "?", code: domCode,
    ctrl: false, shift: false, alt: false, meta: false,
  });
}

function pointerDown(button) {
  return new InputEvent(EventType.POINTER_DOWN, {
    pointerId: 1, x: 0, y: 0, type: "mouse", button,
    pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
    width: 1, height: 1, isPrimary: true,
  });
}

function pointerUp(button) {
  return new InputEvent(EventType.POINTER_UP, {
    pointerId: 1, x: 0, y: 0, type: "mouse", button,
    pressure: 0, isPrimary: true,
  });
}

function wheelEvent(deltaY) {
  return new InputEvent(EventType.WHEEL, {
    x: 0, y: 0, deltaX: 0, deltaY, deltaZ: 0, deltaMode: 0,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("Binding base", () => {
  it("returns type 'binding'", () => {
    const b = new Binding();
    assert.strictEqual(b.type, "binding");
  });

  it("evaluate returns 0", () => {
    const b = new Binding();
    assert.strictEqual(b.evaluate(new DeviceRegistry()), 0);
  });

  it("serialize returns type", () => {
    const b = new Binding();
    assert.deepStrictEqual(b.serialize(), { type: "binding" });
  });
});

describe("KeyBinding", () => {
  it("returns type 'key'", () => {
    const b = new KeyBinding(KeyCode.SPACE);
    assert.strictEqual(b.type, "key");
  });

  it("stores keyCode", () => {
    const b = new KeyBinding(KeyCode.KEY_W);
    assert.strictEqual(b.keyCode, KeyCode.KEY_W);
  });

  it("returns 1 when key is held", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    kb.update(queueWith(keyDown("KeyW")));

    const b = new KeyBinding(KeyCode.KEY_W);
    assert.strictEqual(b.evaluate(registry), 1);
  });

  it("returns 0 when key is not held", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    const b = new KeyBinding(KeyCode.KEY_W);
    assert.strictEqual(b.evaluate(registry), 0);
  });

  it("returns 0 when keyboard is not registered", () => {
    const b = new KeyBinding(KeyCode.KEY_W);
    assert.strictEqual(b.evaluate(new DeviceRegistry()), 0);
  });

  it("returns 0 after key is released", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    kb.update(queueWith(keyDown("KeyA")));
    kb.update(queueWith(keyUp("KeyA")));

    const b = new KeyBinding(KeyCode.KEY_A);
    assert.strictEqual(b.evaluate(registry), 0);
  });

  it("serializes and deserializes", () => {
    const b = new KeyBinding(KeyCode.ENTER);
    const data = b.serialize();
    assert.deepStrictEqual(data, { type: "key", keyCode: KeyCode.ENTER });
    const restored = KeyBinding.deserialize(data);
    assert.strictEqual(restored.keyCode, KeyCode.ENTER);
  });
});

describe("MouseButtonBinding", () => {
  it("returns type 'mouseButton'", () => {
    const b = new MouseButtonBinding(MouseButton.LEFT);
    assert.strictEqual(b.type, "mouseButton");
  });

  it("stores button", () => {
    const b = new MouseButtonBinding(MouseButton.RIGHT);
    assert.strictEqual(b.button, MouseButton.RIGHT);
  });

  it("returns 1 when button is held", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    mouse.update(queueWith(pointerDown(MouseButton.LEFT)));

    const b = new MouseButtonBinding(MouseButton.LEFT);
    assert.strictEqual(b.evaluate(registry), 1);
  });

  it("returns 0 when button is not held", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    const b = new MouseButtonBinding(MouseButton.LEFT);
    assert.strictEqual(b.evaluate(registry), 0);
  });

  it("returns 0 when mouse is not registered", () => {
    const b = new MouseButtonBinding(MouseButton.LEFT);
    assert.strictEqual(b.evaluate(new DeviceRegistry()), 0);
  });

  it("returns 0 after button is released", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    mouse.update(queueWith(pointerDown(MouseButton.RIGHT)));
    mouse.update(queueWith(pointerUp(MouseButton.RIGHT)));

    const b = new MouseButtonBinding(MouseButton.RIGHT);
    assert.strictEqual(b.evaluate(registry), 0);
  });

  it("serializes and deserializes", () => {
    const b = new MouseButtonBinding(MouseButton.BACK);
    const data = b.serialize();
    assert.deepStrictEqual(data, { type: "mouseButton", button: MouseButton.BACK });
    const restored = MouseButtonBinding.deserialize(data);
    assert.strictEqual(restored.button, MouseButton.BACK);
  });
});

describe("WheelBinding", () => {
  it("returns type 'wheel'", () => {
    const b = new WheelBinding();
    assert.strictEqual(b.type, "wheel");
  });

  it("defaults direction to 'vertical'", () => {
    const b = new WheelBinding();
    assert.strictEqual(b.direction, "vertical");
  });

  it("returns > 0 when wheel is scrolled", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    mouse.update(queueWith(wheelEvent(120)));

    const b = new WheelBinding();
    assert.ok(b.evaluate(registry) > 0);
  });

  it("returns 0 without wheel events", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    const b = new WheelBinding();
    assert.strictEqual(b.evaluate(registry), 0);
  });

  it("returns 0 when mouse is not registered", () => {
    const b = new WheelBinding();
    assert.strictEqual(b.evaluate(new DeviceRegistry()), 0);
  });

  it("detects 'up' direction only", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    mouse.update(queueWith(wheelEvent(120)));

    const up = new WheelBinding("up");
    assert.ok(up.evaluate(registry) > 0);

    const down = new WheelBinding("down");
    assert.strictEqual(down.evaluate(registry), 0);
  });

  it("detects 'down' direction only", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    mouse.update(queueWith(wheelEvent(-120)));

    const down = new WheelBinding("down");
    assert.ok(down.evaluate(registry) > 0);

    const up = new WheelBinding("up");
    assert.strictEqual(up.evaluate(registry), 0);
  });

  it("returns 0 after wheel is reset", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    mouse.update(queueWith(wheelEvent(120)));
    mouse.resetWheel();

    const b = new WheelBinding();
    assert.strictEqual(b.evaluate(registry), 0);
  });

  it("serializes and deserializes", () => {
    const b = new WheelBinding("horizontal");
    const data = b.serialize();
    assert.deepStrictEqual(data, { type: "wheel", direction: "horizontal" });
    const restored = WheelBinding.deserialize(data);
    assert.strictEqual(restored.direction, "horizontal");
  });
});
