import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Input } from "../../input/Input.js";
import { Mouse } from "../../input/Mouse.js";
import { PointerManager } from "../../input/PointerManager.js";
import { MouseButton } from "../../input/MouseButton.js";
import { HeadlessHost } from "../../core/Host.js";
import { CoordinateSystem } from "../../input/CoordinateSystem.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";

function setup(opts = {}) {
  const sys = new InputSystem(opts);
  const host = new HeadlessHost();
  const el = host.createElement("canvas");
  // Ensure canvas has style object
  el.style = el.style || { cursor: "" };
  sys.domElement = el;
  sys.host = host;
  const backend = new TestBackend();
  sys.setBackend(backend);
  sys.devices.register(new Mouse());
  sys.devices.register(new PointerManager());
  if (opts.coordinateSystem) sys.coordinateSystem = opts.coordinateSystem;
  Input.setSystem(sys);
  return { sys, host, el, backend };
}

function ptrEvent(type, data = {}) {
  return new InputEvent(type, { pointerId: 0, x: 0, y: 0, type: "mouse", button: 0, pressure: 0.5, isPrimary: true, ...data });
}

describe("Phase5 — Input.mouse exists", () => {
  it("Input.mouse is first-class facade", () => {
    const { sys } = setup();
    assert.ok(Input.mouse);
    assert.ok(typeof Input.mouse.x === "number");
    assert.ok(Input.mouse.cursor);
    assert.ok(Input.mouse.pointerLock);
  });
});

// Position
describe("Phase5 — position", () => {
  it("mouse position via Mouse device and pointer consistency", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 10, y: 20, type: "mouse" }), tier: Tier.HIGH });
    sys.update();
    assert.strictEqual(Input.mouse.x, 10);
    assert.strictEqual(Input.mouse.y, 20);
    assert.strictEqual(Input.mouse.hasPosition, true);
    assert.strictEqual(Input.pointer.x, 10);
    assert.strictEqual(Input.pointer.y, 20);
  });

  it("world position via CoordinateSystem", () => {
    const cs = new CoordinateSystem({ canvasRect: { x: 10, y: 20, width: 800, height: 600 }, devicePixelRatio: 2 });
    const { sys, backend } = setup({ coordinateSystem: cs });
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 100, y: 100, type: "mouse" }), tier: Tier.HIGH });
    sys.update();
    // toViewport: (100-10)/2=45
    assert.strictEqual(Input.mouse.x, 45);
    assert.strictEqual(Input.mouse.worldX, 45);
    assert.strictEqual(Input.pointer.x, 45);
  });

  it("hasPosition false initially, true after move, persists after release", () => {
    const { sys, backend } = setup();
    assert.strictEqual(Input.mouse.hasPosition, false);
    assert.strictEqual(Input.pointer.hasPosition, false);
    backend._events.push({ event: ptrEvent(EventType.POINTER_MOVE, { x: 30, y: 40, type: "mouse" }), tier: Tier.LOW });
    sys.update();
    assert.strictEqual(Input.mouse.hasPosition, true);
    assert.strictEqual(Input.pointer.hasPosition, true);
    backend._events.push({ event: ptrEvent(EventType.POINTER_UP, { x: 30, y: 40, type: "mouse", button: 0 }), tier: Tier.HIGH });
    sys.update();
    assert.strictEqual(Input.mouse.hasPosition, true);
    assert.strictEqual(Input.pointer.hasPosition, true);
    assert.strictEqual(Input.mouse.x, 30);
  });

  it("(0,0) is valid initialized position", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_MOVE, { x: 0, y: 0, type: "mouse" }), tier: Tier.LOW });
    sys.update();
    assert.strictEqual(Input.mouse.hasPosition, true);
    assert.strictEqual(Input.mouse.x, 0);
    assert.strictEqual(Input.mouse.y, 0);
    assert.strictEqual(Input.pointer.hasPosition, true);
  });

  it("touch does not populate mouse position or buttons", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 200, y: 300, type: "touch", button: 0 }), tier: Tier.HIGH });
    sys.update();
    assert.strictEqual(Input.mouse.left.down, false);
    // mouse position stays at 0,0 (or transformed 0)
    assert.strictEqual(Input.mouse.x, 0);
    // pointer reflects touch
    assert.strictEqual(Input.pointer.x, 200);
    assert.strictEqual(Input.pointer.y, 300);
  });
});

