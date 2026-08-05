import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert";

import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Keyboard } from "../../input/Keyboard.js";
import { Mouse } from "../../input/Mouse.js";
import { PointerManager } from "../../input/PointerManager.js";
import { GestureEngine } from "../../input/GestureEngine.js";
import { GestureEvent } from "../../input/GestureEvent.js";
import { GestureType } from "../../input/GestureType.js";
import { GestureDispatcher } from "../../input/GestureDispatcher.js";
import { KeyCode } from "../../input/KeyCode.js";
import { ActionMap } from "../../input/actions/ActionMap.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { InputContext } from "../../input/actions/InputContext.js";

function makeSystem() {
  const sys = new InputSystem();
  sys.setBackend(new TestBackend());
  sys.devices.register(new Keyboard());
  sys.contextStack = new ContextStack();
  return sys;
}

describe("ContextStack priming (replaces the _cycle guard)", () => {
  it("does not report justPressed for a key already held at push time", () => {
    const sys = makeSystem();

    // Space goes down before the context that binds it even exists.
    sys.backend.keyDown(" ", { code: "Space" });
    sys.update();

    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    sys.contextStack.push(new InputContext("menu", map));

    sys.update();

    const state = map.getState("jump");
    assert.strictEqual(state.pressed, true, "the key is genuinely held");
    assert.strictEqual(
      state.justPressed, false,
      "a press that predates the context must not read as a fresh press",
    );
  });

  it("still reports a genuine press made after the context is pushed", () => {
    const sys = makeSystem();

    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    sys.contextStack.push(new InputContext("play", map));
    sys.update();

    sys.backend.keyDown(" ", { code: "Space" });
    sys.update();

    const state = map.getState("jump");
    assert.strictEqual(state.justPressed, true);
    assert.strictEqual(state.pressed, true);
  });

  it("reports a press on the very first frame an action is polled", () => {
    const sys = makeSystem();

    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    sys.contextStack.push(new InputContext("play", map));

    // The old _cycle >= 2 guard swallowed this entirely: an action pressed on
    // its first ever evaluation could never report justPressed.
    sys.backend.keyDown(" ", { code: "Space" });
    sys.update();

    assert.strictEqual(map.getState("jump").justPressed, true);
  });

  it("a stack with no device registry attached still pushes plainly", () => {
    const stack = new ContextStack();
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    assert.doesNotThrow(() => stack.push(new InputContext("solo", map)));
    assert.strictEqual(stack.size, 1);
  });
});

describe("per-tick justPressed semantics", () => {
  it("collapses to one tick when snapshot runs per tick", () => {
    const sys = makeSystem();
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    sys.contextStack.push(new InputContext("play", map));
    sys.update();

    sys.backend.keyDown(" ", { code: "Space" });
    sys.update();

    const state = map.getState("jump");
    // Frame produced several fixed ticks; Game snapshots after each one.
    let firedIn = 0;
    for (let tick = 0; tick < 5; tick++) {
      if (state.justPressed) firedIn++;
      sys.snapshot();
    }

    assert.strictEqual(
      firedIn, 1,
      "a single press must not fire in every tick of a catch-up frame",
    );
    assert.strictEqual(state.pressed, true, "held state survives the snapshots");
  });
});

