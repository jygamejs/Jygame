import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Input } from "../../input/Input.js";
import { EventType } from "../../input/EventType.js";
import { KeyCode } from "../../input/KeyCode.js";
import { Keyboard } from "../../input/Keyboard.js";
import { ActionKind } from "../../input/ActionKind.js";
import { ActionMap } from "../../input/actions/ActionMap.js";
import { InputContext } from "../../input/actions/InputContext.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { CompositeBinding } from "../../input/actions/CompositeBinding.js";
import { Gamepad } from "../../input/Gamepad.js";

function setup() {
  const sys = new InputSystem();
  const backend = new TestBackend();
  sys.setBackend(backend);
  Input.setSystem(sys);
  return { sys, backend };
}

describe("Phase2 — Input.events()", () => {
  it("empty tick returns empty frozen array", () => {
    const { sys, backend } = setup();
    sys.update();
    const ev = Input.events();
    assert.ok(Array.isArray(ev));
    assert.strictEqual(ev.length, 0);
    assert.ok(Object.isFrozen(ev));
  });
  it("one keyboard event", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    const ev = Input.events();
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].device, "keyboard");
    assert.strictEqual(ev[0].data.code, "KeyW");
    assert.ok(typeof ev[0].timestamp === "number");
  });
  it("multiple events preserved", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" });
    backend.keyDown("d", { code: "KeyD" });
    backend.keyDown("s", { code: "KeyS" });
    sys.update();
    const ev = Input.events();
    assert.deepStrictEqual(ev.map(e => e.data.key), ["w", "d", "s"]);
  });
  it("mouse events", () => {
    const { sys, backend } = setup();
    backend.pointerDown({ pointerId: 0, x: 10, y: 20, type: "mouse", button: 0 });
    sys.update();
    const ev = Input.events();
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].device, "mouse");
    assert.strictEqual(ev[0].type, EventType.POINTER_DOWN);
  });
  it("gamepad events", () => {
    const { sys, backend } = setup();
    const gp = new Gamepad(() => backend.gamepads);
    sys.devices.register(gp);
    backend.setGamepads([{ index: 0, connected: true, id: "Pad", mapping: "standard", buttons: [{ pressed: true, value: 1 }], axes: [0,0,0,0] }]);
    sys.update();
    const ev = Input.events();
    const btn = ev.find(e => e.type === EventType.GAMEPAD_BUTTON_DOWN);
    assert.ok(btn);
    assert.strictEqual(btn.device, "gamepad");
  });
  it("mixed devices", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    backend.pointerDown({ pointerId: 0, x: 5, y: 5, type: "mouse", button: 0 });
    sys.update();
    const ev = Input.events();
    assert.strictEqual(ev.length, 2);
    assert.ok(ev.some(e => e.device === "keyboard"));
    assert.ok(ev.some(e => e.device === "mouse"));
  });
  it("chronological order", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    backend.keyDown("b", { code: "KeyB" });
    backend.keyDown("c", { code: "KeyC" });
    sys.update();
    const ev = Input.events();
    assert.deepStrictEqual(ev.map(e => e.data.key), ["a","b","c"]);
  });
  it("current-tick lifetime, no leak", () => {
    const { sys, backend } = setup();
    backend.keyDown("x", { code: "KeyX" });
    sys.update();
    assert.strictEqual(Input.events().length, 1);
    sys.update();
    assert.strictEqual(Input.events().length, 0);
  });
  it("is read-only snapshot (frozen)", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    const ev = Input.events();
    assert.throws(() => { ev.push(null); });
  });
  it("not mutable via Input.raw.events", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    const snap = Input.events();
    assert.strictEqual(snap.length, 1);
    // raw.events is the live queue (cleared), not snapshot
    assert.strictEqual(sys.events.length, 0);
  });
});

