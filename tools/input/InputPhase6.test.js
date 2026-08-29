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

describe("Phase6A — Input.match construction", () => {
  it("Input.match(fn) returns matcher", () => {
    const m = Input.match(() => true);
    assert.ok(m);
    assert.strictEqual(typeof m.predicate, "function");
  });
  it("matcher distinguishable from plain object", () => {
    const m = Input.match(() => true);
    const plain = { predicate: () => true };
    // matcher has internal symbol
    const syms = Object.getOwnPropertySymbols(m);
    assert.ok(syms.length === 1);
    assert.strictEqual(m[syms[0]], true);
    assert.strictEqual(Object.getOwnPropertySymbols(plain).length, 0);
    // sequence with plain object throws
    const { sys } = setup();
    assert.throws(() => Input.sequence([plain]), /sequence elements/);
  });
  it("invalid predicates throw TypeError", () => {
    assert.throws(() => Input.match("forward"), TypeError);
    assert.throws(() => Input.match(null), TypeError);
    assert.throws(() => Input.match({}), TypeError);
    assert.throws(() => Input.match(123), TypeError);
    assert.throws(() => Input.match(), TypeError);
  });
});

describe("Phase6A — matcher sequence integration", () => {
  it("matcher matches", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    const m = Input.match(() => true);
    assert.strictEqual(Input.sequence([m]), true);
  });
  it("matcher does not match", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    const m = Input.match(() => false);
    assert.strictEqual(Input.sequence([m]), false);
  });
  it("multiple matchers", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    const m1 = Input.match(ev => ev.action === "a");
    const m2 = Input.match(ev => ev.action === "b");
    assert.strictEqual(Input.sequence([m1, m2]), true);
    assert.strictEqual(Input.sequence([m2, m1]), false);
  });
  it("matcher mixed with strings and raw", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("down", new KeyBinding(KeyCode.KEY_S)); map.bind("punch", new KeyBinding(KeyCode.KEY_J));
    sys.contextStack.push(new InputContext("t", map));
    const fighter = { facing: 1 };
    const forward = Input.match(ev => {
      if (ev.action !== "left" && ev.action !== "right") return false;
      const dir = ev.action === "right" ? 1 : -1;
      return dir === fighter.facing;
    });
    // need right action
    const map2 = new ActionMap(); map2.bind("right", new KeyBinding(KeyCode.KEY_D)); map2.bind("left", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("dirs", map2, { priority: 5 }));
    now = 1000; pressKey(backend, "s", "KeyS"); sys.update();
    now = 1100; pressKey(backend, "d", "KeyD"); sys.update();
    now = 1200; pressKey(backend, "j", "KeyJ"); sys.update();
    assert.strictEqual(Input.sequence(["down", forward, "punch"]), true);
    assert.strictEqual(Input.sequence(["down", forward, "KeyJ"]), true);
  });
  it("matcher in first/middle/final", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B)); map.bind("c", new KeyBinding(KeyCode.KEY_C));
    sys.contextStack.push(new InputContext("t", map));
    const ma = Input.match(ev => ev.action === "a");
    const mb = Input.match(ev => ev.action === "b");
    const mc = Input.match(ev => ev.action === "c");
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    now = 1200; pressKey(backend, "c", "KeyC"); sys.update();
    assert.strictEqual(Input.sequence([ma, "b", "c"]), true);
    assert.strictEqual(Input.sequence(["a", mb, "c"]), true);
    assert.strictEqual(Input.sequence(["a", "b", mc]), true);
  });
});

describe("Phase6A — historical events", () => {
  it("predicate receives timestamp/device/code", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("t", map));
    now = 1234; pressKey(backend, "a", "KeyA"); sys.update();
    let seen = null;
    const m = Input.match(ev => { seen = ev; return true; });
    Input.sequence([m]);
    assert.ok(seen);
    assert.strictEqual(seen.timestamp, 1234);
    assert.strictEqual(seen.device, "keyboard");
    assert.strictEqual(seen.data.code, "KeyA");
    assert.strictEqual(seen.data.key, "a");
  });
  it("predicate receives correct ordering and multiple candidates", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    const seen = [];
    const m = Input.match(ev => { seen.push(ev.action); return ev.action === "b"; });
    assert.strictEqual(Input.sequence(["a", m]), true);
    // seen should include at least b (and possibly a if predicate called for both, but our DFS only calls for candidate at step 1)
    assert.ok(seen.includes("b"));
  });
});