describe("device-level per-tick edge state", () => {
  it("collapses pointer justDown after a snapshot", () => {
    const sys = new InputSystem();
    sys.setBackend(new TestBackend());
    const pm = new PointerManager();
    sys.devices.register(pm);

    sys.backend.pointerDown({ pointerId: 1, x: 5, y: 5 });
    sys.update();

    const ptr = pm.getPointers()[0];
    assert.strictEqual(ptr.justDown, true, "the press frame reports justDown");
    assert.strictEqual(ptr.isDown, true);

    let firedIn = 0;
    for (let tick = 0; tick < 5; tick++) {
      if (pm.getPointers()[0].justDown) firedIn++;
      sys.snapshot();
    }

    assert.strictEqual(
      firedIn, 1,
      "Input.pointer.justPressed must fire in exactly one tick, like actions do",
    );
    assert.strictEqual(pm.getPointers()[0].isDown, true, "held state survives");
  });

  it("collapses keyboard justPressed after a snapshot", () => {
    const sys = makeSystem();
    const kb = sys.devices.get(Keyboard);

    sys.backend.keyDown(" ", { code: "Space" });
    sys.update();

    let firedIn = 0;
    for (let tick = 0; tick < 5; tick++) {
      if (kb.justPressed(KeyCode.SPACE)) firedIn++;
      sys.snapshot();
    }

    assert.strictEqual(firedIn, 1);
    assert.strictEqual(kb.isDown(KeyCode.SPACE), true);
  });

  it("collapses mouse button justPressed after a snapshot", () => {
    const sys = new InputSystem();
    sys.setBackend(new TestBackend());
    const mouse = new Mouse();
    sys.devices.register(mouse);

    sys.backend.pointerDown({ pointerId: 1, x: 0, y: 0, button: 0 });
    sys.update();

    let firedIn = 0;
    for (let tick = 0; tick < 5; tick++) {
      if (mouse.justPressed(0)) firedIn++;
      sys.snapshot();
    }

    assert.strictEqual(firedIn, 1);
  });

  it("clears a recognized gesture after a snapshot", () => {
    const sys = new InputSystem();
    const pm = new PointerManager();
    sys.devices.register(pm);
    const engine = new GestureEngine(pm);
    sys.devices.register(engine);

    engine._results.set(GestureType.TAP, new GestureEvent(GestureType.TAP, {
      position: { x: 1, y: 2 },
    }));
    assert.ok(engine.last(GestureType.TAP));

    sys.snapshot();
    assert.strictEqual(
      engine.last(GestureType.TAP), null,
      "a tap belongs to the window it was recognized in",
    );
  });

  it("treats the wheel as a per-window delta rather than a running total", () => {
    const sys = new InputSystem();
    sys.setBackend(new TestBackend());
    const mouse = new Mouse();
    sys.devices.register(mouse);

    sys.backend.wheel({ deltaY: 3 });
    sys.update();
    assert.strictEqual(mouse.wheel, 3);

    // Nothing in the engine ever reset this, so it used to accumulate for the
    // lifetime of the session instead of reporting the current scroll.
    sys.backend.wheel({ deltaY: 4 });
    sys.update();
    assert.strictEqual(mouse.wheel, 4, "wheel reports this window, not the sum");

    sys.update();
    assert.strictEqual(mouse.wheel, 0, "and returns to zero when nothing scrolls");
  });

  it("does not let one scroll apply once per tick", () => {
    const sys = new InputSystem();
    sys.setBackend(new TestBackend());
    const mouse = new Mouse();
    sys.devices.register(mouse);

    sys.backend.wheel({ deltaY: 5 });
    sys.update();

    let total = 0;
    for (let tick = 0; tick < 5; tick++) {
      total += mouse.wheel;
      sys.snapshot();
    }
    assert.strictEqual(total, 5, "a single notch must be consumed once");
  });
});

