import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Input } from "../../input/Input.js";
import { Keyboard } from "../../input/Keyboard.js";
import { Mouse } from "../../input/Mouse.js";
import { PointerManager } from "../../input/PointerManager.js";
import { InputContext } from "../../input/actions/InputContext.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { ActionMap } from "../../input/actions/ActionMap.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { KeyCode } from "../../input/KeyCode.js";
import { ComboMap } from "../../input/ComboMap.js";
import { Scene } from "../../core/Scene.js";
import { HeadlessHost } from "../../core/Host.js";
import { Game } from "../../core/Game.js";

let now = 1000;
let origNow;
beforeEach(() => {
  origNow = performance.now;
  performance.now = () => now;
});
afterEach(() => {
  performance.now = origNow;
});

function setup(opts = {}) {
  const sys = new InputSystem(opts);
  const backend = new TestBackend();
  sys.setBackend(backend);
  sys.devices.register(new Keyboard());
  sys.devices.register(new Mouse());
  sys.devices.register(new PointerManager());
  sys.contextStack = new ContextStack();
  Input.setSystem(sys);
  return { sys, backend };
}

// Helpers
function pressKey(backend, key, code) {
  backend.keyDown(key, { code });
}

describe("Phase6 — sequence basics", () => {
  it("one-input sequence", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    assert.strictEqual(Input.sequence(["a"]), true);
  });
  it("multi-input correct ordering", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B)); map.bind("c", new KeyBinding(KeyCode.KEY_C));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    now = 1200; pressKey(backend, "c", "KeyC"); sys.update();
    assert.strictEqual(Input.sequence(["a","b","c"]), true);
  });
  it("incorrect ordering false", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["b","a"]), false);
  });
  it("unrelated events between elements still matches", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1050; pressKey(backend, "x", "KeyX"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"]), true);
  });
  it("multiple events in one tick", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B)); map.bind("c", new KeyBinding(KeyCode.KEY_C));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000;
    pressKey(backend, "a", "KeyA"); pressKey(backend, "b", "KeyB"); pressKey(backend, "c", "KeyC");
    sys.update();
    assert.strictEqual(Input.sequence(["a","b","c"]), true);
    assert.strictEqual(Input.sequence(["c","b","a"]), false);
  });
});

describe("Phase6 — resolution", () => {
  it("raw identifiers", () => {
    const { sys, backend } = setup();
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    assert.strictEqual(Input.sequence(["KeyA"]), true);
    assert.strictEqual(Input.sequence(["KeyB"]), false);
  });
  it("action names", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("punch", new KeyBinding(KeyCode.KEY_J));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "j", "KeyJ"); sys.update();
    assert.strictEqual(Input.sequence(["punch"]), true);
    assert.strictEqual(Input.sequence(["kick"]), false);
  });
  it("mixed raw/action", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("punch", new KeyBinding(KeyCode.KEY_J)); map.bind("down", new KeyBinding(KeyCode.KEY_S));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "s", "KeyS"); sys.update();
    now = 1100; pressKey(backend, "j", "KeyJ"); sys.update();
    assert.strictEqual(Input.sequence(["down","punch"]), true);
    assert.strictEqual(Input.sequence(["KeyS","punch"]), true);
    assert.strictEqual(Input.sequence(["KeyS","KeyJ"]), true);
  });
  it("named combo", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("punch", new KeyBinding(KeyCode.KEY_J)); map.bind("down", new KeyBinding(KeyCode.KEY_S)); map.bind("right", new KeyBinding(KeyCode.KEY_D));
    const cmap = new ComboMap(); cmap.set("hadoken", { sequence: ["down","right","punch"] });
    sys.contextStack.push(new InputContext("fight", map, { comboMap: cmap }));
    now = 1000; pressKey(backend, "s", "KeyS"); sys.update();
    now = 1100; pressKey(backend, "d", "KeyD"); sys.update();
    now = 1200; pressKey(backend, "j", "KeyJ"); sys.update();
    assert.strictEqual(Input.sequence("hadoken"), true);
    assert.strictEqual(Input.sequence(["down","right","punch"]), true);
  });
  it("active-context resolution and priority", () => {
    const { sys, backend } = setup();
    const mapLow = new ActionMap(); mapLow.bind("punch", new KeyBinding(KeyCode.KEY_K));
    const cmapLow = new ComboMap(); cmapLow.set("hadoken", { sequence: ["punch"] });
    const ctxLow = new InputContext("low", mapLow, { priority: 0, comboMap: cmapLow });
    const mapHigh = new ActionMap(); mapHigh.bind("punch", new KeyBinding(KeyCode.KEY_J));
    const cmapHigh = new ComboMap(); cmapHigh.set("hadoken", { sequence: ["punch"] });
    const ctxHigh = new InputContext("high", mapHigh, { priority: 10, comboMap: cmapHigh });
    sys.contextStack.push(ctxLow); sys.contextStack.push(ctxHigh);
    now = 1000; pressKey(backend, "j", "KeyJ"); sys.update();
    assert.strictEqual(Input.sequence("hadoken"), true);
    // k should not satisfy high's hadoken (expects J)
    const { sys: sys2, backend: backend2 } = setup();
    const mapLow2 = new ActionMap(); mapLow2.bind("punch", new KeyBinding(KeyCode.KEY_K));
    const ctxLow2 = new InputContext("low", mapLow2, { priority: 0 });
    const mapHigh2 = new ActionMap(); mapHigh2.bind("punch", new KeyBinding(KeyCode.KEY_J));
    const cmapHigh2 = new ComboMap(); cmapHigh2.set("hadoken", { sequence: ["punch"] });
    const ctxHigh2 = new InputContext("high", mapHigh2, { priority: 10, comboMap: cmapHigh2 });
    sys2.contextStack.push(ctxLow2); sys2.contextStack.push(ctxHigh2);
    now = 1000; pressKey(backend2, "k", "KeyK"); sys2.update();
    assert.strictEqual(Input.sequence("hadoken"), false);
  });
  it("scene/context cleanup", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    const cmap = new ComboMap(); cmap.set("comboA", { sequence: ["a"] });
    const ctx = new InputContext("sceneA", map, { comboMap: cmap });
    sys.contextStack.push(ctx);
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    assert.strictEqual(Input.sequence("comboA"), true);
    sys.contextStack.pop("sceneA");
    assert.strictEqual(Input.sequence("comboA"), false);
    // direct sequence still works as raw single
    assert.strictEqual(Input.sequence(["KeyA"]), true);
  });
});

