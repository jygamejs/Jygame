import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Input } from "../../input/Input.js";
import { KeyCode } from "../../input/KeyCode.js";
import { Keyboard } from "../../input/Keyboard.js";
import { ActionMap } from "../../input/actions/ActionMap.js";
import { InputContext } from "../../input/actions/InputContext.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { CompositeBinding } from "../../input/actions/CompositeBinding.js";
import { ChordBinding } from "../../input/actions/ChordBinding.js";
import { ActionKind } from "../../input/ActionKind.js";

let now = 1000;
let origNow;
beforeEach(() => {
  origNow = performance.now;
  performance.now = () => now;
});
afterEach(() => {
  performance.now = origNow;
  Input.keyboard.repeatDelay = 400;
  Input.keyboard.repeatRate = 50;
});

function setup(opts = {}) {
  const sys = new InputSystem(opts);
  const backend = new TestBackend();
  sys.setBackend(backend);
  sys.devices.register(new Keyboard());
  Input.setSystem(sys);
  Input.keyboard.repeatDelay = 400;
  Input.keyboard.repeatRate = 50;
  return { sys, backend };
}

describe("Phase4 — Input.repeated initial press", () => {
  it("press → repeated true", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000;
    backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.strictEqual(Input.repeated("fire"), true);
  });
});

describe("Phase4 — delay", () => {
  it("no repeat before delay", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire"));
    now = 1200; sys.update();
    assert.strictEqual(Input.repeated("fire"), false);
  });
  it("first repeat after delay", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    now = 1400; sys.update();
    assert.strictEqual(Input.repeated("fire"), true);
  });
});

describe("Phase4 — repeat rate", () => {
  it("subsequent activations follow rate", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    now = 1400; sys.update(); assert.ok(Input.repeated("fire"));
    now = 1450; sys.update(); assert.ok(Input.repeated("fire"));
    now = 1480; sys.update(); assert.strictEqual(Input.repeated("fire"), false);
    now = 1500; sys.update(); assert.ok(Input.repeated("fire"));
  });
});

describe("Phase4 — release", () => {
  it("release stops repeat", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire"));
    backend.keyUp(" ", { code: "Space" }); sys.update();
    assert.strictEqual(Input.repeated("fire"), false);
  });
});

describe("Phase4 — re-press", () => {
  it("second press starts fresh delay", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire"));
    backend.keyUp(" ", { code: "Space" }); sys.update();
    now = 1800; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire"));
    now = 2000; sys.update();
    assert.strictEqual(Input.repeated("fire"), false);
    now = 2200; sys.update();
    assert.ok(Input.repeated("fire"));
  });
});

describe("Phase4 — multiple simultaneous", () => {
  it("independent repeat schedules", () => {
    const { sys, backend } = setup();
    const map = new ActionMap();
    map.bind("a", new KeyBinding(KeyCode.KEY_A));
    map.bind("b", new KeyBinding(KeyCode.KEY_B));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown("a", { code: "KeyA" }); sys.update();
    assert.ok(Input.repeated("a"));
    now = 1100; backend.keyDown("b", { code: "KeyB" }); sys.update();
    assert.ok(Input.repeated("b"));
    now = 1400; sys.update();
    assert.ok(Input.repeated("a"));
    assert.strictEqual(Input.repeated("b"), false);
    now = 1500; sys.update();
    assert.ok(Input.repeated("b"));
  });
});

describe("Phase4 — variable frame rate", () => {
  it("irregular timestamps deterministic", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    now = 1016; sys.update(); assert.strictEqual(Input.repeated("fire"), false);
    now = 1033; sys.update(); assert.strictEqual(Input.repeated("fire"), false);
    now = 1405; sys.update(); assert.ok(Input.repeated("fire"));
    now = 1458; sys.update(); assert.ok(Input.repeated("fire"));
    now = 1510; sys.update(); assert.ok(Input.repeated("fire"));
  });
});

describe("Phase4 — slow frame", () => {
  it("slow frame produces at most one activation and stays aligned", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update(); assert.ok(Input.repeated("fire"));
    now = 1200; sys.update(); assert.strictEqual(Input.repeated("fire"), false);
    now = 1700; sys.update();
    assert.ok(Input.repeated("fire"));
    now = 1720; sys.update(); assert.strictEqual(Input.repeated("fire"), false);
    now = 1750; sys.update(); assert.ok(Input.repeated("fire"));
  });
});

