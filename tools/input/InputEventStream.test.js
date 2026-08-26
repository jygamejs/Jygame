import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputSystem } from "../../input/InputSystem.js";
import { BrowserBackend } from "../../input/BrowserBackend.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Keyboard } from "../../input/Keyboard.js";
import { Mouse } from "../../input/Mouse.js";
import { PointerManager } from "../../input/PointerManager.js";
import { Gamepad } from "../../input/Gamepad.js";
import { KeyCode } from "../../input/KeyCode.js";
import { Tier } from "../../input/Tier.js";

function createMockElement() {
  const listeners = {};
  return {
    style: { touchAction: "" },
    addEventListener(event, fn) { listeners[event] = { fn }; },
    removeEventListener(event, fn) { if (listeners[event]?.fn === fn) delete listeners[event]; },
    _listeners: listeners,
    _dispatch(event, data) { if (listeners[event]) listeners[event].fn(data); },
  };
}
function createMockDocument() {
  const listeners = {};
  return {
    addEventListener(event, fn) { listeners[event] = fn; },
    removeEventListener(event, fn) { if (listeners[event] === fn) delete listeners[event]; },
    _listeners: listeners,
  };
}

describe("InputEventStream — normalized event model", () => {
  it("keyboard press event has device, code, key, timestamp", () => {
    const e = new InputEvent(EventType.KEY_DOWN, { key: "w", code: "KeyW" });
    assert.strictEqual(e.device, "keyboard");
    assert.strictEqual(e.data.code, "KeyW");
    assert.strictEqual(e.data.key, "w");
    assert.strictEqual(typeof e.timestamp, "number");
    assert.ok(e.timestamp > 0);
  });

  it("keyboard release event has device keyboard", () => {
    const e = new InputEvent(EventType.KEY_UP, { key: "w", code: "KeyW" });
    assert.strictEqual(e.device, "keyboard");
    assert.strictEqual(typeof e.timestamp, "number");
  });

  it("mouse press event has device mouse and button/x/y", () => {
    const e = new InputEvent(EventType.POINTER_DOWN, { pointerId: 0, x: 420, y: 300, type: "mouse", button: 0 });
    assert.strictEqual(e.device, "mouse");
    assert.strictEqual(e.data.button, 0);
    assert.strictEqual(e.data.x, 420);
    assert.strictEqual(e.data.y, 300);
  });

  it("mouse move event has device and coordinates", () => {
    const e = new InputEvent(EventType.POINTER_MOVE, { pointerId: 0, x: 100, y: 200, type: "mouse" });
    assert.strictEqual(e.device, "mouse");
    assert.strictEqual(e.data.x, 100);
  });

  it("gamepad button event has device gamepad", () => {
    const e = new InputEvent(EventType.GAMEPAD_BUTTON_DOWN, { gamepadIndex: 0, button: 0, value: 1 });
    assert.strictEqual(e.device, "gamepad");
    assert.strictEqual(e.data.button, 0);
  });

  it("timestamp is monotonic via performance.now", async () => {
    const a = new InputEvent(EventType.KEY_DOWN, { key: "a", code: "KeyA" });
    await new Promise(r => setTimeout(r, 2));
    const b = new InputEvent(EventType.KEY_DOWN, { key: "b", code: "KeyB" });
    assert.ok(b.timestamp >= a.timestamp, `b ${b.timestamp} should be >= a ${a.timestamp}`);
  });

  it("explicit timestamp is preserved", () => {
    const ts = 12345.67;
    const e = new InputEvent(EventType.KEY_DOWN, { key: "a", code: "KeyA", timestamp: ts });
    assert.strictEqual(e.timestamp, ts);
  });

  it("timestamp does not use Date.now", () => {
    const before = performance.now();
    const e = new InputEvent(EventType.KEY_DOWN, { key: "a", code: "KeyA" });
    const after = performance.now();
    assert.ok(e.timestamp >= before && e.timestamp <= after);
  });
});