describe("Phase2 — Input.presses()", () => {
  it("one digital action press", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack();
    stack.push(new InputContext("test", map));
    sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" });
    sys.update();
    const p = Input.presses("jump");
    assert.strictEqual(p.length, 1);
  });
  it("multiple presses in one tick", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("a1", new KeyBinding(KeyCode.KEY_W));
    map.bind("a1", new KeyBinding(KeyCode.KEY_D));
    // Use raw presses for simplicity
    backend.keyDown("w", { code: "KeyW" });
    backend.keyDown("d", { code: "KeyD" });
    sys.update();
    assert.strictEqual(Input.presses("KeyW").length, 1);
    assert.strictEqual(Input.presses("KeyD").length, 1);
    // Action with multiple bindings: need to test via raw, not action, because action would match either
  });
  it("ordering preserved — Snake W→D→S", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("move", new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_W), vector: [0,-1] },
      { binding: new KeyBinding(KeyCode.KEY_D), vector: [1,0] },
      { binding: new KeyBinding(KeyCode.KEY_S), vector: [0,1] },
      { binding: new KeyBinding(KeyCode.KEY_A), vector: [-1,0] },
    ]), ActionKind.VECTOR2);
    const stack = new ContextStack();
    stack.push(new InputContext("test", map));
    sys.contextStack = stack;
    backend.keyDown("w", { code: "KeyW" });
    backend.keyDown("d", { code: "KeyD" });
    backend.keyDown("s", { code: "KeyS" });
    sys.update();
    const p = Input.presses("move");
    assert.deepStrictEqual(p, [{x:0,y:-1},{x:1,y:0},{x:0,y:1}]);
  });
  it("vector multiple directional presses", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("move", new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_W), vector: [0,-1] },
      { binding: new KeyBinding(KeyCode.KEY_S), vector: [0,1] },
    ]), ActionKind.VECTOR2);
    const stack = new ContextStack();
    stack.push(new InputContext("test", map));
    sys.contextStack = stack;
    backend.keyDown("w", { code: "KeyW" });
    backend.keyDown("s", { code: "KeyS" });
    sys.update();
    assert.strictEqual(Input.presses("move").length, 2);
  });
  it("raw identifiers", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    assert.strictEqual(Input.presses("KeyW").length, 1);
    assert.strictEqual(Input.presses("KeyA").length, 0);
  });
  it("action bindings respected", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack();
    stack.push(new InputContext("test", map));
    sys.contextStack = stack;
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    assert.strictEqual(Input.presses("fire").length, 0);
    backend.keyDown(" ", { code: "Space" });
    sys.update();
    assert.strictEqual(Input.presses("fire").length, 1);
  });
  it("context resolution", () => {
    const { sys, backend } = setup();
    const map1 = new ActionMap(); map1.bind("jump", new KeyBinding(KeyCode.KEY_W));
    const map2 = new ActionMap(); map2.bind("jump", new KeyBinding(KeyCode.KEY_S));
    const stack = new ContextStack();
    stack.push(new InputContext("low", map1, { priority: 0 }));
    stack.push(new InputContext("high", map2, { priority: 10 }));
    sys.contextStack = stack;
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    // high context shadows low for same name, so jump should be S only
    assert.strictEqual(Input.presses("jump").length, 0);
    backend.keyDown("s", { code: "KeyS" });
    sys.update();
    assert.strictEqual(Input.presses("jump").length, 1);
  });
  it("no false positives from down", () => {
    const { sys, backend } = setup();
    const kb = new Keyboard();
    sys.devices.register(kb);
    // Hold W without new press, axis would show held, but presses should be empty on second tick
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    assert.strictEqual(Input.presses("KeyW").length, 1);
    sys.update();
    assert.strictEqual(Input.presses("KeyW").length, 0);
    // held still true via down, but presses empty
    assert.ok(kb.isDown(KeyCode.KEY_W));
  });
  it("no leak into next tick", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" });
    sys.update();
    assert.strictEqual(Input.presses("jump").length, 1);
    sys.update();
    assert.strictEqual(Input.presses("jump").length, 0);
  });
});

