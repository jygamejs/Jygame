import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Input } from "../../input/Input.js";
import { EventType } from "../../input/EventType.js";
import { KeyCode } from "../../input/KeyCode.js";
import { ActionKind } from "../../input/ActionKind.js";
import { ActionMap } from "../../input/actions/ActionMap.js";
import { InputContext } from "../../input/actions/InputContext.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { CompositeBinding } from "../../input/actions/CompositeBinding.js";
import { Gamepad } from "../../input/Gamepad.js";
import { Keyboard } from "../../input/Keyboard.js";

function setup(opts = {}) {
  const sys = new InputSystem(opts);
  const backend = new TestBackend();
  sys.setBackend(backend);
  sys.devices.register(new Keyboard());
  Input.setSystem(sys);
  return { sys, backend };
}

describe("Phase3 — Input.history()", () => {
  it("empty history", () => {
    const { sys } = setup();
    sys.update();
    assert.strictEqual(Input.history().length, 0);
  });
  it("one event", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" });
    sys.update();
    assert.strictEqual(Input.history().length, 1);
    assert.strictEqual(Input.history()[0].data.key, "w");
  });
  it("events across multiple ticks", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" }); sys.update();
    backend.keyDown("d", { code: "KeyD" }); sys.update();
    backend.keyDown("s", { code: "KeyS" }); sys.update();
    const h = Input.history();
    assert.deepStrictEqual(h.map(e => e.data.key), ["w", "d", "s"]);
  });
  it("chronological ordering", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    backend.keyDown("b", { code: "KeyB" });
    backend.keyDown("c", { code: "KeyC" });
    sys.update();
    assert.deepStrictEqual(Input.history().map(e => e.data.key), ["a", "b", "c"]);
  });
  it("multiple events in one tick", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" });
    backend.keyDown("d", { code: "KeyD" });
    backend.keyDown("s", { code: "KeyS" });
    sys.update();
    const h = Input.history();
    assert.strictEqual(h.length, 3);
    assert.deepStrictEqual(h.map(e => e.data.key), ["w", "d", "s"]);
  });
  it("mixed devices", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" });
    backend.pointerDown({ pointerId: 0, x: 10, y: 10, type: "mouse", button: 0 });
    sys.update();
    const h = Input.history();
    assert.ok(h.some(e => e.device === "keyboard"));
    assert.ok(h.some(e => e.device === "mouse"));
    assert.strictEqual(h.length, 2);
  });
  it("bounded retention", () => {
    const { sys, backend } = setup({ historyCapacity: 5 });
    for (let i = 0; i < 10; i++) {
      backend.keyDown("a" + i, { code: "KeyA" });
      sys.update();
    }
    const h = Input.history();
    assert.strictEqual(h.length, 5);
    // Oldest should be evicted, should be last 5
    assert.strictEqual(h[0].data.key, "a5");
  });
  it("oldest evicted correctly", () => {
    const { sys, backend } = setup({ historyCapacity: 3 });
    backend.keyDown("a", { code: "KeyA" }); sys.update();
    backend.keyDown("b", { code: "KeyB" }); sys.update();
    backend.keyDown("c", { code: "KeyC" }); sys.update();
    backend.keyDown("d", { code: "KeyD" }); sys.update();
    const h = Input.history();
    assert.deepStrictEqual(h.map(e => e.data.key), ["b", "c", "d"]);
  });
  it("history survives current-tick clear", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" }); sys.update();
    assert.strictEqual(Input.events().length, 1);
    assert.strictEqual(Input.history().length, 1);
    sys.update();
    assert.strictEqual(Input.events().length, 0);
    assert.strictEqual(Input.history().length, 1);
  });
  it("history is non-destructive", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" }); sys.update();
    const h1 = Input.history();
    const h2 = Input.history();
    assert.deepStrictEqual(h1, h2);
  });
  it("repeated reads equivalent", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" }); sys.update();
    assert.deepStrictEqual(Input.history(), Input.history());
  });
  it("normalized events only, no browser objects", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" }); sys.update();
    const h = Input.history();
    for (const e of h) {
      assert.ok(e.device);
      assert.ok(typeof e.timestamp === "number");
      assert.ok(e.data && typeof e.data === "object");
      assert.ok(!e.data.nativeEvent);
      if (typeof KeyboardEvent !== "undefined") {
        assert.ok(!(e.data instanceof KeyboardEvent));
      }
    }
  });
  it("history with limit param", () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" }); sys.update();
    backend.keyDown("b", { code: "KeyB" }); sys.update();
    backend.keyDown("c", { code: "KeyC" }); sys.update();
    assert.strictEqual(Input.history(2).length, 2);
    assert.deepStrictEqual(Input.history(2).map(e => e.data.key), ["b", "c"]);
  });
  it("history with within time window", async () => {
    const { sys, backend } = setup();
    backend.keyDown("a", { code: "KeyA" }); sys.update();
    await new Promise(r => setTimeout(r, 10));
    backend.keyDown("b", { code: "KeyB" }); sys.update();
    const recent = Input.history({ within: 5 });
    // Only b should be within 5ms
    assert.ok(recent.length >= 1);
    assert.ok(recent.some(e => e.data.key === "b"));
  });
});