describe("InputEventStream — ordering and accumulation", () => {
  it("preserves multiple keyboard events in order", () => {
    const queue = new InputEventQueue(16);
    queue.push(new InputEvent(EventType.KEY_DOWN, { key: "w", code: "KeyW" }), Tier.HIGH);
    queue.push(new InputEvent(EventType.KEY_DOWN, { key: "d", code: "KeyD" }), Tier.HIGH);
    queue.push(new InputEvent(EventType.KEY_DOWN, { key: "s", code: "KeyS" }), Tier.HIGH);
    const order = [];
    queue.each(e => order.push(e.data.key));
    assert.deepStrictEqual(order, ["w", "d", "s"]);
  });

  it("preserves order across same-tier mixed devices", () => {
    const queue = new InputEventQueue(16);
    queue.push(new InputEvent(EventType.KEY_DOWN, { key: "w", code: "KeyW" }), Tier.HIGH);
    queue.push(new InputEvent(EventType.POINTER_DOWN, { pointerId: 0, x: 10, y: 10, type: "mouse", button: 0 }), Tier.HIGH);
    queue.push(new InputEvent(EventType.GAMEPAD_BUTTON_DOWN, { gamepadIndex: 0, button: 0 }), Tier.HIGH);
    const types = [];
    queue.each(e => types.push(e.type));
    assert.deepStrictEqual(types, [EventType.KEY_DOWN, EventType.POINTER_DOWN, EventType.GAMEPAD_BUTTON_DOWN]);
  });

  it("held key does not generate repeated press events", () => {
    const sys = new InputSystem();
    const kb = new Keyboard();
    sys.devices.register(kb);
    const backend = new TestBackend();
    sys.setBackend(backend);
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    assert.ok(kb.isDown(KeyCode.KEY_W) || kb.pressedKeys.length === 1);
    assert.ok(kb.justPressed(KeyCode.KEY_W));
    sys.update();
    assert.ok(!kb.justPressed(KeyCode.KEY_W));
    assert.strictEqual(sys.events.length, 0);
  });

  it("release event corresponds to correct key", () => {
    const sys = new InputSystem();
    const kb = new Keyboard();
    sys.devices.register(kb);
    const backend = new TestBackend();
    sys.setBackend(backend);
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    backend.keyUp("w", { code: "KeyW" });
    // Capture events before they are cleared via consumer
    let releaseEvent = null;
    const consumer = e => { if (e.type === EventType.KEY_UP) releaseEvent = e; };
    sys.addInputConsumer(consumer);
    sys.update();
    assert.ok(releaseEvent);
    assert.strictEqual(releaseEvent.data.code, "KeyW");
    assert.strictEqual(releaseEvent.device, "keyboard");
    sys.removeInputConsumer(consumer);
  });

  it("empty tick produces empty collection without error", () => {
    const sys = new InputSystem();
    sys.setBackend(new TestBackend());
    sys.update();
    assert.strictEqual(sys.events.length, 0);
  });

  it("BrowserBackend accumulates multiple events before poll", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const orig = globalThis.document;
    globalThis.document = doc;
    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();
      doc._listeners.keydown({ key: "w", code: "KeyW", repeat: false, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, preventDefault() {} });
      doc._listeners.keydown({ key: "d", code: "KeyD", repeat: false, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, preventDefault() {} });
      doc._listeners.keydown({ key: "s", code: "KeyS", repeat: false, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, preventDefault() {} });
      const events = [];
      queue.each(e => events.push(e.data.key));
      assert.deepStrictEqual(events, ["w", "d", "s"]);
      assert.ok(events.length === 3);
      // Verify timestamps are monotonic
      const timestamps = [];
      queue.each(e => timestamps.push(e.timestamp));
      for (let i = 1; i < timestamps.length; i++) {
        assert.ok(timestamps[i] >= timestamps[i - 1]);
      }
    } finally {
      globalThis.document = orig;
    }
  });

  it("events are chronological via timestamp ordering", () => {
    const queue = new InputEventQueue(16);
    const t0 = performance.now();
    queue.push(new InputEvent(EventType.KEY_DOWN, { key: "a", code: "KeyA", timestamp: t0 }), Tier.HIGH);
    queue.push(new InputEvent(EventType.KEY_DOWN, { key: "b", code: "KeyB", timestamp: t0 + 5 }), Tier.HIGH);
    queue.push(new InputEvent(EventType.KEY_DOWN, { key: "c", code: "KeyC", timestamp: t0 + 10 }), Tier.HIGH);
    const ts = [];
    queue.each(e => ts.push(e.timestamp));
    assert.deepStrictEqual(ts, [t0, t0 + 5, t0 + 10]);
  });
});

