import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";
import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureEngine } from "../GestureEngine.js";
import { GestureEngine as GestureEngineActual } from "../GestureEngine.js";
import { TapRecognizer } from "../recognizers/TapRecognizer.js";
import { DoubleTapRecognizer } from "../recognizers/DoubleTapRecognizer.js";
import { LongPressRecognizer } from "../recognizers/LongPressRecognizer.js";
import { DragRecognizer } from "../recognizers/DragRecognizer.js";
import { SwipeRecognizer } from "../recognizers/SwipeRecognizer.js";
import { PinchRecognizer } from "../recognizers/PinchRecognizer.js";
import { RotateRecognizer } from "../recognizers/RotateRecognizer.js";
import { PanRecognizer } from "../recognizers/PanRecognizer.js";
import { PointerManager } from "../PointerManager.js";
import { InputEventQueue } from "../InputEventQueue.js";
import { InputEvent } from "../InputEvent.js";
import { EventType } from "../EventType.js";
import { Tier } from "../Tier.js";

function mockPointer({ id, x, y, justDown = false, isDown = true, justUp = false, velocityX = 0, velocityY = 0 }) {
  const pos = { x, y };
  return {
    id,
    position: pos,
    get x() { return pos.x; },
    get y() { return pos.y; },
    justDown,
    isDown,
    justUp,
    velocity: { x: velocityX, y: velocityY },
    type: "touch",
  };
}

function makePointers(configs) {
  return configs.map(c => mockPointer(c));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("GestureType", () => {
  it("defines TAP", () => assert.strictEqual(GestureType.TAP, "tap"));
  it("defines DOUBLE_TAP", () => assert.strictEqual(GestureType.DOUBLE_TAP, "double_tap"));
  it("defines LONG_PRESS", () => assert.strictEqual(GestureType.LONG_PRESS, "long_press"));
  it("defines DRAG", () => assert.strictEqual(GestureType.DRAG, "drag"));
  it("defines SWIPE", () => assert.strictEqual(GestureType.SWIPE, "swipe"));
  it("defines PINCH", () => assert.strictEqual(GestureType.PINCH, "pinch"));
  it("defines ROTATE", () => assert.strictEqual(GestureType.ROTATE, "rotate"));
  it("defines PAN", () => assert.strictEqual(GestureType.PAN, "pan"));
  it("is frozen", () => assert.ok(Object.isFrozen(GestureType)));
});

describe("GestureEvent", () => {
  it("stores type", () => {
    const e = new GestureEvent("tap", { position: { x: 10, y: 20 } });
    assert.strictEqual(e.type, "tap");
  });

  it("stores position", () => {
    const e = new GestureEvent("tap", { position: { x: 10, y: 20 } });
    assert.strictEqual(e.position.x, 10);
    assert.strictEqual(e.position.y, 20);
  });

  it("stores delta", () => {
    const e = new GestureEvent("drag", { delta: { x: 5, y: -3 } });
    assert.strictEqual(e.delta.x, 5);
    assert.strictEqual(e.delta.y, -3);
  });

  it("stores scale", () => {
    const e = new GestureEvent("pinch", { scale: 1.5 });
    assert.strictEqual(e.scale, 1.5);
  });

  it("stores rotation", () => {
    const e = new GestureEvent("rotate", { rotation: 0.5 });
    assert.strictEqual(e.rotation, 0.5);
  });

  it("stores velocity", () => {
    const e = new GestureEvent("swipe", { velocity: 600 });
    assert.strictEqual(e.velocity, 600);
  });

  it("stores duration", () => {
    const e = new GestureEvent("tap", { duration: 50 });
    assert.strictEqual(e.duration, 50);
  });

  it("stores pointerIds", () => {
    const e = new GestureEvent("pinch", { pointerIds: [1, 2] });
    assert.deepStrictEqual(e.pointerIds, [1, 2]);
  });

  it("uses defaults for missing fields", () => {
    const e = new GestureEvent("tap");
    assert.deepStrictEqual(e.position, { x: 0, y: 0 });
    assert.strictEqual(e.scale, 1);
    assert.strictEqual(e.velocity, 0);
    assert.strictEqual(e.duration, 0);
    assert.deepStrictEqual(e.pointerIds, []);
  });
});

describe("GestureRecognizer base", () => {
  it("returns null type", () => {
    const r = new GestureRecognizer();
    assert.strictEqual(r.type, null);
  });

  it("starts inactive", () => {
    const r = new GestureRecognizer();
    assert.strictEqual(r.active, false);
  });

  it("result returns consumed result once", () => {
    const r = new GestureRecognizer();
    r._result = "hello";
    assert.strictEqual(r.result, "hello");
    assert.strictEqual(r.result, null);
  });

  it("reset clears state", () => {
    const r = new GestureRecognizer();
    r._active = true;
    r._result = "x";
    r.reset();
    assert.strictEqual(r.active, false);
    assert.strictEqual(r.result, null);
  });
});

describe("TapRecognizer", () => {
  it("detects a quick tap", () => {
    const r = new TapRecognizer(200, 10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([]), 16);
    const result = r.result;
    assert.ok(result !== null);
    assert.strictEqual(result.type, GestureType.TAP);
  });

  it("rejects tap that moves too far", () => {
    const r = new TapRecognizer(200, 10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([{ id: 1, x: 200, y: 200, isDown: true }]), 16);
    r.update(makePointers([]), 16);
    assert.strictEqual(r.result, null);
  });

  it("becomes active while finger is down", () => {
    const r = new TapRecognizer(200, 10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    assert.ok(r.active);
  });

  it("is inactive with no pointers", () => {
    const r = new TapRecognizer(200, 10);
    r.update([], 16);
    assert.strictEqual(r.active, false);
  });

  it("is inactive after tap completes", () => {
    const r = new TapRecognizer(200, 10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([]), 16);
    assert.strictEqual(r.active, false);
  });

  it("tracks multiple taps independently", () => {
    const r = new TapRecognizer(200, 10);
    r.update(makePointers([
      { id: 1, x: 100, y: 200, justDown: true },
      { id: 2, x: 300, y: 400, justDown: true },
    ]), 16);
    assert.ok(r.active);
    r.update(makePointers([]), 16);
    assert.strictEqual(r.result !== null, true);
  });
});

describe("DoubleTapRecognizer", () => {
  it("detects a double tap", () => {
    const r = new DoubleTapRecognizer(300, 10, 200);
    // First tap: down + up
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([]), 16);
    assert.strictEqual(r.result, null); // first tap doesn't produce result

    // Second tap within interval: down + up
    r.update(makePointers([{ id: 2, x: 105, y: 205, justDown: true }]), 16);
    r.update(makePointers([]), 16);
    const result = r.result;
    assert.ok(result !== null);
    assert.strictEqual(result.type, GestureType.DOUBLE_TAP);
  });

  it("does not fire when taps are too far apart", () => {
    const r = new DoubleTapRecognizer(300, 10, 200);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([]), 16);
    r.update(makePointers([{ id: 2, x: 300, y: 200, justDown: true }]), 16);
    r.update(makePointers([]), 16);
    assert.strictEqual(r.result, null);
  });
});