describe("Phase4 — browser repeat duplication", () => {
  it("browser repeat does not cause pressed to fire", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space", repeat: false }); sys.update();
    assert.ok(Input.pressed("fire"));
    now = 1100; backend.keyDown(" ", { code: "Space", repeat: true }); sys.update();
    assert.strictEqual(Input.pressed("fire"), false);
    assert.strictEqual(Input.repeated("fire"), false);
  });
});

describe("Phase4 — actions", () => {
  it("action repeat", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire"));
  });
});

describe("Phase4 — raw identifiers", () => {
  it("raw KeyA", () => {
    const { sys, backend } = setup();
    now = 1000; backend.keyDown("a", { code: "KeyA" }); sys.update();
    assert.ok(Input.repeated("KeyA"));
    assert.ok(Input.repeated("a"));
  });
});

describe("Phase4 — chords", () => {
  it("chord repeat and modifier release stops", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("delWord", new ChordBinding(KeyCode.BACKSPACE, {ctrl: true}));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000;
    backend.keyDown("ControlLeft", { code: "ControlLeft" }); sys.update();
    backend.keyDown("Backspace", { code: "Backspace" }); sys.update();
    assert.ok(Input.repeated("delWord"));
    now = 1100;
    backend.keyUp("ControlLeft", { code: "ControlLeft" }); sys.update();
    assert.strictEqual(Input.repeated("delWord"), false);
  });
});

describe("Phase4 — configuration", () => {
  it("defaults", () => {
    const { sys } = setup();
    assert.strictEqual(Input.keyboard.repeatDelay, 400);
    assert.strictEqual(Input.keyboard.repeatRate, 50);
  });
  it("runtime changes", () => {
    const { sys, backend } = setup();
    Input.keyboard.repeatDelay = 200;
    Input.keyboard.repeatRate = 30;
    assert.strictEqual(Input.keyboard.repeatDelay, 200);
    assert.strictEqual(Input.keyboard.repeatRate, 30);
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire"));
    now = 1200; sys.update(); assert.ok(Input.repeated("fire"));
    now = 1230; sys.update(); assert.ok(Input.repeated("fire"));
  });
  it("invalid values", () => {
    assert.throws(() => { Input.keyboard.repeatDelay = -1; }, /repeatDelay/);
    assert.throws(() => { Input.keyboard.repeatRate = 0; }, /repeatRate/);
    assert.throws(() => { Input.keyboard.repeatRate = -5; }, /repeatRate/);
    assert.throws(() => { Input.repeated("fire", { delay: -1 }); }, /repeatDelay/);
    assert.throws(() => { Input.repeated("fire", { rate: 0 }); }, /repeatRate/);
  });
  it("per-call options", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire", { delay: 100, rate: 50 }));
    now = 1100; sys.update(); assert.ok(Input.repeated("fire", { delay: 100, rate: 50 }));
  });
});

describe("Phase4 — context lifecycle", () => {
  it("repeat disappears when context popped", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const ctx = new InputContext("game", map);
    const stack = new ContextStack(); stack.push(ctx); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire"));
    stack.pop("game");
    assert.strictEqual(Input.repeated("fire"), false);
  });
});

describe("Phase4 — focus/reset", () => {
  it("keyboard reset stops repeat", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.repeated("fire"));
    const kb = sys.devices.get(Keyboard);
    kb.state._keys.fill(0);
    sys.update();
    assert.strictEqual(Input.repeated("fire"), false);
  });
});

describe("Phase4 — do not modify pressed", () => {
  it("pressed remains edge-triggered", () => {
    const { sys, backend } = setup();
    const map = new ActionMap(); map.bind("fire", new KeyBinding(KeyCode.SPACE));
    const stack = new ContextStack(); stack.push(new InputContext("t", map)); sys.contextStack = stack;
    now = 1000; backend.keyDown(" ", { code: "Space" }); sys.update();
    assert.ok(Input.pressed("fire"));
    assert.ok(Input.repeated("fire"));
    now = 1100; sys.update();
    assert.strictEqual(Input.pressed("fire"), false);
    assert.strictEqual(Input.repeated("fire"), false);
  });
});