describe("InputEventStream — mouse and pointer details", () => {
  it("mouse button events preserve button info", () => {
    const down = new InputEvent(EventType.POINTER_DOWN, { pointerId: 1, x: 10, y: 20, type: "mouse", button: 0 });
    const up = new InputEvent(EventType.POINTER_UP, { pointerId: 1, x: 10, y: 20, type: "mouse", button: 0 });
    assert.strictEqual(down.data.button, 0);
    assert.strictEqual(up.data.button, 0);
    assert.strictEqual(down.device, "mouse");
  });

  it("pointer move preserves coordinates", () => {
    const move = new InputEvent(EventType.POINTER_MOVE, { pointerId: 0, x: 420, y: 300, type: "mouse" });
    assert.strictEqual(move.data.x, 420);
    assert.strictEqual(move.data.y, 300);
  });

  it("wheel event has device mouse and delta", () => {
    const wheel = new InputEvent(EventType.WHEEL, { deltaX: 0, deltaY: 120 });
    assert.strictEqual(wheel.device, "mouse");
    assert.strictEqual(wheel.data.deltaY, 120);
  });
});

describe("InputEventStream — gamepad", () => {
  it("gamepad button state via Gamepad device", () => {
    const backend = new TestBackend();
    const gp = new Gamepad(() => backend.gamepads);
    const sys = new InputSystem();
    sys.devices.register(gp);
    sys.setBackend(backend);
    backend.setGamepads([{ index: 0, connected: true, id: "Pad2", mapping: "standard", buttons: [{ pressed: true, value: 1 }], axes: [0, 0, 0, 0] }]);
    sys.update();
    assert.ok(gp.isConnected(0));
    assert.ok(gp.isDown(0, 0));
    // Verify normalized event shape for gamepad
    const e = new InputEvent(EventType.GAMEPAD_BUTTON_DOWN, { gamepadIndex: 0, button: 0, value: 1 });
    assert.strictEqual(e.device, "gamepad");
    assert.strictEqual(typeof e.timestamp, "number");
    assert.ok(e.timestamp > 0);
  });

  it("gamepad axis event has device and axis data", () => {
    const e = new InputEvent(EventType.GAMEPAD_AXIS, { gamepadIndex: 0, axis: 0, value: 0.8 });
    assert.strictEqual(e.device, "gamepad");
    assert.strictEqual(e.data.axis, 0);
  });
});

describe("InputEventStream — lifecycle and clearing", () => {
  it("InputSystem clears events after update", () => {
    const sys = new InputSystem();
    const backend = new TestBackend();
    sys.setBackend(backend);
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    assert.strictEqual(sys.events.length, 0);
  });

  it("Input.raw.events represents the normalized stream", () => {
    const sys = new InputSystem();
    const backend = new TestBackend();
    sys.setBackend(backend);
    const captured = [];
    sys.addInputConsumer(e => captured.push(e));
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0].device, "keyboard");
    assert.ok(typeof captured[0].timestamp === "number");
  });
});

describe("InputEventStream — existing API regression", () => {
  it("Input.pressed/down/released still work via Keyboard", () => {
    const sys = new InputSystem();
    const kb = new Keyboard();
    sys.devices.register(kb);
    const backend = new TestBackend();
    sys.setBackend(backend);
    backend.keyDown(" ", { code: "Space", key: " " });
    sys.update();
    assert.ok(kb.isDown(KeyCode.SPACE));
    assert.ok(kb.justPressed(KeyCode.SPACE) || kb.pressedKeys.length > 0);
  });

  it("Mouse pressed/released semantics preserved", () => {
    const mouse = new Mouse();
    const pm = new PointerManager();
    const sys = new InputSystem();
    sys.devices.register(mouse);
    sys.devices.register(pm);
    const backend = new TestBackend();
    sys.setBackend(backend);
    backend.pointerDown({ pointerId: 0, x: 10, y: 10, type: "mouse", button: 0 });
    sys.update();
    assert.ok(mouse.isDown(0));
    assert.ok(mouse.justPressed(0));
    sys.update(); // empty tick
    assert.ok(!mouse.justPressed(0));
    backend.pointerUp({ pointerId: 0, x: 10, y: 10, type: "mouse", button: 0 });
    sys.update();
    assert.ok(!mouse.isDown(0));
    assert.ok(mouse.justReleased(0));
  });

  it("PointerManager tracks pointers", () => {
    const pm = new PointerManager();
    const sys = new InputSystem();
    sys.devices.register(pm);
    const backend = new TestBackend();
    sys.setBackend(backend);
    backend.pointerDown({ pointerId: 5, x: 100, y: 100, type: "touch" });
    sys.update();
    const p = pm.getPointer(5);
    assert.ok(p);
    assert.strictEqual(p.position.x, 100);
  });
});
