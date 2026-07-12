import { describe, it } from "node:test";
import * as assert from "node:assert";
import { DeviceRegistry } from "../../input/DeviceRegistry.js";
import { Keyboard } from "../../input/Keyboard.js";
import { Mouse } from "../../input/Mouse.js";
import { KeyCode } from "../../input/KeyCode.js";
import { Modifier } from "../../input/Modifier.js";
import { MouseButton } from "../../input/MouseButton.js";
import { GestureEngine } from "../../input/GestureEngine.js";
import { PointerManager } from "../../input/PointerManager.js";
import { GestureType } from "../../input/GestureType.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";
import { ActionKind } from "../../input/ActionKind.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { ChordBinding } from "../../input/actions/ChordBinding.js";
import { CompositeBinding } from "../../input/actions/CompositeBinding.js";
import { GestureBinding } from "../../input/actions/GestureBinding.js";
import { GamepadButtonBinding } from "../../input/actions/GamepadButtonBinding.js";
import { GamepadAxisBinding } from "../../input/actions/GamepadAxisBinding.js";

function keyDown(domCode, options = {}) {
  return new InputEvent(EventType.KEY_DOWN, {
    key: "?", code: domCode, repeat: false,
    ctrl: false, shift: false, alt: false, meta: false,
    printable: false,
    ...options,
  });
}

function keyUp(domCode) {
  return new InputEvent(EventType.KEY_UP, {
    key: "?", code: domCode,
    ctrl: false, shift: false, alt: false, meta: false,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("ChordBinding", () => {
  it("returns type 'chord'", () => {
    const c = new ChordBinding(KeyCode.KEY_S, { ctrl: true });
    assert.strictEqual(c.type, "chord");
  });

  it("matches key + ctrl", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    kb.update(queueWith(
      keyDown("ControlLeft", { ctrl: true }),
      keyDown("KeyS", { ctrl: true }),
    ));

    const c = new ChordBinding(KeyCode.KEY_S, { ctrl: true });
    assert.strictEqual(c.evaluate(registry), 1);
  });

  it("rejects when ctrl is not held", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    kb.update(queueWith(keyDown("KeyS")));

    const c = new ChordBinding(KeyCode.KEY_S, { ctrl: true });
    assert.strictEqual(c.evaluate(registry), 0);
  });

  it("rejects when primary key is not held", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    kb.update(queueWith(keyDown("ControlLeft", { ctrl: true })));

    const c = new ChordBinding(KeyCode.KEY_S, { ctrl: true });
    assert.strictEqual(c.evaluate(registry), 0);
  });

  it("returns 0 when keyboard is not registered", () => {
    const c = new ChordBinding(KeyCode.KEY_S, { ctrl: true });
    assert.strictEqual(c.evaluate(new DeviceRegistry()), 0);
  });

  it("matches key + shift + ctrl", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    kb.update(queueWith(
      keyDown("ControlLeft", { ctrl: true }),
      keyDown("ShiftLeft", { shift: true }),
      keyDown("KeyS", { ctrl: true, shift: true }),
    ));

    const c = new ChordBinding(KeyCode.KEY_S, { ctrl: true, shift: true });
    assert.strictEqual(c.evaluate(registry), 1);
  });

  it("serializes and deserializes", () => {
    const c = new ChordBinding(KeyCode.KEY_Z, { ctrl: true, shift: true });
    const data = c.serialize();
    assert.deepStrictEqual(data, {
      type: "chord", keyCode: KeyCode.KEY_Z,
      ctrl: true, shift: true, alt: false, meta: false,
      processors: [],
    });
    const restored = ChordBinding.deserialize(data);
    assert.strictEqual(restored.keyCode, KeyCode.KEY_Z);
  });
});

