import { describe, it } from "node:test";
import * as assert from "node:assert";
import { KeyCode } from "../KeyCode.js";
import { GestureType } from "../GestureType.js";
import { MouseButton } from "../MouseButton.js";
import { ActionKind } from "../ActionKind.js";

import { KeyBinding } from "../actions/KeyBinding.js";
import { MouseButtonBinding } from "../actions/MouseButtonBinding.js";
import { WheelBinding } from "../actions/WheelBinding.js";
import { ChordBinding } from "../actions/ChordBinding.js";
import { CompositeBinding } from "../actions/CompositeBinding.js";
import { GestureBinding } from "../actions/GestureBinding.js";
import { GamepadButtonBinding } from "../actions/GamepadButtonBinding.js";
import { GamepadAxisBinding } from "../actions/GamepadAxisBinding.js";
import { deserializeBinding } from "../actions/Binding.js";

import { DeadZoneProcessor } from "../actions/processors/DeadZoneProcessor.js";
import { ScaleProcessor } from "../actions/processors/ScaleProcessor.js";
import { InvertProcessor } from "../actions/processors/InvertProcessor.js";
import { SmoothProcessor } from "../actions/processors/SmoothProcessor.js";
import { deserializeProcessor } from "../actions/processors/Processor.js";

import { ActionMap } from "../actions/ActionMap.js";
import { InputContext } from "../actions/InputContext.js";
import { DeviceRegistry } from "../DeviceRegistry.js";
import { Keyboard } from "../Keyboard.js";
import { InputEventQueue } from "../InputEventQueue.js";
import { InputEvent } from "../InputEvent.js";
import { EventType } from "../EventType.js";
import { Tier } from "../Tier.js";
import { ActionEvaluator } from "../actions/ActionEvaluator.js";
import { ActionState } from "../actions/ActionState.js";

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

describe("Binding serialization round-trip", () => {
  it("KeyBinding", () => {
    const b = new KeyBinding(KeyCode.SPACE);
    const data = b.serialize();
    const restored = deserializeBinding(data);
    assert.strictEqual(restored.keyCode, KeyCode.SPACE);
    assert.strictEqual(restored.type, "key");
  });

  it("MouseButtonBinding", () => {
    const b = new MouseButtonBinding(MouseButton.MIDDLE);
    const data = b.serialize();
    const restored = deserializeBinding(data);
    assert.strictEqual(restored.button, MouseButton.MIDDLE);
  });

  it("WheelBinding", () => {
    const b = new WheelBinding("horizontal");
    const data = b.serialize();
    const restored = deserializeBinding(data);
    assert.strictEqual(restored.direction, "horizontal");
  });

  it("ChordBinding", () => {
    const b = new ChordBinding(KeyCode.KEY_C, { ctrl: true, alt: true });
    const data = b.serialize();
    const restored = deserializeBinding(data);
    assert.strictEqual(restored.keyCode, KeyCode.KEY_C);
  });

  it("CompositeBinding", () => {
    const b = new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_D), vector: [1, 0] },
      { binding: new KeyBinding(KeyCode.KEY_A), vector: [-1, 0] },
    ]);
    const data = b.serialize();
    const restored = deserializeBinding(data);
    assert.strictEqual(restored.type, "composite");
    assert.strictEqual(restored.subBindings.length, 2);
    assert.strictEqual(restored.subBindings[0].binding.keyCode, KeyCode.KEY_D);
  });

  it("GestureBinding", () => {
    const b = new GestureBinding(GestureType.SWIPE_LEFT);
    const data = b.serialize();
    const restored = deserializeBinding(data);
    assert.strictEqual(restored.gestureType, GestureType.SWIPE_LEFT);
  });

  it("GamepadButtonBinding", () => {
    const b = new GamepadButtonBinding(5, 1);
    const data = b.serialize();
    const restored = deserializeBinding(data);
    assert.strictEqual(restored.button, 5);
    assert.strictEqual(restored.gamepadIndex, 1);
  });

  it("GamepadAxisBinding", () => {
    const b = new GamepadAxisBinding(2, 1);
    const data = b.serialize();
    const restored = deserializeBinding(data);
    assert.strictEqual(restored.axis, 2);
    assert.strictEqual(restored.gamepadIndex, 1);
  });
});

describe("Processor serialization round-trip", () => {
  it("DeadZoneProcessor", () => {
    const p = new DeadZoneProcessor(0.2, 0.9);
    const data = p.serialize();
    const restored = deserializeProcessor(data);
    assert.strictEqual(restored.inner, 0.2);
    assert.strictEqual(restored.outer, 0.9);
  });

  it("ScaleProcessor", () => {
    const p = new ScaleProcessor(2.5);
    const data = p.serialize();
    const restored = deserializeProcessor(data);
    assert.strictEqual(restored.factor, 2.5);
  });

  it("InvertProcessor", () => {
    const p = new InvertProcessor();
    const data = p.serialize();
    const restored = deserializeProcessor(data);
    assert.ok(restored instanceof InvertProcessor);
  });

  it("SmoothProcessor", () => {
    const p = new SmoothProcessor(6);
    const data = p.serialize();
    const restored = deserializeProcessor(data);
    assert.strictEqual(restored.samples, 6);
  });
});

