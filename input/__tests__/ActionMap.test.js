import { describe, it } from "node:test";
import * as assert from "node:assert";
import { DeviceRegistry } from "../DeviceRegistry.js";
import { Keyboard } from "../Keyboard.js";
import { KeyCode } from "../KeyCode.js";
import { InputEventQueue } from "../InputEventQueue.js";
import { InputEvent } from "../InputEvent.js";
import { EventType } from "../EventType.js";
import { Tier } from "../Tier.js";
import { ActionKind } from "../ActionKind.js";
import { ActionMap } from "../actions/ActionMap.js";
import { InputContext } from "../actions/InputContext.js";
import { ContextStack } from "../actions/ContextStack.js";
import { ActionEvaluator } from "../actions/ActionEvaluator.js";
import { KeyBinding } from "../actions/KeyBinding.js";
import { MouseButtonBinding } from "../actions/MouseButtonBinding.js";
import { MouseButton } from "../MouseButton.js";

function keyDown(domCode) {
  return new InputEvent(EventType.KEY_DOWN, {
    key: "?", code: domCode, repeat: false,
    ctrl: false, shift: false, alt: false, meta: false,
    printable: false,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("ActionMap", () => {
  it("binds a single key action", () => {
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    assert.ok(map.has("jump"));
    assert.strictEqual(map.getBindings("jump").length, 1);
  });

  it("returns null getState for unknown action", () => {
    const map = new ActionMap();
    assert.strictEqual(map.getState("nonexistent"), null);
  });

  it("addBinding appends to existing action", () => {
    const map = new ActionMap();
    map.bind("shoot", new KeyBinding(KeyCode.KEY_E));
    assert.ok(map.addBinding("shoot", new KeyBinding(KeyCode.KEY_Q)));
    assert.strictEqual(map.getBindings("shoot").length, 2);
  });

  it("addBinding returns false for unknown action", () => {
    const map = new ActionMap();
    assert.strictEqual(map.addBinding("nope", new KeyBinding(KeyCode.SPACE)), false);
  });

  it("removeBinding removes a binding", () => {
    const map = new ActionMap();
    const b1 = new KeyBinding(KeyCode.KEY_A);
    const b2 = new KeyBinding(KeyCode.KEY_B);
    map.bind("move", b1);
    map.addBinding("move", b2);
    assert.ok(map.removeBinding("move", b1));
    assert.strictEqual(map.getBindings("move").length, 1);
    assert.strictEqual(map.getBindings("move")[0], b2);
  });

  it("removeBinding returns false for unknown action", () => {
    const map = new ActionMap();
    assert.strictEqual(map.removeBinding("nope", new KeyBinding(KeyCode.SPACE)), false);
  });

  it("removeBinding returns false if binding not found", () => {
    const map = new ActionMap();
    map.bind("a", new KeyBinding(KeyCode.KEY_A));
    assert.strictEqual(map.removeBinding("a", new KeyBinding(KeyCode.KEY_B)), false);
  });

  it("entries returns all action entries", () => {
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    map.bind("fire", new MouseButtonBinding(MouseButton.LEFT));
    const entries = map.entries();
    assert.strictEqual(entries.length, 2);
    const names = entries.map(e => e.name).sort();
    assert.deepStrictEqual(names, ["fire", "jump"]);
  });

  it("names returns action names", () => {
    const map = new ActionMap();
    map.bind("a", new KeyBinding(KeyCode.KEY_A));
    map.bind("b", new KeyBinding(KeyCode.KEY_B));
    assert.deepStrictEqual([...map.names].sort(), ["a", "b"]);
  });

  it("remove deletes an action", () => {
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    assert.ok(map.remove("jump"));
    assert.strictEqual(map.has("jump"), false);
  });

  it("clear removes all actions", () => {
    const map = new ActionMap();
    map.bind("a", new KeyBinding(KeyCode.KEY_A));
    map.bind("b", new KeyBinding(KeyCode.KEY_B));
    map.clear();
    assert.strictEqual(map.names.length, 0);
  });

  it("evaluates via ActionEvaluator", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);
    kb.update(queueWith(keyDown("Space")));

    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));

    const evaluator = new ActionEvaluator();
    evaluator.evaluate(map.entries(), registry);

    assert.strictEqual(map.getState("jump").pressed, true);
  });
});

describe("InputContext", () => {
  it("stores name, actionMap, priority, consumePolicy", () => {
    const map = new ActionMap();
    const ctx = new InputContext("gameplay", map, { priority: 10, consumePolicy: "pass" });
    assert.strictEqual(ctx.name, "gameplay");
    assert.strictEqual(ctx.actionMap, map);
    assert.strictEqual(ctx.priority, 10);
    assert.strictEqual(ctx.consumePolicy, "pass");
  });

  it("defaults to priority=0 consumePolicy=block", () => {
    const ctx = new InputContext("default", new ActionMap());
    assert.strictEqual(ctx.priority, 0);
    assert.strictEqual(ctx.consumePolicy, "block");
  });
});