describe("Phase3 — Input.queue() and Input.next()", () => {
  it("empty queue", () => {
    const { sys } = setup();
    sys.update();
    assert.strictEqual(Input.queue("move").length, 0);
    assert.strictEqual(Input.next("move"), null);
  });
  it("enqueueing", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.strictEqual(Input.queue("jump").length, 1);
  });
  it("FIFO ordering", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("move", new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_W), vector: [0, -1] },
      { binding: new KeyBinding(KeyCode.KEY_D), vector: [1, 0] },
      { binding: new KeyBinding(KeyCode.KEY_S), vector: [0, 1] },
    ]), ActionKind.VECTOR2);
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown("w", { code: "KeyW" }); backend.keyDown("d", { code: "KeyD" }); backend.keyDown("s", { code: "KeyS" });
    sys.update();
    const q = Input.queue("move");
    assert.deepStrictEqual(q.map(v => [v.x, v.y]), [[0, -1], [1, 0], [0, 1]]);
  });
  it("multiple entries", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.strictEqual(Input.queue("jump").length, 2);
  });
  it("multiple ticks", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.strictEqual(Input.queue("jump").length, 1);
    backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.strictEqual(Input.queue("jump").length, 2);
  });
  it("multiple action queues", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    map.bind("fire", new KeyBinding(KeyCode.KEY_F));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    backend.keyDown("f", { code: "KeyF" }); sys.update();
    assert.strictEqual(Input.queue("jump").length, 1);
    assert.strictEqual(Input.queue("fire").length, 1);
    assert.strictEqual(Input.queue("jump")[0].code, "Space");
  });
  it("queue does not mutate history", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    const h1 = Input.history().length;
    Input.queue("jump");
    assert.strictEqual(Input.history().length, h1);
  });
  it("queue does not mutate eventSnapshot", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    const e1 = Input.events().length;
    Input.queue("jump");
    assert.strictEqual(Input.events().length, e1);
  });
  it("queue consumption is explicit", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.strictEqual(Input.queue("jump").length, 1);
    Input.next("jump");
    assert.strictEqual(Input.queue("jump").length, 0);
    assert.strictEqual(Input.history().length, 1);
  });
});