describe("Phase6A — temporal", () => {
  it("matcher across multiple ticks", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    const m = Input.match(ev => ev.action === "b");
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1500; pressKey(backend, "b", "KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a", m]), true);
  });
  it("matcher participates in within", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B)); map.bind("c", new KeyBinding(KeyCode.KEY_C));
    sys.contextStack.push(new InputContext("t", map));
    const mb = Input.match(ev => ev.action === "b");
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    now = 1300; pressKey(backend, "c", "KeyC"); sys.update();
    assert.strictEqual(Input.sequence(["a", mb, "c"], { within: 300 }), true);
    assert.strictEqual(Input.sequence(["a", mb, "c"], { within: 100 }), false);
  });
  it("old events expire via bounded history", () => {
    const sys = new InputSystem({ historyCapacity: 3 }); const backend = new TestBackend();
    sys.setBackend(backend); sys.devices.register(new Keyboard()); sys.contextStack = new ContextStack(); Input.setSystem(sys);
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("t", map));
    const m = Input.match(ev => ev.action === "a");
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1100; pressKey(backend, "b", "KeyB"); sys.update();
    now = 1200; pressKey(backend, "c", "KeyC"); sys.update();
    now = 1300; pressKey(backend, "d", "KeyD"); sys.update();
    // history capacity 3, first a evicted, matcher for a should now be false
    assert.strictEqual(Input.sequence([m]), false);
  });
  it("irregular tick timing deterministic via timestamp", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A)); map.bind("b", new KeyBinding(KeyCode.KEY_B));
    sys.contextStack.push(new InputContext("t", map));
    const m = Input.match(ev => ev.action === "b");
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    now = 1016; sys.update();
    now = 1033; sys.update();
    now = 1150; pressKey(backend, "b", "KeyB"); sys.update();
    assert.strictEqual(Input.sequence(["a", m], { within: 300 }), true);
  });
});

describe("Phase6A — action integration", () => {
  it("matcher can inspect action via enriched event", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("right", new KeyBinding(KeyCode.KEY_D)); map.bind("down", new KeyBinding(KeyCode.KEY_S)); map.bind("punch", new KeyBinding(KeyCode.KEY_J));
    sys.contextStack.push(new InputContext("t", map));
    const forward = Input.match(ev => ev.action === "right");
    now = 1000; pressKey(backend, "s", "KeyS"); sys.update();
    now = 1100; pressKey(backend, "d", "KeyD"); sys.update();
    now = 1200; pressKey(backend, "j", "KeyJ"); sys.update();
    assert.strictEqual(Input.sequence(["down", forward, "punch"]), true);
  });
  it("forward semantic with facing", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("left", new KeyBinding(KeyCode.KEY_A)); map.bind("right", new KeyBinding(KeyCode.KEY_D)); map.bind("down", new KeyBinding(KeyCode.KEY_S)); map.bind("punch", new KeyBinding(KeyCode.KEY_J));
    sys.contextStack.push(new InputContext("t", map));
    const fighter = { facing: 1 };
    const forward = Input.match(ev => {
      if (ev.action !== "left" && ev.action !== "right") return false;
      const dir = ev.action === "right" ? 1 : -1;
      return dir === fighter.facing;
    });
    now = 1000; pressKey(backend, "s", "KeyS"); sys.update();
    now = 1100; pressKey(backend, "d", "KeyD"); sys.update();
    now = 1200; pressKey(backend, "j", "KeyJ"); sys.update();
    assert.strictEqual(Input.sequence(["down", forward, "punch"]), true);
    fighter.facing = -1;
    assert.strictEqual(Input.sequence(["down", forward, "punch"]), false);
  });
});

describe("Phase6A — non-destructive", () => {
  it("matcher does not mutate history/events", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    const len = Input.history().length;
    const evLen = Input.events().length;
    const m = Input.match(() => true);
    Input.sequence([m]);
    assert.strictEqual(Input.history().length, len);
    assert.strictEqual(Input.events().length, evLen);
  });
  it("does not interfere with queue/next/buffer/repeated", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    const m = Input.match(() => true);
    Input.sequence([m]);
    assert.strictEqual(typeof Input.next, "function");
    assert.strictEqual(typeof Input.queue, "function");
    assert.strictEqual(typeof Input.buffered, "function");
    assert.strictEqual(typeof Input.repeated, "function");
    // queue still works
    assert.ok(Array.isArray(Input.queue("a")));
  });
});

describe("Phase6A — predicate errors", () => {
  it("thrown errors propagate", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("a", new KeyBinding(KeyCode.KEY_A));
    sys.contextStack.push(new InputContext("t", map));
    now = 1000; pressKey(backend, "a", "KeyA"); sys.update();
    const bad = Input.match(() => { throw new Error("game bug"); });
    assert.throws(() => Input.sequence([bad]), /game bug/);
  });
});