// Movement
describe("Phase5 — movement", () => {
  it("deltaX/deltaY represent movement since previous tick", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 0, y: 0, type: "mouse" }), tier: Tier.HIGH });
    sys.update();
    backend._events.push({ event: ptrEvent(EventType.POINTER_MOVE, { x: 10, y: 15, type: "mouse" }), tier: Tier.LOW });
    sys.update();
    assert.strictEqual(Input.mouse.deltaX, 10);
    assert.strictEqual(Input.mouse.deltaY, 15);
    // pointer delta also, but ensure mouse delta doesn't corrupt pointer when mouse moves
    assert.strictEqual(Input.pointer.deltaX, 10);
  });

  it("delta resets per tick", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 0, y: 0, type: "mouse" }), tier: Tier.HIGH });
    sys.update();
    backend._events.push({ event: ptrEvent(EventType.POINTER_MOVE, { x: 5, y: 5, type: "mouse" }), tier: Tier.LOW });
    sys.update();
    assert.strictEqual(Input.mouse.deltaX, 5);
    sys.update();
    assert.strictEqual(Input.mouse.deltaX, 0);
    assert.strictEqual(Input.mouse.deltaY, 0);
  });

  it("mouse movement does not corrupt pointer when pointer has own delta", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { pointerId: 0, x: 0, y: 0, type: "mouse" }), tier: Tier.HIGH });
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { pointerId: 1, x: 100, y: 100, type: "touch" }), tier: Tier.HIGH });
    sys.update();
    // pointer primary is still mouse (first pointer) but test that mouse-specific delta is isolated
    backend._events.push({ event: ptrEvent(EventType.POINTER_MOVE, { pointerId: 0, x: 10, y: 0, type: "mouse" }), tier: Tier.LOW });
    sys.update();
    assert.strictEqual(Input.mouse.deltaX, 10);
  });
});

// Buttons
describe("Phase5 — buttons", () => {
  const buttons = [
    ["left", MouseButton.LEFT, 0],
    ["right", MouseButton.RIGHT, 2],
    ["middle", MouseButton.MIDDLE, 1],
    ["back", MouseButton.BACK, 3],
    ["forward", MouseButton.FORWARD, 4],
  ];
  for (const [name, idx, btn] of buttons) {
    it(`${name} down/pressed/released`, () => {
      const { sys, backend } = setup();
      backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { type: "mouse", button: btn }), tier: Tier.HIGH });
      sys.update();
      assert.strictEqual(Input.mouse[name].down, true);
      assert.strictEqual(Input.mouse[name].pressed, true);
      assert.strictEqual(Input.mouse.isDown(name), true);
      assert.strictEqual(Input.mouse.pressed(name), true);
      sys.update();
      assert.strictEqual(Input.mouse[name].pressed, false);
      assert.strictEqual(Input.mouse[name].down, true);
      backend._events.push({ event: ptrEvent(EventType.POINTER_UP, { type: "mouse", button: btn }), tier: Tier.HIGH });
      sys.update();
      assert.strictEqual(Input.mouse[name].released, true);
      assert.strictEqual(Input.mouse.released(name), true);
      assert.strictEqual(Input.mouse[name].down, false);
      sys.update();
      assert.strictEqual(Input.mouse[name].released, false);
    });
  }

  it("generic button() returns ergonomic object", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { type: "mouse", button: 0 }), tier: Tier.HIGH });
    sys.update();
    const b = Input.mouse.button("left");
    assert.strictEqual(b.down, true);
    assert.strictEqual(b.pressed, true);
    assert.strictEqual(Input.mouse.button("unknown"), null);
  });

  it("compatibility Input.pressed LEFT_MOUSE", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { type: "mouse", button: 0 }), tier: Tier.HIGH });
    sys.update();
    assert.strictEqual(Input.pressed("LEFT_MOUSE"), true);
    assert.strictEqual(Input.down("LEFT_MOUSE"), true);
    assert.strictEqual(Input.pressed("MOUSE_LEFT"), true);
    backend._events.push({ event: ptrEvent(EventType.POINTER_UP, { type: "mouse", button: 0 }), tier: Tier.HIGH });
    sys.update();
    assert.strictEqual(Input.released("LEFT_MOUSE"), true);
  });

  it("touch does not set mouse buttons", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { type: "touch", button: 0 }), tier: Tier.HIGH });
    sys.update();
    assert.strictEqual(Input.mouse.left.down, false);
    assert.strictEqual(Input.mouse.isDown("left"), false);
  });
});

// Wheel
describe("Phase5 — wheel", () => {
  it("vertical and horizontal wheel via mouse facade", () => {
    const { sys, backend } = setup();
    backend.wheel({ deltaY: 100, deltaX: 50 });
    sys.update();
    assert.strictEqual(Input.mouse.wheel, 100);
    assert.strictEqual(Input.mouse.wheelX, 50);
    assert.strictEqual(Input.wheel, 100);
    assert.strictEqual(Input.wheelX, 50);
  });

  it("wheel tick reset", () => {
    const { sys, backend } = setup();
    backend.wheel({ deltaY: 120 });
    sys.update();
    assert.strictEqual(Input.mouse.wheel, 120);
    sys.update();
    assert.strictEqual(Input.mouse.wheel, 0);
    assert.strictEqual(Input.wheel, 0);
  });

  it("mouse facade and top-level aliases agree", () => {
    const { sys, backend } = setup();
    backend.wheel({ deltaY: 30 });
    sys.update();
    assert.strictEqual(Input.mouse.wheel, Input.wheel);
    assert.strictEqual(Input.mouse.wheelX, Input.wheelX);
  });
});