describe("Phase2 — anyPressed / anyDown / anyReleased", () => {
  it("anyPressed false when no keyboard press", () => {
    const { sys } = setup();
    sys.update();
    assert.strictEqual(Input.anyPressed(), false);
  });
  it("anyPressed true for one keyboard press", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    assert.strictEqual(Input.anyPressed(), true);
  });
  it("anyPressed true for multiple presses", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    backend.keyDown("b", { code: "KeyB" });
    sys.update();
    assert.strictEqual(Input.anyPressed(), true);
  });
  it("mouse-only does not trigger anyPressed", () => {
    const { sys, backend } = setup();
    backend.pointerDown({ pointerId: 0, x: 0, y: 0, type: "mouse", button: 0 });
    sys.update();
    assert.strictEqual(Input.anyPressed(), false);
  });
  it("gamepad-only does not trigger anyPressed", () => {
    const { sys, backend } = setup();
    const gp = new Gamepad(() => backend.gamepads);
    sys.devices.register(gp);
    backend.setGamepads([{ index: 0, connected: true, id: "Pad", mapping: "standard", buttons: [{ pressed: true, value: 1 }], axes: [0,0,0,0] }]);
    sys.update();
    // After one update, gp may have press but anyPressed should still be false (keyboard only)
    // Clear and ensure no keyboard press counted
    assert.strictEqual(Input.anyPressed(), false);
  });
  it("anyPressed resets next tick", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    assert.ok(Input.anyPressed());
    sys.update();
    assert.strictEqual(Input.anyPressed(), false);
  });
  it("anyDown true when held", () => {
    const { sys, backend } = setup();
    const kb = new Keyboard(); sys.devices.register(kb);
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    assert.strictEqual(Input.anyDown(), true);
  });
  it("anyDown false when none held", () => {
    const { sys } = setup();
    const kb = new Keyboard(); sys.devices.register(kb);
    sys.update();
    assert.strictEqual(Input.anyDown(), false);
  });
  it("anyDown multiple", () => {
    const { sys, backend } = setup();
    const kb = new Keyboard(); sys.devices.register(kb);
    backend.keyDown("w", { code: "KeyW" });
    backend.keyDown("s", { code: "KeyS" });
    sys.update();
    assert.ok(Input.anyDown());
  });
  it("anyReleased true for one release", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    backend.keyUp("a", { code: "KeyA" });
    sys.update();
    assert.strictEqual(Input.anyReleased(), true);
  });
  it("anyReleased false when none", () => {
    const { sys } = setup();
    sys.update();
    assert.strictEqual(Input.anyReleased(), false);
  });
  it("anyReleased resets", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" }); sys.update();
    backend.keyUp("a", { code: "KeyA" }); sys.update();
    assert.ok(Input.anyReleased());
    sys.update();
    assert.strictEqual(Input.anyReleased(), false);
  });
});

describe("Phase2 — keyboard.lastPressed / lastReleased", () => {
  it("lastPressed null when none", () => {
    const { sys } = setup();
    sys.update();
    assert.strictEqual(Input.keyboard.lastPressed, null);
  });
  it("lastPressed returns W", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW", key: "w" });
    sys.update();
    const lp = Input.keyboard.lastPressed;
    assert.ok(lp);
    assert.strictEqual(lp.code, "KeyW");
    assert.strictEqual(lp.key, "w");
    assert.ok(typeof lp.timestamp === "number");
  });
  it("W→D→S returns S", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW", key: "w" });
    backend.keyDown("d", { code: "KeyD", key: "d" });
    backend.keyDown("s", { code: "KeyS", key: "s" });
    sys.update();
    assert.strictEqual(Input.keyboard.lastPressed.key, "s");
    assert.strictEqual(Input.keyboard.lastPressed.code, "KeyS");
  });
  it("physical/logical preserved", () => {
    const { sys, backend } = setup();
    // Simulate AZERTY: physical KeyA produces logical "q"
    backend.keyDown("q", { code: "KeyA", key: "q" });
    sys.update();
    const lp = Input.keyboard.lastPressed;
    assert.strictEqual(lp.code, "KeyA");
    assert.strictEqual(lp.key, "q");
  });
  it("lastPressed null next tick", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    assert.ok(Input.keyboard.lastPressed);
    sys.update();
    assert.strictEqual(Input.keyboard.lastPressed, null);
  });
  it("lastReleased returns release", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA", key: "a" }); sys.update();
    backend.keyUp("a", { code: "KeyA", key: "a" }); sys.update();
    const lr = Input.keyboard.lastReleased;
    assert.ok(lr);
    assert.strictEqual(lr.code, "KeyA");
  });
  it("lastReleased null when none", () => {
    const { sys } = setup();
    sys.update();
    assert.strictEqual(Input.keyboard.lastReleased, null);
  });
  it("W→D releases returns D", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" }); backend.keyDown("d", { code: "KeyD" }); sys.update();
    backend.keyUp("w", { code: "KeyW" }); backend.keyUp("d", { code: "KeyD" }); sys.update();
    assert.strictEqual(Input.keyboard.lastReleased.code, "KeyD");
  });
});

describe("Phase2 — non-destructive", () => {
  it("queries do not mutate stream", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    backend.keyDown("b", { code: "KeyB" });
    sys.update();
    const e1 = Input.events();
    const p1 = Input.presses("KeyA");
    const ap = Input.anyPressed();
    const lp = Input.keyboard.lastPressed;
    const e2 = Input.events();
    const p2 = Input.presses("KeyA");
    assert.deepStrictEqual(e1, e2);
    assert.deepStrictEqual(p1, p2);
    assert.ok(ap);
    assert.ok(lp);
  });
});