describe("CompositeBinding", () => {
  function makeWASD() {
    return new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_D), vector: [1, 0] },
      { binding: new KeyBinding(KeyCode.KEY_A), vector: [-1, 0] },
      { binding: new KeyBinding(KeyCode.KEY_W), vector: [0, -1] },
      { binding: new KeyBinding(KeyCode.KEY_S), vector: [0, 1] },
    ]);
  }

  function setupKeyboard(domKeys) {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);
    kb.update(queueWith(...domKeys.map(k => keyDown(k))));
    return registry;
  }

  it("returns type 'composite'", () => {
    const c = new CompositeBinding(ActionKind.VECTOR2, []);
    assert.strictEqual(c.type, "composite");
  });

  it("stores kind", () => {
    const c = new CompositeBinding(ActionKind.VECTOR2, []);
    assert.strictEqual(c.kind, ActionKind.VECTOR2);
  });

  it("returns zero vector with no input", () => {
    const c = makeWASD();
    const registry = setupKeyboard([]);
    c.evaluate(registry);
    assert.deepStrictEqual(c.vector, { x: 0, y: 0 });
  });

  it("returns positive X for D key", () => {
    const c = makeWASD();
    const registry = setupKeyboard(["KeyD"]);
    c.evaluate(registry);
    assert.strictEqual(c.vector.x, 1);
    assert.strictEqual(c.vector.y, 0);
  });

  it("returns negative X for A key", () => {
    const c = makeWASD();
    const registry = setupKeyboard(["KeyA"]);
    c.evaluate(registry);
    assert.strictEqual(c.vector.x, -1);
    assert.strictEqual(c.vector.y, 0);
  });

  it("returns negative Y for W key", () => {
    const c = makeWASD();
    const registry = setupKeyboard(["KeyW"]);
    c.evaluate(registry);
    assert.strictEqual(c.vector.x, 0);
    assert.strictEqual(c.vector.y, -1);
  });

  it("returns positive Y for S key", () => {
    const c = makeWASD();
    const registry = setupKeyboard(["KeyS"]);
    c.evaluate(registry);
    assert.strictEqual(c.vector.x, 0);
    assert.strictEqual(c.vector.y, 1);
  });

  it("normalizes diagonal (W+D)", () => {
    const c = makeWASD();
    const registry = setupKeyboard(["KeyW", "KeyD"]);
    c.evaluate(registry);
    const len = Math.sqrt(c.vector.x * c.vector.x + c.vector.y * c.vector.y);
    assert.ok(Math.abs(len - 1) < 0.001);
    assert.ok(c.vector.x > 0);
    assert.ok(c.vector.y < 0);
  });

  it("returns 0 with no registered devices", () => {
    const c = makeWASD();
    assert.strictEqual(c.evaluate(new DeviceRegistry()), 0);
  });
});

describe("GestureBinding", () => {
  it("returns type 'gesture'", () => {
    const g = new GestureBinding(GestureType.TAP);
    assert.strictEqual(g.type, "gesture");
  });

  it("stores gestureType", () => {
    const g = new GestureBinding(GestureType.SWIPE);
    assert.strictEqual(g.gestureType, GestureType.SWIPE);
  });

  it("returns 0 when GestureEngine is not registered", () => {
    const g = new GestureBinding(GestureType.TAP);
    assert.strictEqual(g.evaluate(new DeviceRegistry()), 0);
  });

  it("returns 1 when gesture is detected", () => {
    const registry = new DeviceRegistry();
    const pm = new PointerManager();
    const ge = new GestureEngine(pm);
    registry.register(ge);
    const q = new InputEventQueue(64);

    const down = new InputEvent(EventType.POINTER_DOWN, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
      width: 10, height: 12, isPrimary: true,
    });
    const up = new InputEvent(EventType.POINTER_UP, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0, isPrimary: true,
    });

    q.push(down, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);

    q.push(up, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);

    const g = new GestureBinding(GestureType.TAP);
    assert.strictEqual(g.evaluate(registry), 1);
  });

  it("serializes and deserializes", () => {
    const g = new GestureBinding(GestureType.PINCH);
    const data = g.serialize();
    assert.deepStrictEqual(data, { type: "gesture", gestureType: GestureType.PINCH, processors: [] });
    const restored = GestureBinding.deserialize(data);
    assert.strictEqual(restored.gestureType, GestureType.PINCH);
  });
});

describe("GamepadButtonBinding", () => {
  it("returns type 'gamepadButton'", () => {
    const g = new GamepadButtonBinding(0);
    assert.strictEqual(g.type, "gamepadButton");
  });

  it("stores button and index", () => {
    const g = new GamepadButtonBinding(7, 1);
    assert.strictEqual(g.button, 7);
    assert.strictEqual(g.gamepadIndex, 1);
  });

  it("evaluate returns 0 (not yet implemented)", () => {
    const g = new GamepadButtonBinding(0);
    assert.strictEqual(g.evaluate(new DeviceRegistry()), 0);
  });

  it("serializes and deserializes", () => {
    const g = new GamepadButtonBinding(3, 0);
    const data = g.serialize();
    assert.deepStrictEqual(data, { type: "gamepadButton", button: 3, gamepadIndex: 0, processors: [] });
    const restored = GamepadButtonBinding.deserialize(data);
    assert.strictEqual(restored.button, 3);
  });
});

describe("GamepadAxisBinding", () => {
  it("returns type 'gamepadAxis'", () => {
    const g = new GamepadAxisBinding(0);
    assert.strictEqual(g.type, "gamepadAxis");
  });

  it("stores axis and index", () => {
    const g = new GamepadAxisBinding(2, 1);
    assert.strictEqual(g.axis, 2);
    assert.strictEqual(g.gamepadIndex, 1);
  });

  it("evaluate returns 0 (not yet implemented)", () => {
    const g = new GamepadAxisBinding(0);
    assert.strictEqual(g.evaluate(new DeviceRegistry()), 0);
  });

  it("serializes and deserializes", () => {
    const g = new GamepadAxisBinding(1, 0);
    const data = g.serialize();
    assert.deepStrictEqual(data, { type: "gamepadAxis", axis: 1, gamepadIndex: 0, processors: [] });
    const restored = GamepadAxisBinding.deserialize(data);
    assert.strictEqual(restored.axis, 1);
  });
});