// Cursor
describe("Phase5 — cursor", () => {
  it("visible true/false applies cursor none", () => {
    const { sys, el } = setup();
    assert.strictEqual(Input.mouse.cursor.visible, true);
    Input.mouse.cursor.visible = false;
    assert.strictEqual(el.style.cursor, "none");
    Input.mouse.cursor.visible = true;
    assert.strictEqual(el.style.cursor, "default");
  });

  it("style changes", () => {
    const { el } = setup();
    Input.mouse.cursor.style = "crosshair";
    assert.strictEqual(el.style.cursor, "crosshair");
    Input.mouse.cursor.style = "pointer";
    assert.strictEqual(el.style.cursor, "pointer");
  });

  it("custom image with hotspot", () => {
    const { el } = setup();
    Input.mouse.cursor.setImage("assets/cursor.png", { x: 4, y: 7 });
    assert.ok(el.style.cursor.includes('url("assets/cursor.png")'));
    assert.ok(el.style.cursor.includes("4 7"));
    assert.strictEqual(Input.mouse.cursor.image, "assets/cursor.png");
    assert.deepStrictEqual(Input.mouse.cursor.hotspot, { x: 4, y: 7 });
    Input.mouse.cursor.clearImage();
    assert.strictEqual(Input.mouse.cursor.image, null);
    assert.strictEqual(el.style.cursor, "default");
  });

  it("image setter via property", () => {
    const { el } = setup();
    Input.mouse.cursor.image = "a.png";
    assert.ok(el.style.cursor.includes('url("a.png")'));
    Input.mouse.cursor.image = null;
    assert.strictEqual(el.style.cursor, "default");
  });

  it("hotspot property", () => {
    const { el } = setup();
    Input.mouse.cursor.setImage("b.png", { x: 2, y: 2 });
    Input.mouse.cursor.hotspot = { x: 8, y: 8 };
    assert.ok(el.style.cursor.includes("8 8"));
  });

  it("reset and destroy cleanup", () => {
    const { sys, el } = setup();
    Input.mouse.cursor.visible = false;
    Input.mouse.cursor.style = "crosshair";
    Input.mouse.cursor.setImage("x.png");
    Input.mouse.cursor.reset();
    assert.strictEqual(Input.mouse.cursor.visible, true);
    assert.strictEqual(Input.mouse.cursor.style, "default");
    assert.strictEqual(Input.mouse.cursor.image, null);
    assert.strictEqual(el.style.cursor, "default");
    sys.destroy();
    assert.strictEqual(el.style.cursor, "");
  });
});

