import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Mouse } from "../Mouse.js";
import { MouseButton } from "../MouseButton.js";
import { InputEventQueue } from "../InputEventQueue.js";
import { InputEvent } from "../InputEvent.js";
import { EventType } from "../EventType.js";
import { Tier } from "../Tier.js";

function pointerEvent(type, data = {}) {
  return new InputEvent(type, {
    pointerId: 0, x: 0, y: 0, type: "mouse", button: 0,
    pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
    width: 1, height: 1, isPrimary: true,
    ...data,
  });
}

function wheelEvent(data = {}) {
  return new InputEvent(EventType.WHEEL, {
    x: 0, y: 0, deltaX: 0, deltaY: 0, deltaZ: 0, deltaMode: 0,
    ...data,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("Mouse", () => {
  it("extends Device and has correct type", () => {
    const m = new Mouse();
    assert.strictEqual(m.type, Mouse);
  });

  it("starts with no buttons down", () => {
    const m = new Mouse();
    assert.strictEqual(m.isDown(MouseButton.LEFT), false);
    assert.strictEqual(m.isDown(MouseButton.RIGHT), false);
  });

  describe("buttons", () => {
    it("marks LEFT button down on pointer down with button=0", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { button: 0 })));
      assert.strictEqual(m.isDown(MouseButton.LEFT), true);
    });

    it("marks RIGHT button down on pointer down with button=2", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { button: 2 })));
      assert.strictEqual(m.isDown(MouseButton.RIGHT), true);
    });

    it("clears button on pointer up", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { button: 0 })));
      m.update(queueWith(pointerEvent(EventType.POINTER_UP, { button: 0 })));
      assert.strictEqual(m.isDown(MouseButton.LEFT), false);
    });

    it("justPressed is true for newly pressed button", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { button: 0 })));
      assert.strictEqual(m.justPressed(MouseButton.LEFT), true);
    });

    it("justPressed is false for held button next frame", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { button: 0 })));
      m.update(queueWith());  // empty
      assert.strictEqual(m.justPressed(MouseButton.LEFT), false);
    });

    it("justReleased is true for released button", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { button: 0 })));
      m.update(queueWith(pointerEvent(EventType.POINTER_UP, { button: 0 })));
      assert.strictEqual(m.justReleased(MouseButton.LEFT), true);
    });

    it("justReleased is false next frame after release", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { button: 0 })));
      m.update(queueWith(pointerEvent(EventType.POINTER_UP, { button: 0 })));
      m.update(queueWith());
      assert.strictEqual(m.justReleased(MouseButton.LEFT), false);
    });

    it("tracks multiple buttons independently", () => {
      const m = new Mouse();
      m.update(queueWith(
        pointerEvent(EventType.POINTER_DOWN, { pointerId: 1, button: 0 }),
        pointerEvent(EventType.POINTER_DOWN, { pointerId: 2, button: 2 }),
      ));
      assert.strictEqual(m.isDown(MouseButton.LEFT), true);
      assert.strictEqual(m.isDown(MouseButton.RIGHT), true);
      assert.strictEqual(m.isDown(MouseButton.MIDDLE), false);
    });

    it("isDown returns false for out-of-range button", () => {
      const m = new Mouse();
      assert.strictEqual(m.isDown(99), false);
    });
  });

  describe("position", () => {
    it("tracks position from pointer down", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 100, y: 200 })));
      assert.strictEqual(m.position.x, 100);
      assert.strictEqual(m.position.y, 200);
    });

    it("updates position from pointer move", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 0, y: 0 })));
      m.update(queueWith(pointerEvent(EventType.POINTER_MOVE, { x: 50, y: 75 })));
      assert.strictEqual(m.position.x, 50);
      assert.strictEqual(m.position.y, 75);
    });

    it("computes delta on move", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 10, y: 20 })));
      m.update(queueWith(pointerEvent(EventType.POINTER_MOVE, { x: 30, y: 50 })));
      assert.strictEqual(m.delta.x, 20);
      assert.strictEqual(m.delta.y, 30);
    });
  });

  describe("hover", () => {
    it("tracks hover position from pointer move", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_MOVE, { x: 200, y: 300 })));
      assert.strictEqual(m.hoverPosition.x, 200);
      assert.strictEqual(m.hoverPosition.y, 300);
    });

    it("isHovering is true after pointer event", () => {
      const m = new Mouse();
      assert.strictEqual(m.isHovering, false);
      m.update(queueWith(pointerEvent(EventType.POINTER_MOVE, { x: 0, y: 0 })));
      assert.strictEqual(m.isHovering, true);
    });
  });

  describe("wheel", () => {
    it("accumulates wheel deltaY", () => {
      const m = new Mouse();
      m.update(queueWith(wheelEvent({ deltaY: 120 })));
      assert.strictEqual(m.wheel, 120);
    });

    it("accumulates wheel deltaX horizontally", () => {
      const m = new Mouse();
      m.update(queueWith(wheelEvent({ deltaX: 50 })));
      assert.strictEqual(m.wheelHorizontal, 50);
    });

    it("sums multiple wheel events in one frame", () => {
      const m = new Mouse();
      m.update(queueWith(
        wheelEvent({ deltaY: 120 }),
        wheelEvent({ deltaY: 60 }),
      ));
      assert.strictEqual(m.wheel, 180);
    });

    it("resets wheel after resetWheel", () => {
      const m = new Mouse();
      m.update(queueWith(wheelEvent({ deltaY: 120 })));
      m.resetWheel();
      assert.strictEqual(m.wheel, 0);
    });
  });

  describe("double-click", () => {
    it("doubleClicked is true on second rapid click", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 10, y: 10 })));
      assert.strictEqual(m.doubleClicked, false);
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 11, y: 10 })));
      assert.strictEqual(m.doubleClicked, true);
    });

    it("doubleClicked resets each frame", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 10, y: 10 })));
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 11, y: 10 })));
      m.update(queueWith());
      assert.strictEqual(m.doubleClicked, false);
    });

    it("distant clicks do not trigger double-click", () => {
      const m = new Mouse();
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 0, y: 0 })));
      m.update(queueWith(pointerEvent(EventType.POINTER_DOWN, { x: 100, y: 100 })));
      assert.strictEqual(m.doubleClicked, false);
    });
  });

  describe("pointer lock", () => {
    it("requestPointerLock sets isPointerLocked", () => {
      const m = new Mouse();
      m.requestPointerLock();
      assert.strictEqual(m.isPointerLocked, true);
    });

    it("exitPointerLock clears isPointerLocked", () => {
      const m = new Mouse();
      m.requestPointerLock();
      m.exitPointerLock();
      assert.strictEqual(m.isPointerLocked, false);
    });
  });
});