describe("Phase6 — scene declarations", () => {
  it("Scene combo array shorthand", async () => {
    const host = new HeadlessHost();
    const game = new Game({ host, width: 800, height: 600 });
    class FightingScene extends Scene {
      input = { punch: "KeyJ", down: "KeyS", right: "KeyD" };
      combo = { hadoken: ["down","right","punch"] };
    }
    const scene = new FightingScene();
    // manually init scene with game context (normally Game would)
    scene._context = game.sceneContext;
    if (scene._context.inputSystem && scene._context.inputSystem.contextStack) {
      scene._compileInputBindings();
      scene._compileCombos();
      const am = scene._actionMap || new ActionMap();
      const cm = scene._comboMap || new ComboMap();
      const ctx = new InputContext("FightingScene", am, { comboMap: cm });
      game.inputSystem.contextStack.push(ctx);
      Input.setSystem(game.inputSystem);
    }
    // simulate inputs via TestBackend-like direct event injection through InputSystem history
    // Use InputSystem directly: push key events
    const sys = game.inputSystem;
    const backend = sys.backend;
    // backend is BrowserBackend, use direct history injection via TestBackend not available; use direct InputEvent push
    const { InputEvent } = await import("../../input/InputEvent.js");
    const { EventType } = await import("../../input/EventType.js");
    const { Tier } = await import("../../input/Tier.js");
    const q = sys._events;
    // ensure timestamps
    now = 1000; q.push(new InputEvent(EventType.KEY_DOWN, { key:"s", code:"KeyS" }), Tier.HIGH);
    sys.update();
    now = 1100; q.push(new InputEvent(EventType.KEY_DOWN, { key:"d", code:"KeyD" }), Tier.HIGH);
    sys.update();
    now = 1200; q.push(new InputEvent(EventType.KEY_DOWN, { key:"j", code:"KeyJ" }), Tier.HIGH);
    sys.update();
    assert.strictEqual(Input.sequence("hadoken"), true);
    game.destroy();
  });
  it("object configuration within and consume", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    const cmap = new ComboMap(); cmap.set("ab", { sequence: ["a","b"], within: 300, consume: true });
    sys.contextStack.push(new InputContext("t", map, { comboMap: cmap }));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    assert.strictEqual(Input.sequence("ab"), true);
    assert.strictEqual(Input.sequence("ab"), false);
  });
  it("multiple combos", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B)); map.bind("c", new KeyBinding(KeyCode.KEY_C));
    const cmap = new ComboMap(); cmap.set("ab", { sequence: ["a","b"] }); cmap.set("bc", { sequence: ["b","c"] });
    sys.contextStack.push(new InputContext("t", map, { comboMap: cmap }));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    now = 1200; pressKey(backend, "c", "KeyC"); sys.update();
    assert.strictEqual(Input.sequence("ab"), true);
    assert.strictEqual(Input.sequence("bc"), true);
  });
});

