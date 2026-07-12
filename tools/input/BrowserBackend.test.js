import { describe, it, mock } from "node:test";
import * as assert from "node:assert";
import { BrowserBackend } from "../../input/BrowserBackend.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { EventType } from "../../input/EventType.js";

function createMockElement() {
  const listeners = {};
  return {
    style: { touchAction: "" },
    addEventListener(event, fn, opts) {
      listeners[event] = { fn, opts };
    },
    removeEventListener(event, fn) {
      if (listeners[event] && listeners[event].fn === fn) {
        delete listeners[event];
      }
    },
    _listeners: listeners,
    _dispatch(event, data) {
      if (listeners[event]) {
        listeners[event].fn(data);
      }
    },
  };
}

function createMockDocument() {
  const listeners = {};
  return {
    addEventListener(event, fn) {
      listeners[event] = fn;
    },
    removeEventListener(event, fn) {
      if (listeners[event] === fn) delete listeners[event];
    },
    _listeners: listeners,
  };
}

describe("BrowserBackend", () => {
  it("has name 'browser'", () => {
    const el = createMockElement();
    const bb = new BrowserBackend(el);
    assert.strictEqual(bb.name, "browser");
  });

  it("start attaches DOM listeners", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;
    try {
      const bb = new BrowserBackend(el);
      bb.start();
      assert.ok(el._listeners.pointerdown);
      assert.ok(el._listeners.pointermove);
      assert.ok(el._listeners.pointerup);
      assert.ok(el._listeners.pointercancel);
      assert.ok(el._listeners.wheel);
      assert.strictEqual(el.style.touchAction, "none");
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("start is idempotent", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;
    try {
      const bb = new BrowserBackend(el);
      bb.start();
      const count1 = Object.keys(el._listeners).length;
      bb.start();
      const count2 = Object.keys(el._listeners).length;
      assert.strictEqual(count1, count2);
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("stop removes DOM listeners", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;
    try {
      const bb = new BrowserBackend(el);
      bb.start();
      bb.stop();
      assert.strictEqual(Object.keys(el._listeners).length, 0);
      assert.strictEqual(el.style.touchAction, "");
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("stop is idempotent when not started", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;
    try {
      const bb = new BrowserBackend(el);
      bb.stop();
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("poll captures the queue reference", () => {
    const el = createMockElement();
    const bb = new BrowserBackend(el);
    const queue = new InputEventQueue();
    bb.poll(queue);
    assert.strictEqual(bb.__eventQueue, queue);
  });
});

describe("BrowserBackend event dispatch", () => {
  it("dispatches KEY_DOWN on keydown", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;

    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();

      doc._listeners.keydown({
        key: "a", code: "KeyA", repeat: false,
        ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
        preventDefault() {},
      });

      const events = [];
      queue.drain(e => events.push({ type: e.type, key: e.data.key }));
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, EventType.KEY_DOWN);
      assert.strictEqual(events[0].key, "a");
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("dispatches KEY_UP on keyup", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;

    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();

      doc._listeners.keyup({
        key: "Enter", code: "Enter",
        ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
      });

      const events = [];
      queue.drain(e => events.push({ type: e.type, key: e.data.key }));
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, EventType.KEY_UP);
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("dispatches POINTER_DOWN on pointerdown", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;

    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();

      el._dispatch("pointerdown", {
        pointerId: 1, clientX: 100, clientY: 200,
        pointerType: "mouse", pressure: 0.5,
        tiltX: 0, tiltY: 0, twist: 0,
        width: 1, height: 1, isPrimary: true,
        cancelable: true, preventDefault() {},
      });

      const events = [];
      queue.drain(e => events.push({ type: e.type, x: e.data.x, y: e.data.y }));
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, EventType.POINTER_DOWN);
      assert.strictEqual(events[0].x, 100);
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("dispatches POINTER_MOVE on pointermove", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;

    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();

      el._dispatch("pointermove", {
        pointerId: 1, clientX: 150, clientY: 250,
        pointerType: "mouse", pressure: 0.5,
        tiltX: 0, tiltY: 0, twist: 0,
        width: 1, height: 1, isPrimary: true,
        cancelable: true, preventDefault() {},
      });

      const events = [];
      queue.drain(e => events.push({ type: e.type, x: e.data.x }));
      assert.strictEqual(events[0].type, EventType.POINTER_MOVE);
      assert.strictEqual(events[0].x, 150);
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("dispatches POINTER_UP on pointerup", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;

    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();

      el._dispatch("pointerup", {
        pointerId: 1, clientX: 100, clientY: 200,
        pointerType: "mouse", pressure: 0,
        isPrimary: true,
        cancelable: true, preventDefault() {},
      });

      const events = [];
      queue.drain(e => events.push({ type: e.type }));
      assert.strictEqual(events[0].type, EventType.POINTER_UP);
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("dispatches WHEEL on wheel", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;

    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();

      el._dispatch("wheel", {
        clientX: 300, clientY: 400,
        deltaX: 0, deltaY: 120, deltaZ: 0,
        deltaMode: 0,
        cancelable: true, preventDefault() {},
      });

      const events = [];
      queue.drain(e => events.push({ type: e.type, dy: e.data.deltaY }));
      assert.strictEqual(events[0].type, EventType.WHEEL);
      assert.strictEqual(events[0].dy, 120);
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("pointer cancel maps to POINTER_UP with cancelled flag", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;

    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();

      el._dispatch("pointercancel", {
        pointerId: 1, clientX: 0, clientY: 0,
        pointerType: "touch",
      });

      const events = [];
      queue.drain(e => events.push({ type: e.type, cancelled: e.data.cancelled }));
      assert.strictEqual(events[0].type, EventType.POINTER_UP);
      assert.strictEqual(events[0].cancelled, true);
    } finally {
      globalThis.document = origDoc;
    }
  });

  it("prevents default for arrow keys and space", () => {
    const el = createMockElement();
    const doc = createMockDocument();
    const origDoc = globalThis.document;
    globalThis.document = doc;

    try {
      const bb = new BrowserBackend(el);
      const queue = new InputEventQueue();
      bb.poll(queue);
      bb.start();

      let prevented = false;
      doc._listeners.keydown({
        key: "ArrowUp", code: "ArrowUp", repeat: false,
        ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
        preventDefault() { prevented = true; },
      });

      assert.ok(prevented);
    } finally {
      globalThis.document = origDoc;
    }
  });
});
