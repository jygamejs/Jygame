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
import { ActionState } from "../actions/ActionState.js";
import { ActionEvaluator } from "../actions/ActionEvaluator.js";
import { Processor } from "../actions/processors/Processor.js";
import { DeadZoneProcessor } from "../actions/processors/DeadZoneProcessor.js";
import { ScaleProcessor } from "../actions/processors/ScaleProcessor.js";
import { InvertProcessor } from "../actions/processors/InvertProcessor.js";
import { SmoothProcessor } from "../actions/processors/SmoothProcessor.js";
import { KeyBinding } from "../actions/KeyBinding.js";
import { MouseButtonBinding } from "../actions/MouseButtonBinding.js";
import { CompositeBinding } from "../actions/CompositeBinding.js";
import { Mouse } from "../Mouse.js";
import { MouseButton } from "../MouseButton.js";

function keyDown(domCode) {
  return new InputEvent(EventType.KEY_DOWN, {
    key: "?", code: domCode, repeat: false,
    ctrl: false, shift: false, alt: false, meta: false,
    printable: false,
  });
}

function keyUp(domCode) {
  return new InputEvent(EventType.KEY_UP, {
    key: "?", code: domCode,
    ctrl: false, shift: false, alt: false, meta: false,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("Processor base", () => {
  it("returns type 'processor'", () => {
    const p = new Processor();
    assert.strictEqual(p.type, "processor");
  });

  it("process passes value through unchanged", () => {
    const p = new Processor();
    assert.strictEqual(p.process(0.5), 0.5);
  });
});

describe("DeadZoneProcessor", () => {
  it("returns 0 for values below inner threshold", () => {
    const p = new DeadZoneProcessor(0.2, 0.9);
    assert.strictEqual(p.process(0.1), 0);
    assert.strictEqual(p.process(0), 0);
    assert.strictEqual(p.process(-0.1), 0);
  });

  it("returns 1 for values at or above outer threshold", () => {
    const p = new DeadZoneProcessor(0.2, 0.9);
    assert.strictEqual(p.process(0.9), 1);
    assert.strictEqual(p.process(1), 1);
    assert.strictEqual(p.process(-0.9), -1);
  });

  it("scales values between inner and outer", () => {
    const p = new DeadZoneProcessor(0.2, 0.8);
    // midpoint of [0.2, 0.8] is 0.5 → (0.5-0.2)/(0.8-0.2) = 0.3/0.6 = 0.5
    assert.ok(Math.abs(p.process(0.5) - 0.5) < 1e-10);
    // 0.35 → (0.35-0.2)/(0.8-0.2) = 0.15/0.6 = 0.25
    assert.ok(Math.abs(p.process(0.35) - 0.25) < 1e-10);
  });

  it("defaults to inner=0.15 outer=0.95", () => {
    const p = new DeadZoneProcessor();
    assert.strictEqual(p.inner, 0.15);
    assert.strictEqual(p.outer, 0.95);
  });

  it("serializes", () => {
    const p = new DeadZoneProcessor(0.2, 0.9);
    assert.deepStrictEqual(p.serialize(), { type: "deadZone", inner: 0.2, outer: 0.9 });
  });
});

describe("ScaleProcessor", () => {
  it("multiplies value by factor", () => {
    const p = new ScaleProcessor(2);
    assert.strictEqual(p.process(0.3), 0.6);
  });

  it("clamps to [0, 1]", () => {
    const p = new ScaleProcessor(2);
    assert.strictEqual(p.process(0.6), 1);
    assert.strictEqual(p.process(-0.5), 0);
  });

  it("default factor is 1", () => {
    const p = new ScaleProcessor();
    assert.strictEqual(p.factor, 1);
  });

  it("serializes", () => {
    const p = new ScaleProcessor(3);
    assert.deepStrictEqual(p.serialize(), { type: "scale", factor: 3 });
  });
});

describe("InvertProcessor", () => {
  it("returns 1 - value", () => {
    const p = new InvertProcessor();
    assert.strictEqual(p.process(0), 1);
    assert.strictEqual(p.process(1), 0);
    assert.strictEqual(p.process(0.3), 0.7);
  });

  it("serializes", () => {
    const p = new InvertProcessor();
    assert.deepStrictEqual(p.serialize(), { type: "invert" });
  });
});

describe("SmoothProcessor", () => {
  it("returns the average of recent values", () => {
    const p = new SmoothProcessor(3);
    assert.strictEqual(p.process(0), 0);
    assert.strictEqual(p.process(1), 0.5);
    assert.strictEqual(p.process(0), 1 / 3);
  });

  it("default samples is 4", () => {
    const p = new SmoothProcessor();
    assert.strictEqual(p.samples, 4);
  });

  it("reset clears the buffer", () => {
    const p = new SmoothProcessor(2);
    p.process(1);
    p.process(1);
    p.reset();
    assert.strictEqual(p.process(0), 0);
  });

  it("serializes", () => {
    const p = new SmoothProcessor(6);
    assert.deepStrictEqual(p.serialize(), { type: "smooth", samples: 6 });
  });
});

describe("Processor chaining", () => {
  it("applies processors in order", () => {
    const p1 = new ScaleProcessor(2);
    const p2 = new InvertProcessor();
    // scale(2) → invert: invert(scale(0.3)) = invert(0.6) = 0.4
    let value = 0.3;
    value = p1.process(value);
    value = p2.process(value);
    assert.strictEqual(value, 0.4);
  });

  it("dead zone then scale", () => {
    const dz = new DeadZoneProcessor(0.2, 0.8);
    const sc = new ScaleProcessor(1.5);
    // 0.5 → dead zone: 0.5 → scale: 0.75
    let value = dz.process(0.5);
    value = sc.process(value);
    assert.ok(Math.abs(value - 0.75) < 1e-10);
  });
});

describe("ActionEvaluator", () => {
  it("processes a key binding and updates state", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);
    kb.update(queueWith(keyDown("Space")));

    const state = new ActionState();
    const evaluator = new ActionEvaluator();
    const binding = new KeyBinding(KeyCode.SPACE);

    evaluator.evaluate([
      { bindings: [binding], state },
    ], registry);

    assert.strictEqual(state.pressed, true);
  });

  it("runs processors on binding value", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);
    kb.update(queueWith(keyDown("Space")));

    const state = new ActionState(ActionKind.ANALOG);
    const evaluator = new ActionEvaluator();
    const binding = new KeyBinding(KeyCode.SPACE);
    binding.processors = [new ScaleProcessor(0.5)];

    evaluator.evaluate([
      { bindings: [binding], state },
    ], registry);

    // KeyBinding returns 1, ScaleProcessor(0.5) → 0.5
    assert.strictEqual(state.strength, 0.5);
  });

  it("takes the max strength across multiple bindings", () => {
    const registry = new DeviceRegistry();
    const mouse = new Mouse();
    registry.register(mouse);

    const state = new ActionState(ActionKind.ANALOG);
    const evaluator = new ActionEvaluator();

    const kbBinding = new KeyBinding(KeyCode.SPACE); // returns 0 since keyboard not registered
    const mbBinding = new MouseButtonBinding(MouseButton.LEFT); // returns 0
    mouse.update(queueWith(
      new InputEvent(EventType.POINTER_DOWN, {
        pointerId: 1, x: 0, y: 0, type: "mouse", button: 0,
        pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
        width: 1, height: 1, isPrimary: true,
      }),
    ));

    evaluator.evaluate([
      { bindings: [kbBinding, mbBinding], state },
    ], registry);

    assert.strictEqual(state.pressed, true);
  });

  it("passes vector from CompositeBinding", () => {
    const registry = new DeviceRegistry();
    const kb = new Keyboard();
    registry.register(kb);
    kb.update(queueWith(keyDown("KeyD")));

    const state = new ActionState(ActionKind.VECTOR2);
    const evaluator = new ActionEvaluator();
    const wasd = new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_D), vector: [1, 0] },
      { binding: new KeyBinding(KeyCode.KEY_A), vector: [-1, 0] },
    ]);

    evaluator.evaluate([
      { bindings: [wasd], state },
    ], registry);

    assert.strictEqual(state.vector.x, 1);
    assert.strictEqual(state.vector.y, 0);
  });

  it("handles empty bindings", () => {
    const state = new ActionState();
    const evaluator = new ActionEvaluator();

    evaluator.evaluate([
      { bindings: [], state },
    ], new DeviceRegistry());

    assert.strictEqual(state.pressed, false);
    assert.strictEqual(state.strength, 0);
  });
});
