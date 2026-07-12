import { describe, it, mock } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";
import { Device } from "../../input/Device.js";
import { DeviceRegistry } from "../../input/DeviceRegistry.js";
import { ActionKind } from "../../input/ActionKind.js";
import { ActionMap } from "../../input/actions/ActionMap.js";
import { ActionEvaluator } from "../../input/actions/ActionEvaluator.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { InputContext } from "../../input/actions/InputContext.js";
import { CoordinateSystem } from "../../input/CoordinateSystem.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { KeyCode } from "../../input/KeyCode.js";
import { Keyboard } from "../../input/Keyboard.js";
import { Space } from "../../input/Space.js";

class FakeBackend {
  constructor() { this.events = []; }
  start() {}
  stop() {}
  poll(queue) {
    for (const e of this.events) queue.push(e, Tier.HIGH);
    this.events = [];
  }
}

describe("InputSystem lifecycle", () => {
  it("calls snapshot → poll → devices.update → contextStack.evaluate → clear", () => {
    const sys = new InputSystem();

    const backend = new FakeBackend();
    sys.setBackend(backend);

    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));

    const cs = new ContextStack();
    cs.push(new InputContext("test", map));
    sys.contextStack = cs;

    let snapshotCalled = false;
    const origSnapshot = sys.snapshot.bind(sys);
    mock.method(sys, "snapshot", () => { snapshotCalled = true; });

    const kb = new Keyboard();
    sys.devices.register(kb);

    backend.events.push(
      new InputEvent(EventType.KEY_DOWN, {
        key: " ", code: "Space", repeat: false,
        ctrl: false, shift: false, alt: false, meta: false,
        printable: false,
      }),
    );

    sys.update();

    assert.ok(snapshotCalled);
    // Space key was processed → devices saw it
    assert.ok(kb.isDown(KeyCode.SPACE));
    // ContextStack evaluated → action state updated
    assert.strictEqual(map.getState("jump").pressed, true);
    // Queue cleared after update
    assert.strictEqual(sys.events.length, 0);
  });

  it("snapshot saves prev frame state for justPressed/justReleased", () => {
    const sys = new InputSystem();
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const cs = new ContextStack();
    cs.push(new InputContext("test", map));
    sys.contextStack = cs;

    const state = map.getState("jump");
    // Frame 1: Space is pressed
    const backend = new FakeBackend();
    sys.setBackend(backend);

    const kb = new Keyboard();
    sys.devices.register(kb);

    backend.events.push(
      new InputEvent(EventType.KEY_DOWN, {
        key: " ", code: "Space", repeat: false,
        ctrl: false, shift: false, alt: false, meta: false,
        printable: false,
      }),
    );

    sys.update();
    assert.strictEqual(state.justPressed, true);
    assert.strictEqual(state.pressed, true);

    // Frame 2: still pressed (no new events) — snapshot before poll
    // should carry forward the "pressed" state, but justPressed should be false
    sys.update();
    assert.strictEqual(state.pressed, true);
    assert.strictEqual(state.justPressed, false);
  });

  it("update with no backend and no context stack does not throw", () => {
    const sys = new InputSystem();
    assert.doesNotThrow(() => sys.update());
  });

  it("update with backend but no context stack still processes devices", () => {
    const sys = new InputSystem();
    const backend = new FakeBackend();
    sys.setBackend(backend);

    const kb = new Keyboard();
    sys.devices.register(kb);

    backend.events.push(
      new InputEvent(EventType.KEY_DOWN, {
        key: "a", code: "KeyA", repeat: false,
        ctrl: false, shift: false, alt: false, meta: false,
        printable: true,
      }),
    );

    sys.update();
    assert.ok(kb.isDown(KeyCode.KEY_A));
  });

  it("coordinateSystem property is gettable/settable", () => {
    const sys = new InputSystem();
    assert.strictEqual(sys.coordinateSystem, null);
    const cs = new CoordinateSystem();
    sys.coordinateSystem = cs;
    assert.strictEqual(sys.coordinateSystem, cs);
  });

  it("contextStack property is gettable/settable", () => {
    const sys = new InputSystem();
    assert.strictEqual(sys.contextStack, null);
    const cs = new ContextStack();
    sys.contextStack = cs;
    assert.strictEqual(sys.contextStack, cs);
  });

  it("snapshot() calls ContextStack.snapshot()", () => {
    const map = new ActionMap();
    map.bind("x", new KeyBinding(KeyCode.SPACE));
    const cs = new ContextStack();
    cs.push(new InputContext("t", map));

    let snapCalled = false;
    mock.method(cs, "snapshot", () => { snapCalled = true; });

    const sys = new InputSystem();
    sys.contextStack = cs;

    sys.snapshot();
    assert.ok(snapCalled);
  });
});