describe("ContextStack", () => {
  it("push adds a context", () => {
    const stack = new ContextStack();
    stack.push(new InputContext("g", new ActionMap()));
    assert.strictEqual(stack.size, 1);
  });

  it("pop removes by name", () => {
    const stack = new ContextStack();
    stack.push(new InputContext("a", new ActionMap()));
    stack.push(new InputContext("b", new ActionMap()));
    assert.ok(stack.pop("a"));
    assert.strictEqual(stack.size, 1);
    assert.strictEqual(stack.has("a"), false);
  });

  it("pop returns false for missing name", () => {
    const stack = new ContextStack();
    assert.strictEqual(stack.pop("nope"), false);
  });

  it("get returns context by name", () => {
    const stack = new ContextStack();
    const ctx = new InputContext("test", new ActionMap());
    stack.push(ctx);
    assert.strictEqual(stack.get("test"), ctx);
  });

  it("get returns null for missing name", () => {
    const stack = new ContextStack();
    assert.strictEqual(stack.get("nope"), null);
  });

  it("active returns highest priority context", () => {
    const stack = new ContextStack();
    const low = new InputContext("low", new ActionMap(), { priority: 0 });
    const high = new InputContext("high", new ActionMap(), { priority: 100 });
    stack.push(low);
    stack.push(high);
    assert.strictEqual(stack.active, high);
  });

  it("active returns null for empty stack", () => {
    const stack = new ContextStack();
    assert.strictEqual(stack.active, null);
  });

  it("evaluates contexts in priority order top-down", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    const lowMap = new ActionMap();
    lowMap.bind("jump", new KeyBinding(KeyCode.SPACE));

    const highMap = new ActionMap();
    highMap.bind("jump", new KeyBinding(KeyCode.KEY_W));

    const stack = new ContextStack();
    stack.push(new InputContext("low", lowMap, { priority: 0 }));
    stack.push(new InputContext("high", highMap, { priority: 100 }));

    kb.update(queueWith(keyDown("Space")));
    stack.evaluate(registry);

    // high context blocks low context's "jump" since consumePolicy is "block"
    // highMap has KeyW binding → not pressed (Space is down, not W)
    assert.strictEqual(highMap.getState("jump").pressed, false);
    // low map's jump was consumed/blocked → not evaluated → strength 0
    assert.strictEqual(lowMap.getState("jump").pressed, false);
  });

  it("consumePolicy=pass allows lower context to evaluate same action", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    const lowMap = new ActionMap();
    lowMap.bind("jump", new KeyBinding(KeyCode.SPACE));

    const highMap = new ActionMap();
    highMap.bind("jump", new KeyBinding(KeyCode.KEY_W));

    const stack = new ContextStack();
    stack.push(new InputContext("low", lowMap, { priority: 0 }));
    stack.push(new InputContext("high", highMap, { priority: 100, consumePolicy: "pass" }));

    kb.update(queueWith(keyDown("Space")));
    stack.evaluate(registry);

    // With pass, both contexts evaluate "jump"
    assert.strictEqual(highMap.getState("jump").pressed, false); // W not pressed
    assert.strictEqual(lowMap.getState("jump").pressed, true);   // Space is pressed
  });

  it("evaluates multiple distinct actions across contexts", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);

    const lowMap = new ActionMap();
    lowMap.bind("move", new KeyBinding(KeyCode.KEY_A));

    const highMap = new ActionMap();
    highMap.bind("menu", new KeyBinding(KeyCode.ESCAPE));

    const stack = new ContextStack();
    stack.push(new InputContext("gameplay", lowMap, { priority: 0 }));
    stack.push(new InputContext("menu", highMap, { priority: 50 }));

    kb.update(queueWith(keyDown("Escape")));
    stack.evaluate(registry);

    assert.strictEqual(highMap.getState("menu").pressed, true);
    assert.strictEqual(lowMap.getState("move").pressed, false);
  });

  it("evaluate with empty stack does nothing", () => {
    const stack = new ContextStack();
    stack.evaluate(new DeviceRegistry());
    assert.strictEqual(stack.size, 0);
  });

  it("uses default ActionEvaluator when none provided", () => {
    const stack = new ContextStack();
    assert.ok(stack._evaluator instanceof ActionEvaluator);
  });

  it("accepts custom evaluator", () => {
    let called = false;
    const fakeEval = { evaluate() { called = true; } };
    const stack = new ContextStack(fakeEval);

    const map = new ActionMap();
    map.bind("x", new KeyBinding(KeyCode.SPACE));
    stack.push(new InputContext("t", map));

    stack.evaluate(new DeviceRegistry());
    assert.ok(called);
  });
});