// Pointer lock
describe("Phase5 — pointer lock", () => {
  it("initial unlocked", () => {
    const { sys } = setup();
    assert.strictEqual(Input.mouse.pointerLock.isLocked, false);
  });

  it("successful lock and unlock", async () => {
    const { sys } = setup();
    const r = await Input.mouse.pointerLock.lock();
    assert.strictEqual(r, true);
    assert.strictEqual(Input.mouse.pointerLock.isLocked, true);
    assert.strictEqual(sys.devices.get(Mouse).isPointerLocked, true);
    Input.mouse.pointerLock.unlock();
    // headless host fires pointerlockchange synchronously
    assert.strictEqual(Input.mouse.pointerLock.isLocked, false);
    assert.strictEqual(sys.devices.get(Mouse).isPointerLocked, false);
  });

  it("external browser unlock detected", async () => {
    const { sys, host } = setup();
    await Input.mouse.pointerLock.lock();
    assert.strictEqual(Input.mouse.pointerLock.isLocked, true);
    host.exitPointerLock();
    assert.strictEqual(Input.mouse.pointerLock.isLocked, false);
  });

  it("failed lock does not produce false locked state", async () => {
    const { sys, host } = setup();
    host.mockPointerLockShouldFail = true;
    const r = await Input.mouse.pointerLock.lock();
    assert.strictEqual(r, false);
    assert.strictEqual(Input.mouse.pointerLock.isLocked, false);
    host.mockPointerLockShouldFail = false;
    const r2 = await Input.mouse.pointerLock.lock();
    assert.strictEqual(r2, true);
    assert.strictEqual(Input.mouse.pointerLock.isLocked, true);
  });

  it("state synchronization via pointerlockchange", async () => {
    const { sys, host } = setup();
    await Input.mouse.pointerLock.lock();
    assert.ok(Input.mouse.pointerLock.isLocked);
    // simulate external change via host directly
    host.exitPointerLock();
    assert.strictEqual(Input.mouse.pointerLock.isLocked, false);
  });

  it("relative movement while locked", async () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 50, y: 60, type: "mouse" }), tier: Tier.HIGH });
    sys.update();
    const beforeX = Input.mouse.x;
    await Input.mouse.pointerLock.lock();
    backend._events.push({ event: new InputEvent(EventType.POINTER_MOVE, { pointerId: 0, x: 999, y: 999, type: "mouse", movementX: 10, movementY: -5 }), tier: Tier.LOW });
    sys.update();
    assert.strictEqual(Input.mouse.x, beforeX);
    assert.strictEqual(Input.mouse.deltaX, 10);
    assert.strictEqual(Input.mouse.deltaY, -5);
    // pointer facade also while locked retains last position but delta is relative
    assert.strictEqual(Input.pointer.x, beforeX);
    assert.strictEqual(Input.pointer.deltaX, 10);
  });

  it("absolute coordinates not confused with relative", async () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 100, y: 100, type: "mouse" }), tier: Tier.HIGH });
    sys.update();
    await Input.mouse.pointerLock.lock();
    const frozenX = Input.mouse.x;
    const frozenY = Input.mouse.y;
    backend._events.push({ event: new InputEvent(EventType.POINTER_MOVE, { pointerId: 0, x: 0, y: 0, type: "mouse", movementX: 3, movementY: 3 }), tier: Tier.LOW });
    sys.update();
    assert.strictEqual(Input.mouse.x, frozenX);
    assert.strictEqual(Input.mouse.y, frozenY);
    assert.strictEqual(Input.mouse.deltaX, 3);
  });

  it("cursor and pointer lock do not fight", async () => {
    const { el } = setup();
    Input.mouse.cursor.style = "crosshair";
    Input.mouse.cursor.visible = true;
    assert.strictEqual(el.style.cursor, "crosshair");
    await Input.mouse.pointerLock.lock();
    // while locked, cursor apply is suppressed; style stays crosshair but hidden by browser
    // After unlock, desired cursor restored
    Input.mouse.pointerLock.unlock();
    assert.strictEqual(el.style.cursor, "crosshair");
  });

  it("lifecycle cleanup on destroy and blur", async () => {
    const { sys, host } = setup();
    await Input.mouse.pointerLock.lock();
    assert.strictEqual(Input.mouse.pointerLock.isLocked, true);
    // blur should be handled via pointerlockchange listener (host emits blur -> manager checks host element)
    // In headless, blur alone doesn't clear pointerLockElement, but exit does
    // Simulate tab hide via host visibility
    sys.destroy();
    assert.strictEqual(Input.mouse.pointerLock.isLocked, false);
    assert.strictEqual(host.documentListenerCount, 0);
  });

  it("lock returns promise resolving to boolean", async () => {
    const { sys } = setup();
    const p = Input.mouse.pointerLock.lock();
    assert.ok(p instanceof Promise);
    const v = await p;
    assert.strictEqual(typeof v, "boolean");
  });
});

// Integration
describe("Phase5 — integration", () => {
  it("Mouse → InputEvent → InputSystem → Mouse state → Input.mouse", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 5, y: 5, type: "mouse", button: 0 }), tier: Tier.HIGH });
    sys.update();
    assert.strictEqual(Input.mouse.left.down, true);
    assert.strictEqual(Input.pressed("LEFT_MOUSE"), true);
  });

  it("Mouse → Input.pointer remains coherent", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: ptrEvent(EventType.POINTER_DOWN, { x: 12, y: 34, type: "mouse" }), tier: Tier.HIGH });
    sys.update();
    assert.strictEqual(Input.mouse.x, Input.pointer.x);
    assert.strictEqual(Input.mouse.y, Input.pointer.y);
    backend._events.push({ event: ptrEvent(EventType.POINTER_MOVE, { x: 20, y: 40, type: "mouse" }), tier: Tier.LOW });
    sys.update();
    assert.strictEqual(Input.mouse.x, 20);
    assert.strictEqual(Input.pointer.x, 20);
  });

  it("existing APIs intact: Input.events, history, repeated", () => {
    const { sys, backend } = setup();
    backend._events.push({ event: new InputEvent(EventType.KEY_DOWN, { key: "a", code: "KeyA" }), tier: Tier.HIGH });
    sys.update();
    assert.ok(Input.events().length >= 1);
    assert.ok(Input.history().length >= 1);
    assert.strictEqual(typeof Input.repeated, "function");
  });
});