describe("Phase3 — Input.next()", () => {
  it("A→B→C returns A,B,C,null", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("act", new KeyBinding(KeyCode.KEY_A));
    map.bind("act", new KeyBinding(KeyCode.KEY_B));
    map.bind("act", new KeyBinding(KeyCode.KEY_C));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    // Create queue
    Input.queue("act");
    backend.keyDown("a", { code: "KeyA" }); sys.update();
    backend.keyDown("b", { code: "KeyB" }); sys.update();
    backend.keyDown("c", { code: "KeyC" }); sys.update();
    const a = Input.next("act");
    const b = Input.next("act");
    const c = Input.next("act");
    const d = Input.next("act");
    assert.ok(a && a.code === "KeyA");
    assert.ok(b && b.code === "KeyB");
    assert.ok(c && c.code === "KeyC");
    assert.strictEqual(d, null);
  });
  it("consuming one queue does not consume another", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    map.bind("fire", new KeyBinding(KeyCode.KEY_F));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    backend.keyDown("f", { code: "KeyF" }); sys.update();
    Input.queue("jump"); Input.queue("fire");
    Input.next("jump");
    assert.strictEqual(Input.queue("jump").length, 0);
    assert.strictEqual(Input.queue("fire").length, 1);
  });
});

describe("Phase3 — Snake sequence", () => {
  it("W→D→S→A preserved in order", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("move", new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_W), vector: [0, -1] },
      { binding: new KeyBinding(KeyCode.KEY_S), vector: [0, 1] },
      { binding: new KeyBinding(KeyCode.KEY_A), vector: [-1, 0] },
      { binding: new KeyBinding(KeyCode.KEY_D), vector: [1, 0] },
    ]), ActionKind.VECTOR2);
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    backend.keyDown("w", { code: "KeyW" });
    backend.keyDown("d", { code: "KeyD" });
    backend.keyDown("s", { code: "KeyS" });
    backend.keyDown("a", { code: "KeyA" });
    sys.update();
    const q = Input.queue("move");
    assert.deepStrictEqual(q.map(v => [v.x, v.y]), [[0,-1],[1,0],[0,1],[-1,0]]);
    // Game would filter opposite, but input preserves all
  });
});

describe("Phase3 — Input.buffer()", () => {
  it("press enters buffer", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    Input.buffer("jump", 120);
    assert.ok(Input.buffered("jump"));
  });
  it("buffer remains valid inside window", async () => {
    const { sys } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    Input.buffer("jump", 100);
    await new Promise(r => setTimeout(r, 50));
    assert.ok(Input.buffered("jump"));
  });
  it("buffer expires after window", async () => {
    const { sys } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    Input.buffer("jump", 50);
    await new Promise(r => setTimeout(r, 70));
    // Need to trigger snapshot to expire
    sys.update();
    assert.strictEqual(Input.buffered("jump"), false);
  });
  it("consumption removes buffered input", () => {
    const { sys } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    Input.buffer("jump", 100);
    assert.ok(Input.consumeBuffered("jump"));
    assert.strictEqual(Input.buffered("jump"), false);
    assert.strictEqual(Input.consumeBuffered("jump"), false);
  });
  it("timestamps determine expiration", async () => {
    const { sys } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    const start = performance.now();
    Input.buffer("jump", 60);
    await new Promise(r => setTimeout(r, 30));
    assert.ok(Input.buffered("jump"));
    await new Promise(r => setTimeout(r, 40));
    sys.update();
    assert.strictEqual(Input.buffered("jump"), false);
    const elapsed = performance.now() - start;
    assert.ok(elapsed >= 70);
  });
  it("buffer does not change pressed semantics", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("jump", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    Input.buffer("jump", 100);
    // No press, pressed should be false, but buffered true
    assert.strictEqual(Input.pressed("jump"), false);
    assert.ok(Input.buffered("jump"));
    // Press then buffer: pressed true one tick, buffered also
    backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.pressed("jump"));
  });
});

describe("Phase3 — Tick boundaries", () => {
  it("events empty on next tick while history retains", () => {
    const { sys, backend } = setup();
    backend.keyDown("w", { code: "KeyW" }); sys.update();
    assert.strictEqual(Input.events().length, 1);
    assert.strictEqual(Input.history().length, 1);
    sys.update();
    assert.strictEqual(Input.events().length, 0);
    assert.strictEqual(Input.history().length, 1);
  });
});