describe("Binding with processors round-trip", () => {
  it("serializes and restores processors", () => {
    const b = new KeyBinding(KeyCode.SPACE);
    b.processors = [
      new DeadZoneProcessor(0.1, 0.9),
      new ScaleProcessor(2),
    ];
    const data = b.serialize();
    assert.strictEqual(data.processors.length, 2);

    const restored = deserializeBinding(data);
    assert.strictEqual(restored.processors.length, 2);
    assert.strictEqual(restored.processors[0].inner, 0.1);
    assert.strictEqual(restored.processors[1].factor, 2);
  });

  it("restored processors still transform values", () => {
    const b = new KeyBinding(KeyCode.SPACE);
    b.processors = [new ScaleProcessor(0.5)];
    const data = b.serialize();
    const restored = deserializeBinding(data);

    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);
    kb.update(queueWith(keyDown("Space")));

    const raw = restored.evaluate(registry);
    // KeyBinding returns 1, ScaleProcessor(0.5) should have been applied
    // but evaluate returns raw binding value; processors are applied by ActionEvaluator
    assert.strictEqual(raw, 1);

    // Verify ActionEvaluator applies them
    const evaluator = new ActionEvaluator();
    const state = new ActionState(ActionKind.ANALOG);
    evaluator.evaluate([
      { bindings: [restored], state },
    ], registry);
    assert.strictEqual(state.strength, 0.5);
  });
});

describe("ActionMap serialization", () => {
  it("serialize and deserialize round-trip", () => {
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    map.bind("shoot", new MouseButtonBinding(MouseButton.LEFT));
    map.bind("move", new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_D), vector: [1, 0] },
      { binding: new KeyBinding(KeyCode.KEY_A), vector: [-1, 0] },
    ]));

    const data = map.serialize();
    const restored = ActionMap.deserialize(data);

    assert.ok(restored.has("jump"));
    assert.ok(restored.has("shoot"));
    assert.ok(restored.has("move"));
    assert.strictEqual(restored.names.length, 3);

    // Verify bindings are restored
    assert.strictEqual(restored.getBindings("jump")[0].keyCode, KeyCode.SPACE);
    assert.strictEqual(restored.getBindings("shoot")[0].button, MouseButton.LEFT);
    assert.strictEqual(restored.getBindings("move")[0].subBindings.length, 2);
  });

  it("deserialized map evaluates correctly", () => {
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));

    const data = map.serialize();
    const restored = ActionMap.deserialize(data);

    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);
    kb.update(queueWith(keyDown("Space")));

    const evaluator = new ActionEvaluator();
    evaluator.evaluate(restored.entries(), registry);

    assert.strictEqual(restored.getState("jump").pressed, true);
  });

  it("empty map serializes and restores", () => {
    const map = new ActionMap();
    const data = map.serialize();
    const restored = ActionMap.deserialize(data);
    assert.strictEqual(restored.names.length, 0);
  });
});

describe("InputContext serialization", () => {
  it("serialize includes name, priority, consumePolicy, actionMap", () => {
    const map = new ActionMap();
    map.bind("confirm", new KeyBinding(KeyCode.ENTER));
    const ctx = new InputContext("menu", map, { priority: 50, consumePolicy: "pass" });

    const data = ctx.serialize();
    assert.strictEqual(data.name, "menu");
    assert.strictEqual(data.priority, 50);
    assert.strictEqual(data.consumePolicy, "pass");
    assert.ok(data.actionMap);
    assert.ok(data.actionMap.confirm);
  });

  it("default policy serializes as 'block'", () => {
    const ctx = new InputContext("default", new ActionMap());
    const data = ctx.serialize();
    assert.strictEqual(data.consumePolicy, "block");
  });
});

describe("Unknown type errors", () => {
  it("deserializeBinding throws for unknown type", () => {
    assert.throws(() => deserializeBinding({ type: "unknown" }), /Unknown binding type/);
  });

  it("deserializeProcessor throws for unknown type", () => {
    assert.throws(() => deserializeProcessor({ type: "unknown" }), /Unknown processor type/);
  });
});

describe("JSON round-trip", () => {
  it("full ActionMap survives JSON.stringify/parse", () => {
    const map = new ActionMap();
    map.bind("jump", new KeyBinding(KeyCode.SPACE));
    map.bind("move", new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_D), vector: [1, 0] },
      { binding: new KeyBinding(KeyCode.KEY_A), vector: [-1, 0] },
    ]));

    const json = JSON.stringify(map.serialize());
    const parsed = JSON.parse(json);
    const restored = ActionMap.deserialize(parsed);

    assert.strictEqual(restored.names.length, 2);
    assert.strictEqual(restored.getBindings("jump")[0].keyCode, KeyCode.SPACE);
    assert.strictEqual(restored.getBindings("move")[0].subBindings.length, 2);
  });

  it("binding with processors survives JSON round-trip", () => {
    const b = new KeyBinding(KeyCode.KEY_R);
    b.processors = [new DeadZoneProcessor(0.2, 0.95)];
    const json = JSON.stringify(b.serialize());
    const restored = deserializeBinding(JSON.parse(json));
    assert.strictEqual(restored.keyCode, KeyCode.KEY_R);
    assert.strictEqual(restored.processors.length, 1);
    assert.strictEqual(restored.processors[0].inner, 0.2);
  });
});