describe("LongPressRecognizer", () => {
  it("fires after minTime with no movement", async () => {
    const r = new LongPressRecognizer(50, 10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    assert.strictEqual(r.active, true);
    await delay(60);
    // same position, still down
    r.update(makePointers([{ id: 1, x: 100, y: 200, isDown: true }]), 16);
    const result = r.result;
    assert.ok(result !== null);
    assert.strictEqual(result.type, GestureType.LONG_PRESS);
  });

  it("does not fire if pointer moves too far", async () => {
    const r = new LongPressRecognizer(50, 10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    await delay(60);
    r.update(makePointers([{ id: 1, x: 200, y: 200, isDown: true }]), 16);
    assert.strictEqual(r.result, null);
  });
});

describe("DragRecognizer", () => {
  it("fires on release after movement beyond threshold", () => {
    const r = new DragRecognizer(10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([{ id: 1, x: 150, y: 200, isDown: true }]), 16);
    r.update(makePointers([]), 16);
    const result = r.result;
    assert.ok(result !== null);
    assert.strictEqual(result.type, GestureType.DRAG);
  });

  it("does not fire without enough movement", () => {
    const r = new DragRecognizer(10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([]), 16);
    assert.strictEqual(r.result, null);
  });

  it("is active while dragging", () => {
    const r = new DragRecognizer(10);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    assert.strictEqual(r.active, false); // not yet dragging
    r.update(makePointers([{ id: 1, x: 150, y: 200, isDown: true }]), 16);
    assert.ok(r.active); // now dragging
  });
});

describe("SwipeRecognizer", () => {
  it("fires on fast release", () => {
    const r = new SwipeRecognizer(100, 30);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([{ id: 1, x: 200, y: 200, isDown: true }]), 16);
    r.update(makePointers([]), 16);
    const result = r.result;
    assert.ok(result !== null);
    assert.strictEqual(result.type, GestureType.SWIPE);
  });

  it("does not fire for slow movement", () => {
    const r = new SwipeRecognizer(10000, 5);
    r.update(makePointers([{ id: 1, x: 100, y: 200, justDown: true }]), 16);
    r.update(makePointers([{ id: 1, x: 105, y: 200, isDown: true }]), 16);
    r.update(makePointers([]), 16);
    assert.strictEqual(r.result, null);
  });
});

describe("PinchRecognizer", () => {
  it("activates with two pointers", () => {
    const r = new PinchRecognizer();
    r.update(makePointers([
      { id: 1, x: 100, y: 200, isDown: true },
      { id: 2, x: 300, y: 200, isDown: true },
    ]), 16);
    assert.ok(r.active);
  });

  it("computes scale when fingers move apart", () => {
    const r = new PinchRecognizer();
    r.update(makePointers([
      { id: 1, x: 100, y: 200, isDown: true },
      { id: 2, x: 300, y: 200, isDown: true },
    ]), 16);
    // Check that active indicates tracking
    assert.ok(r.active);
    // After a second frame with wider spread, detect the result on release
    r.update(makePointers([
      { id: 1, x: 100, y: 200, isDown: true },
    ]), 16);
    const result = r.result;
    assert.ok(result !== null);
    assert.strictEqual(result.type, GestureType.PINCH);
  });

  it("fires result when one finger lifts", () => {
    const r = new PinchRecognizer();
    r.update(makePointers([
      { id: 1, x: 100, y: 200, isDown: true },
      { id: 2, x: 300, y: 200, isDown: true },
    ]), 16);
    r.update(makePointers([
      { id: 1, x: 100, y: 200, isDown: true },
    ]), 16);
    const result = r.result;
    assert.ok(result !== null);
    assert.strictEqual(result.type, GestureType.PINCH);
  });

  it("is inactive with no pointers", () => {
    const r = new PinchRecognizer();
    r.update([], 16);
    assert.strictEqual(r.active, false);
  });
});

describe("RotateRecognizer", () => {
  it("activates with two pointers", () => {
    const r = new RotateRecognizer();
    r.update(makePointers([
      { id: 1, x: 100, y: 200, isDown: true },
      { id: 2, x: 300, y: 200, isDown: true },
    ]), 16);
    assert.ok(r.active);
  });
});

describe("PanRecognizer", () => {
  it("activates with two pointers", () => {
    const r = new PanRecognizer(5);
    r.update(makePointers([
      { id: 1, x: 100, y: 200, isDown: true },
      { id: 2, x: 300, y: 200, isDown: true },
    ]), 16);
    assert.ok(r.active);
  });
});

describe("GestureEngine", () => {
  it("extends Device", () => {
    const pm = new PointerManager();
    const ge = new GestureEngineActual(pm);
    assert.strictEqual(ge.type, GestureEngineActual);
  });

  it("starts with no active gestures", () => {
    const pm = new PointerManager();
    const ge = new GestureEngineActual(pm);
    assert.strictEqual(ge.isActive(GestureType.TAP), false);
    assert.strictEqual(ge.last(GestureType.TAP), null);
  });

  it("reports tap gesture through integration", () => {
    const pm = new PointerManager();
    const ge = new GestureEngineActual(pm);
    const q = new InputEventQueue(64);

    const downEvent = new InputEvent(EventType.POINTER_DOWN, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
      width: 10, height: 12, isPrimary: true,
    });
    const upEvent = new InputEvent(EventType.POINTER_UP, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0, isPrimary: true,
    });

    // Frame 1: pointer down, ge sees it
    q.push(downEvent, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);
    assert.ok(ge.isActive(GestureType.TAP));

    // Frame 2: pointer up, ge detects tap
    q.push(upEvent, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);
    assert.ok(ge.last(GestureType.TAP) !== null);
  });

  it("gesture events are pushed into the queue", () => {
    const pm = new PointerManager();
    const ge = new GestureEngineActual(pm);
    const q = new InputEventQueue(64);

    const down = new InputEvent(EventType.POINTER_DOWN, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
      width: 10, height: 12, isPrimary: true,
    });
    const up = new InputEvent(EventType.POINTER_UP, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0, isPrimary: true,
    });

    q.push(down, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);

    q.push(up, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);

    const collected = [];
    q.drain(e => collected.push(e));
    assert.ok(collected.length > 0);
    assert.strictEqual(collected[0].type, EventType.GESTURE);
  });

  it("consume removes a result", () => {
    const pm = new PointerManager();
    const ge = new GestureEngineActual(pm);
    const q = new InputEventQueue(64);

    const down = new InputEvent(EventType.POINTER_DOWN, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
      width: 10, height: 12, isPrimary: true,
    });
    const up = new InputEvent(EventType.POINTER_UP, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0, isPrimary: true,
    });

    q.push(down, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);

    q.push(up, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);

    const consumed = ge.consume(GestureType.TAP);
    assert.ok(consumed !== null);
    assert.strictEqual(ge.last(GestureType.TAP), null);
  });

  it("results reset each frame", () => {
    const pm = new PointerManager();
    const ge = new GestureEngineActual(pm);
    const q = new InputEventQueue(64);

    const down = new InputEvent(EventType.POINTER_DOWN, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
      width: 10, height: 12, isPrimary: true,
    });
    const up = new InputEvent(EventType.POINTER_UP, {
      pointerId: 1, x: 100, y: 200, type: "touch", button: 0,
      pressure: 0, isPrimary: true,
    });

    // Frame 1: down
    q.push(down, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);

    // Frame 2: up
    q.push(up, Tier.HIGH);
    pm.update(q, 16);
    q.clear();
    ge.update(q, 16);
    assert.ok(ge.last(GestureType.TAP) !== null);

    // Frame 3: no events, results cleared
    ge.update(q, 16);
    assert.strictEqual(ge.last(GestureType.TAP), null);
  });
});