describe("ContextStack.snapshot", () => {
  it("calls snapshot on all action states in all contexts", () => {
    const map = new ActionMap();
    map.bind("a", new KeyBinding(KeyCode.KEY_A));
    map.bind("b", new KeyBinding(KeyCode.KEY_B));

    const stateA = map.getState("a");
    const stateB = map.getState("b");

    let snapA = 0;
    let snapB = 0;
    mock.method(stateA, "snapshot", () => { snapA++; });
    mock.method(stateB, "snapshot", () => { snapB++; });

    const cs = new ContextStack();
    cs.push(new InputContext("test", map));
    cs.snapshot();

    assert.strictEqual(snapA, 1);
    assert.strictEqual(snapB, 1);
  });

  it("handles empty context stack", () => {
    const cs = new ContextStack();
    assert.doesNotThrow(() => cs.snapshot());
  });
});

describe("CoordinateSystem Camera adapter", () => {
  it("works with Camera project/unproject methods", () => {
    // Manually create a minimal Camera-like object
    const camera = {
      x: 100, y: 50, zoom: 2,
      worldToScreen(wx, wy, out) {
        out.x = (wx - this.x) * this.zoom + 400;
        out.y = (wy - this.y) * this.zoom + 300;
      },
      screenToWorld(sx, sy, out) {
        out.x = (sx - 400) / this.zoom + this.x;
        out.y = (sy - 300) / this.zoom + this.y;
      },
    };

    const cs = new CoordinateSystem({ camera });

    // World → toScreen → via camera.worldToScreen then DPR+offset
    const screen = cs.toScreen({ x: 0, y: 0 });
    // camera projects (0,0) → (-100*2+400, -50*2+300) = (200, 200)
    // DPR 1, canvas offset 0 → (200, 200)
    assert.strictEqual(screen.x, 200);
    assert.strictEqual(screen.y, 200);

    // Viewport → toWorld → via camera.screenToWorld
    const world = cs.toWorld({ x: 200, y: 200 });
    assert.strictEqual(world.x, 0);
    assert.strictEqual(world.y, 0);
  });

  it("works with project/unproject style camera objects", () => {
    const camera = {
      project(x, y) { return { x: x * 2, y: y * 2 }; },
      unproject(x, y) { return { x: x / 2, y: y / 2 }; },
    };

    const cs = new CoordinateSystem({ camera });
    const world = cs.toWorld({ x: 10, y: 20 });
    assert.strictEqual(world.x, 5);
    assert.strictEqual(world.y, 10);

    const screen = cs.toScreen({ x: 5, y: 10 });
    assert.strictEqual(screen.x, 10);
    assert.strictEqual(screen.y, 20);
  });

  it("falls through to identity when camera has no project method", () => {
    const camera = {};
    const cs = new CoordinateSystem({ camera });
    const world = cs.toWorld({ x: 5, y: 10 });
    assert.strictEqual(world.x, 5);
    assert.strictEqual(world.y, 10);
  });
});

describe("InputSystem full integration", () => {
  it("evaluates context stack with multiple devices and contexts", () => {
    const sys = new InputSystem();
    const backend = new FakeBackend();
    sys.setBackend(backend);

    const kb = new Keyboard();
    sys.devices.register(kb);

    const gameplay = new ActionMap();
    gameplay.bind("move", new KeyBinding(KeyCode.KEY_D));

    const menu = new ActionMap();
    menu.bind("confirm", new KeyBinding(KeyCode.ENTER));

    const cs = new ContextStack();
    cs.push(new InputContext("gameplay", gameplay, { priority: 0 }));
    cs.push(new InputContext("menu", menu, { priority: 50 }));
    sys.contextStack = cs;

    backend.events.push(
      new InputEvent(EventType.KEY_DOWN, {
        key: "d", code: "KeyD", repeat: false,
        ctrl: false, shift: false, alt: false, meta: false,
        printable: false,
      }),
    );

    sys.update();

    assert.strictEqual(gameplay.getState("move").pressed, true);
    assert.strictEqual(menu.getState("confirm").pressed, false);
  });

  it("clear events after update", () => {
    const sys = new InputSystem();
    const backend = new FakeBackend();
    sys.setBackend(backend);

    backend.events.push(
      new InputEvent(EventType.KEY_DOWN, {
        key: " ", code: "Space", repeat: false,
        ctrl: false, shift: false, alt: false, meta: false,
        printable: false,
      }),
    );

    sys.update();
    assert.strictEqual(sys.events.length, 0);
  });
});