describe("GestureDispatcher", () => {
  let sys;
  let engine;
  let dispatcher;

  beforeEach(() => {
    sys = new InputSystem();
    const pm = new PointerManager();
    sys.devices.register(pm);
    engine = new GestureEngine(pm);
    sys.devices.register(engine);
    dispatcher = new GestureDispatcher(sys);
  });

  function recognize(type, options) {
    engine._results.set(type, new GestureEvent(type, options));
  }

  it("fires tap listeners with the legacy { x, y, pointerId } payload", () => {
    const seen = [];
    dispatcher.on(GestureType.TAP, (e) => seen.push(e));

    recognize(GestureType.TAP, { position: { x: 12, y: 34 }, pointerIds: [7] });
    dispatcher.poll();

    assert.strictEqual(seen.length, 1);
    assert.deepStrictEqual(seen[0], { x: 12, y: 34, pointerId: 7 });
  });

  it("fires swipe listeners with a direction string", () => {
    const seen = [];
    dispatcher.on(GestureType.SWIPE, (d) => seen.push(d));

    recognize(GestureType.SWIPE, { delta: { x: -80, y: 10 } });
    dispatcher.poll();

    assert.deepStrictEqual(seen, ["LEFT"]);
  });

  it("resolves swipe direction on the dominant axis", () => {
    const dir = (x, y) => GestureDispatcher.swipeDirection({ delta: { x, y } });
    assert.strictEqual(dir(50, 10), "RIGHT");
    assert.strictEqual(dir(-50, 10), "LEFT");
    assert.strictEqual(dir(10, 50), "DOWN");
    assert.strictEqual(dir(10, -50), "UP");
  });

  it("passes the GestureEvent through for other gesture types", () => {
    let received = null;
    dispatcher.on(GestureType.PINCH, (e) => { received = e; });

    recognize(GestureType.PINCH, { scale: 1.5 });
    dispatcher.poll();

    assert.ok(received instanceof GestureEvent);
    assert.strictEqual(received.scale, 1.5);
  });

  it("returns an unsubscribe function", () => {
    let count = 0;
    const off = dispatcher.on(GestureType.TAP, () => count++);

    recognize(GestureType.TAP, { position: { x: 0, y: 0 } });
    dispatcher.poll();
    assert.strictEqual(count, 1);

    off();
    recognize(GestureType.TAP, { position: { x: 0, y: 0 } });
    dispatcher.poll();
    assert.strictEqual(count, 1, "unsubscribed listener must not fire again");
    assert.strictEqual(dispatcher.listenerCount, 0);
  });

  it("does not fire when no gesture was recognized", () => {
    let count = 0;
    dispatcher.on(GestureType.TAP, () => count++);
    dispatcher.poll();
    assert.strictEqual(count, 0);
  });

  it("isolates a throwing listener", () => {
    const origError = console.error;
    console.error = () => {};
    try {
      let reached = 0;
      dispatcher.on(GestureType.TAP, () => { throw new Error("boom"); });
      dispatcher.on(GestureType.TAP, () => { reached++; });

      recognize(GestureType.TAP, { position: { x: 0, y: 0 } });
      assert.doesNotThrow(() => dispatcher.poll());
      assert.strictEqual(reached, 1, "one bad listener must not block the others");
    } finally {
      console.error = origError;
    }
  });

  it("is a no-op with no listeners or no engine", () => {
    assert.doesNotThrow(() => dispatcher.poll());
    const orphan = new GestureDispatcher(null);
    orphan.on(GestureType.TAP, () => {});
    assert.doesNotThrow(() => orphan.poll());
  });
});

describe("InputSystem event tallies (re-homed input.* metrics)", () => {
  it("counts key and pointer events per frame", () => {
    const sys = makeSystem();
    sys.devices.register(new PointerManager());

    sys.backend.keyDown(" ", { code: "Space" });
    sys.backend.keyDown("a", { code: "KeyA" });
    sys.backend.pointerDown({ pointerId: 1, x: 10, y: 20 });
    sys.update();

    assert.strictEqual(sys.keyEventCount, 2);
    assert.strictEqual(sys.pointerEventCount, 1);
  });

  it("resets tallies each frame", () => {
    const sys = makeSystem();
    sys.backend.keyDown(" ", { code: "Space" });
    sys.update();
    assert.strictEqual(sys.keyEventCount, 1);

    sys.update();
    assert.strictEqual(sys.keyEventCount, 0, "counts are per-frame, not cumulative");
  });
});

describe("legacy input surface is gone", () => {
  it("Input exposes no legacy members", async () => {
    const { Input } = await import("../../input/Input.js");
    for (const gone of [
      "setDefault", "getDefault", "isDown", "justPressed", "justReleased",
      "mapKey", "unmapKey", "setKeyMap", "resetKeyMap", "getKeyMap",
      "getPointer", "getPointers", "forEachPointer",
      "consumeBuffer", "peekBuffer", "init", "destroy",
      "updateFrame", "clearJustPressed", "x", "y", "isPointerDown", "pointerCount",
    ]) {
      assert.ok(!(gone in Input), `Input.${gone} should no longer exist`);
    }
  });

  it("Input.buffer is callable (the property/method collision is gone)", async () => {
    const { Input } = await import("../../input/Input.js");
    assert.strictEqual(typeof Input.buffer, "function");
  });

  it("the legacy module is deleted", async () => {
    await assert.rejects(
      () => import("../../input/InputContext.js"),
      "input/InputContext.js should no longer exist",
    );
  });

  it("jygame no longer exports OldInputContext", async () => {
    const mod = await import("../../jygame.js");
    assert.ok(!("OldInputContext" in mod));
    assert.ok(mod.Input, "the modern Input facade is still exported");
  });
});
