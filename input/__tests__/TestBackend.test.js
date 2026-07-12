import { describe, it } from "node:test";
import * as assert from "node:assert";
import { TestBackend } from "../TestBackend.js";
import { InputEventQueue } from "../InputEventQueue.js";
import { EventType } from "../EventType.js";

describe("TestBackend", () => {
  it("has name 'test'", () => {
    const tb = new TestBackend();
    assert.strictEqual(tb.name, "test");
  });

  it("start and stop are no-ops", () => {
    const tb = new TestBackend();
    tb.start();
    tb.stop();
  });
});

describe("TestBackend key injection", () => {
  it("keyDown queues a KEY_DOWN event", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.keyDown("a");
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, EventType.KEY_DOWN);
    assert.strictEqual(events[0].data.key, "a");
    assert.strictEqual(events[0].data.printable, true);
  });

  it("keyUp queues a KEY_UP event", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.keyUp("Space");
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, EventType.KEY_UP);
    assert.strictEqual(events[0].data.key, "Space");
  });

  it("keyDown with non-printable sets printable false", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.keyDown("ArrowUp");
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events[0].data.printable, false);
  });

  it("keyDown with repeat flag", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.keyDown("a", { repeat: true });
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events[0].data.repeat, true);
  });

  it("keyDown with modifiers", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.keyDown("c", { ctrl: true });
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events[0].data.ctrl, true);
  });

  it("chained calls queue multiple events", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.keyDown("a").keyDown("b").keyDown("c");
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e.data.key));
    assert.deepStrictEqual(events, ["a", "b", "c"]);
  });
});

describe("TestBackend pointer injection", () => {
  it("pointerDown queues a POINTER_DOWN event", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.pointerDown({ pointerId: 5, x: 100, y: 200, type: "touch" });
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, EventType.POINTER_DOWN);
    assert.strictEqual(events[0].data.pointerId, 5);
    assert.strictEqual(events[0].data.x, 100);
    assert.strictEqual(events[0].data.y, 200);
    assert.strictEqual(events[0].data.type, "touch");
  });

  it("pointerDown uses defaults", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.pointerDown();
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events[0].data.pointerId, 0);
    assert.strictEqual(events[0].data.x, 0);
    assert.strictEqual(events[0].data.type, "mouse");
  });

  it("pointerMove queues a POINTER_MOVE event", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.pointerMove({ pointerId: 1, x: 50, y: 60 });
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, EventType.POINTER_MOVE);
  });

  it("pointerUp queues a POINTER_UP event", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.pointerUp({ pointerId: 1, x: 100, y: 100 });
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, EventType.POINTER_UP);
  });

  it("full click cycle: down → move → up (tier order preserved)", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.pointerDown({ pointerId: 1, x: 0, y: 0 });   // Tier.HIGH
    tb.pointerMove({ pointerId: 1, x: 10, y: 10 });  // Tier.LOW
    tb.pointerUp({ pointerId: 1, x: 10, y: 10 });    // Tier.HIGH
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e.type));
    // HIGH drains first (pointerDown, pointerUp), then LOW (pointerMove)
    assert.deepStrictEqual(events, [
      EventType.POINTER_DOWN,
      EventType.POINTER_UP,
      EventType.POINTER_MOVE,
    ]);
  });
});

describe("TestBackend wheel injection", () => {
  it("wheel queues a WHEEL event", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.wheel({ deltaY: 120 });
    tb.poll(queue);
    const events = [];
    queue.drain(e => events.push(e));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, EventType.WHEEL);
    assert.strictEqual(events[0].data.deltaY, 120);
  });
});

describe("TestBackend clear", () => {
  it("clear removes queued events", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue();
    tb.keyDown("a").clear();
    tb.poll(queue);
    assert.strictEqual(queue.length, 0);
  });
});

describe("TestBackend tier assignment", () => {
  it("keyboard events use HIGH tier", () => {
    const tb = new TestBackend();
    const queue = new InputEventQueue(64);
    tb.keyDown("a");
    tb.poll(queue);
    // After draining HIGH, the event should be gone
    let count = 0;
    queue.drain(() => count++);
    assert.strictEqual(count, 1);
  });
});