describe("Phase6 — timing", () => {
  it("within window passes", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B)); map.bind("c", new KeyBinding(KeyCode.KEY_C));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update(); // 100
    now = 1280; pressKey(backend, "c", "KeyC"); sys.update(); // 180
    assert.strictEqual(Input.sequence(["a","b","c"], { within: 300 }), true);
  });
  it("outside window fails", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B)); map.bind("c", new KeyBinding(KeyCode.KEY_C));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update(); // 100
    now = 1550; pressKey(backend, "c", "KeyC"); sys.update(); // 450
    assert.strictEqual(Input.sequence(["a","b","c"], { within: 300 }), false);
  });
  it("exact boundary passes", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1300; pressKey(backend, "b", "KeyB"); sys.update(); // 300 exactly
    assert.strictEqual(Input.sequence(["a","b"], { within: 300 }), true);
  });
  it("irregular frame timing", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1016; sys.update();
    now = 1033; sys.update();
    now = 1150; pressKey(backend, "b", "KeyB"); sys.update(); // gap 150
    assert.strictEqual(Input.sequence(["a","b"], { within: 300 }), true);
  });
  it("multiple ticks with gaps", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("down", new KeyBinding(KeyCode.KEY_S)); map.bind("right", new KeyBinding(KeyCode.KEY_D)); map.bind("punch", new KeyBinding(KeyCode.KEY_J));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "s", "KeyS"); sys.update();
    now = 1200; pressKey(backend, "d", "KeyD"); sys.update();
    now = 1400; pressKey(backend, "j", "KeyJ"); sys.update();
    assert.strictEqual(Input.sequence(["down","right","punch"], { within: 300 }), true);
  });
  it("event timestamps not frame count", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    // 5 empty frames 16ms each = 80ms
    for(let i=0;i<5;i++){ now+=16; sys.update(); }
    now = 1080; pressKey(backend, "b", "KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"], { within: 300 }), true);
    assert.strictEqual(Input.sequence(["a","b"], { within: 50 }), false);
  });
});

describe("Phase6 — history", () => {
  it("previous-tick inputs still match", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; sys.update(); // empty tick
    now = 1200; pressKey(backend, "b", "KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"], { within: 500 }), true);
  });
  it("bounded history evicts old", () => {
    const sys = new InputSystem({ historyCapacity: 3 }); const backend = new TestBackend();
    sys.setBackend(backend); sys.devices.register(new Keyboard()); sys.contextStack = new ContextStack(); Input.setSystem(sys);
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B)); map.bind("c", new KeyBinding(KeyCode.KEY_C)); map.bind("d", new KeyBinding(KeyCode.KEY_D));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; pressKey(backend,"b","KeyB"); sys.update();
    now=1200; pressKey(backend,"c","KeyC"); sys.update();
    now=1300; pressKey(backend,"d","KeyD"); sys.update();
    assert.strictEqual(Input.history().length, 3);
    // a should be evicted, so sequence a,b should fail, but c,d should pass
    assert.strictEqual(Input.sequence(["a","b"]), false);
    assert.strictEqual(Input.sequence(["c","d"]), true);
  });
  it("non-destructive history", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; pressKey(backend,"b","KeyB"); sys.update();
    const before = Input.history().length;
    assert.strictEqual(Input.sequence(["a","b"]), true);
    assert.strictEqual(Input.history().length, before);
  });
  it("sequence matching against historical events not just current tick", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; sys.update();
    now=1200; sys.update();
    now=1300; pressKey(backend,"b","KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"], { within: 500 }), true);
  });
});

describe("Phase6 — consumption", () => {
  it("consumed sequence not rematched", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; pressKey(backend,"b","KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"], { consume: true }), true);
    assert.strictEqual(Input.sequence(["a","b"], { consume: true }), false);
  });
  it("non-consumed remains true", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; pressKey(backend,"b","KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"]), true);
    assert.strictEqual(Input.sequence(["a","b"]), true);
  });
  it("consumption does not mutate history", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; pressKey(backend,"b","KeyB"); sys.update();
    const len = Input.history().length;
    Input.sequence(["a","b"], { consume: true });
    assert.strictEqual(Input.history().length, len);
  });
  it("independent matchers via different sequences", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; pressKey(backend,"b","KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"], { consume: true }), true);
    // different sequence should still match using same events if its matcher independent
    assert.strictEqual(Input.sequence(["a","b"]), true);
  });
  it("overlapping sequences both valid", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; pressKey(backend,"b","KeyB"); sys.update();
    now=1200; pressKey(backend,"a","KeyA"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"]), true);
    assert.strictEqual(Input.sequence(["b","a"]), true);
  });
  it("overlapping with consumption per matcher independent", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now=1000; pressKey(backend,"a","KeyA"); sys.update();
    now=1100; pressKey(backend,"b","KeyB"); sys.update();
    now=1200; pressKey(backend,"a","KeyA"); sys.update();
    assert.strictEqual(Input.sequence(["a","b"], { consume: true }), true);
    assert.strictEqual(Input.sequence(["b","a"], { consume: true }), true);
  });
});
