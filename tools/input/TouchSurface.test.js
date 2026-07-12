import { describe, it } from "node:test";
import * as assert from "node:assert";
import { TouchSurface } from "../../input/TouchSurface.js";
import { PointerManager } from "../../input/PointerManager.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";

function touchDown(id, x, y) {
  return new InputEvent(EventType.POINTER_DOWN, {
    pointerId: id, x, y, type: "touch", button: 0,
    pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
    width: 10, height: 12, isPrimary: id === 0,
  });
}

function touchUp(id) {
  return new InputEvent(EventType.POINTER_UP, {
    pointerId: id, x: 0, y: 0, type: "touch", button: 0,
    pressure: 0, isPrimary: false,
  });
}

function mouseDown(id, x, y) {
  return new InputEvent(EventType.POINTER_DOWN, {
    pointerId: id, x, y, type: "mouse", button: 0,
    pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
    width: 1, height: 1, isPrimary: true,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("TouchSurface", () => {
  it("extends Device and has correct type", () => {
    const pm = new PointerManager();
    const ts = new TouchSurface(pm);
    assert.strictEqual(ts.type, TouchSurface);
  });

  it("starts with no contacts", () => {
    const pm = new PointerManager();
    const ts = new TouchSurface(pm);
    assert.strictEqual(ts.contactCount, 0);
    assert.strictEqual(ts.primary, null);
    assert.deepStrictEqual(ts.contacts, []);
  });

  it("detects single touch contact", () => {
    const pm = new PointerManager();
    pm.update(queueWith(touchDown(1, 100, 200)));
    const ts = new TouchSurface(pm);
    assert.strictEqual(ts.contactCount, 1);
    assert.strictEqual(ts.primary.position.x, 100);
  });

  it("filters out non-touch pointers", () => {
    const pm = new PointerManager();
    pm.update(queueWith(
      mouseDown(1, 0, 0),
      touchDown(2, 50, 60),
    ));
    const ts = new TouchSurface(pm);
    assert.strictEqual(ts.contactCount, 1);
  });

  it("detects multi-touch", () => {
    const pm = new PointerManager();
    pm.update(queueWith(
      touchDown(1, 10, 10),
      touchDown(2, 20, 20),
      touchDown(3, 30, 30),
    ));
    const ts = new TouchSurface(pm);
    assert.strictEqual(ts.contactCount, 3);
    assert.strictEqual(ts.contacts.length, 3);
  });

  it("updates after touch removal", () => {
    const pm = new PointerManager();
    pm.update(queueWith(touchDown(1, 10, 10), touchDown(2, 20, 20)));
    pm.update(queueWith(touchUp(1)));
    const ts = new TouchSurface(pm);
    assert.strictEqual(ts.contactCount, 1);
    assert.strictEqual(ts.primary.position.x, 20);
  });

  it("primary is null when no touch contacts", () => {
    const pm = new PointerManager();
    const ts = new TouchSurface(pm);
    assert.strictEqual(ts.primary, null);
  });

  it("each contact is a Pointer instance", () => {
    const pm = new PointerManager();
    pm.update(queueWith(touchDown(1, 5, 10)));
    const ts = new TouchSurface(pm);
    for (const c of ts.contacts) {
      assert.ok(c.id !== undefined);
      assert.strictEqual(c.type, "touch");
    }
  });
});
