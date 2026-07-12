import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Stylus } from "../../input/Stylus.js";
import { PointerManager } from "../../input/PointerManager.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";

function penDown(id, options = {}) {
  return new InputEvent(EventType.POINTER_DOWN, {
    pointerId: id, x: 0, y: 0, type: "pen", button: 0,
    pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
    width: 1, height: 1, isPrimary: true,
    ...options,
  });
}

function penMove(id, options = {}) {
  return new InputEvent(EventType.POINTER_MOVE, {
    pointerId: id, x: 0, y: 0, type: "pen", button: 0,
    pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
    width: 1, height: 1, isPrimary: true,
    ...options,
  });
}

function penUp(id) {
  return new InputEvent(EventType.POINTER_UP, {
    pointerId: id, x: 0, y: 0, type: "pen", button: 0,
    pressure: 0, isPrimary: true,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("Stylus", () => {
  it("extends Device and has correct type", () => {
    const pm = new PointerManager();
    const s = new Stylus(pm);
    assert.strictEqual(s.type, Stylus);
  });

  it("starts inactive", () => {
    const pm = new PointerManager();
    const s = new Stylus(pm);
    assert.strictEqual(s.active, false);
  });

  it("is active when pen pointer exists", () => {
    const pm = new PointerManager();
    pm.update(queueWith(penDown(1)));
    const s = new Stylus(pm);
    assert.strictEqual(s.active, true);
  });

  it("reports position", () => {
    const pm = new PointerManager();
    pm.update(queueWith(penDown(1, { x: 150, y: 300 })));
    const s = new Stylus(pm);
    assert.strictEqual(s.position.x, 150);
    assert.strictEqual(s.position.y, 300);
  });

  it("reports pressure", () => {
    const pm = new PointerManager();
    pm.update(queueWith(penDown(1, { pressure: 0.85 })));
    const s = new Stylus(pm);
    assert.strictEqual(s.pressure, 0.85);
  });

  it("reports tilt", () => {
    const pm = new PointerManager();
    pm.update(queueWith(penDown(1, { tiltX: 15, tiltY: 30 })));
    const s = new Stylus(pm);
    assert.strictEqual(s.tilt.x, 15);
    assert.strictEqual(s.tilt.y, 30);
  });

  it("reports twist", () => {
    const pm = new PointerManager();
    pm.update(queueWith(penDown(1, { twist: 45 })));
    const s = new Stylus(pm);
    assert.strictEqual(s.twist, 45);
  });

  it("reports eraser", () => {
    const pm = new PointerManager();
    pm.update(queueWith(penDown(1, { isEraser: true })));
    const s = new Stylus(pm);
    assert.strictEqual(s.isEraser, true);
  });

  it("isEraser is false by default", () => {
    const pm = new PointerManager();
    pm.update(queueWith(penDown(1)));
    const s = new Stylus(pm);
    assert.strictEqual(s.isEraser, false);
  });

  it("becomes inactive after pen up", () => {
    const pm = new PointerManager();
    pm.update(queueWith(penDown(1)));
    pm.update(queueWith(penUp(1)));
    const s = new Stylus(pm);
    assert.strictEqual(s.active, false);
  });

  it("returns default values when inactive", () => {
    const pm = new PointerManager();
    const s = new Stylus(pm);
    assert.deepStrictEqual(s.position, { x: 0, y: 0 });
    assert.strictEqual(s.pressure, 0);
    assert.deepStrictEqual(s.tilt, { x: 0, y: 0 });
    assert.strictEqual(s.twist, 0);
  });

  it("ignores mouse pointers", () => {
    const pm = new PointerManager();
    pm.update(queueWith(
      new InputEvent(EventType.POINTER_DOWN, {
        pointerId: 1, x: 0, y: 0, type: "mouse", button: 0,
        pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
        width: 1, height: 1, isPrimary: true,
      }),
    ));
    const s = new Stylus(pm);
    assert.strictEqual(s.active, false);
  });
});
