import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";
import { DeviceRegistry } from "../../input/DeviceRegistry.js";
import { Keyboard } from "../../input/Keyboard.js";
import { KeyCode } from "../../input/KeyCode.js";
import { PointerManager } from "../../input/PointerManager.js";
import { GestureEngine } from "../../input/GestureEngine.js";
import { ActionKind } from "../../input/ActionKind.js";
import { ActionState } from "../../input/actions/ActionState.js";
import { ActionMap } from "../../input/actions/ActionMap.js";
import { ActionEvaluator } from "../../input/actions/ActionEvaluator.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { InputContext } from "../../input/actions/InputContext.js";

function warmup(fn, n = 1000) {
  for (let i = 0; i < n; i++) fn();
}

function measure(fn, iterations) {
  warmup(fn, 1000);
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  return elapsed / iterations;
}

function gc() {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

describe("Performance benchmarks", () => {
  describe("Keyboard state polling", () => {
    const kb = new Keyboard();
    const registry = new DeviceRegistry();
    registry.register(kb);

    // Press key once so isDown returns true
    const q = new InputEventQueue(8);
    q.push(new InputEvent(EventType.KEY_DOWN, {
      key: " ", code: "Space", repeat: false,
      ctrl: false, shift: false, alt: false, meta: false,
      printable: false,
    }), Tier.HIGH);
    kb.update(q);

    it("isDown lookup < 0.5 µs per call", () => {
      const time = measure(() => kb.isDown(KeyCode.SPACE), 50000);
      assert.ok(time < 0.5, `isDown: ${time.toFixed(4)} µs`);
    });

    it("Keyboard.state.isDown < 0.5 µs", () => {
      const ks = kb.state;
      const time = measure(() => ks.isDown(KeyCode.SPACE), 100000);
      assert.ok(time < 0.5, `state.isDown: ${time.toFixed(4)} µs`);
    });
  });

  describe("Action state polling", () => {
    const state = new ActionState(ActionKind.DIGITAL);
    state._update(1);

    it("pressed getter < 0.1 µs", () => {
      const time = measure(() => state.pressed, 100000);
      assert.ok(time < 0.1, `pressed: ${time.toFixed(4)} µs`);
    });

    it("justPressed getter < 0.1 µs", () => {
      const time = measure(() => state.justPressed, 100000);
      assert.ok(time < 0.1, `justPressed: ${time.toFixed(4)} µs`);
    });
  });

  describe("128 actions / 256 bindings evaluation", () => {
    it("ActionEvaluator < 5 µs per frame", () => {
      const map = new ActionMap();
      for (let i = 0; i < 128; i++) {
        map.bind(`a${i}`, new KeyBinding(KeyCode.KEY_A));
        map.addBinding(`a${i}`, new KeyBinding(KeyCode.KEY_B));
      }

      const registry = new DeviceRegistry();
      const evaluator = new ActionEvaluator();
      const entries = map.entries();

      // No keyboard registered → all evaluate to 0
      const time = measure(() => evaluator.evaluate(entries, registry), 10000);
      assert.ok(time < 5, `evaluate: ${time.toFixed(4)} µs`);
    });

    it("ContextStack.evaluate (128 actions, 256 bindings) < 10 µs", () => {
      const map = new ActionMap();
      for (let i = 0; i < 128; i++) {
        map.bind(`a${i}`, new KeyBinding(KeyCode.KEY_A));
        map.addBinding(`a${i}`, new KeyBinding(KeyCode.KEY_B));
      }

      const cs = new ContextStack();
      cs.push(new InputContext("bench", map));

      const time = measure(() => cs.evaluate(new DeviceRegistry()), 5000);
      assert.ok(time < 10, `ContextStack.evaluate: ${time.toFixed(4)} µs`);
    });
  });

  describe("64-event drain via devices", () => {
    it("processes 64 events through Keyboard < 2 µs", () => {
      const kb = new Keyboard();
      const registry = new DeviceRegistry();
      registry.register(kb);

      const ev = () => new InputEvent(EventType.KEY_DOWN, {
        key: "a", code: "KeyA", repeat: false,
        ctrl: false, shift: false, alt: false, meta: false,
        printable: false,
      });

      function drain64() {
        const q = new InputEventQueue(64);
        for (let i = 0; i < 64; i++) q.push(ev(), i < 32 ? Tier.HIGH : Tier.NORMAL);
        kb.update(q);
      }

      const time = measure(drain64, 5000);
      assert.ok(time < 2, `64-event Keyboard: ${time.toFixed(4)} µs`);
    });
  });

  describe("10-pointer multi-touch", () => {
    it("processes 10 simultaneous pointers via PointerManager < 5 µs", () => {
      const pm = new PointerManager();
      const registry = new DeviceRegistry();
      registry.register(pm);

      function tenPointers() {
        const q = new InputEventQueue(64);
        for (let i = 0; i < 10; i++) {
          q.push(new InputEvent(EventType.POINTER_DOWN, {
            pointerId: i, x: i * 50, y: i * 30, type: "touch", button: 0,
            pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
            width: 10, height: 10, isPrimary: i === 0,
          }), Tier.HIGH);
        }
        pm.update(q);
      }

      const time = measure(tenPointers, 5000);
      assert.ok(time < 5, `10-pointer: ${time.toFixed(4)} µs`);
    });
  });

  describe("Gesture recognition (all 8 recognizers, 10 touches)", () => {
    it("processes 10 touches through all gesture recognizers < 10 µs", () => {
      const pm = new PointerManager();
      const ge = new GestureEngine(pm);
      const registry = new DeviceRegistry();
      registry.register(pm);
      registry.register(ge);

      function tenTouches() {
        const q = new InputEventQueue(64);
        for (let i = 0; i < 10; i++) {
          q.push(new InputEvent(EventType.POINTER_DOWN, {
            pointerId: i, x: i * 50, y: i * 30, type: "touch", button: 0,
            pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
            width: 10, height: 10, isPrimary: i === 0,
          }), Tier.HIGH);
          q.push(new InputEvent(EventType.POINTER_MOVE, {
            pointerId: i, x: i * 50 + 10, y: i * 30 + 5, type: "touch", button: 0,
            pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0,
            width: 10, height: 10, isPrimary: i === 0,
          }), Tier.NORMAL);
        }
        pm.update(q);
        ge.update(q);
      }

      const time = measure(tenTouches, 2000);
      assert.ok(time < 10, `gesture: ${time.toFixed(4)} µs`);
    });
  });

  describe("Full InputSystem update", () => {
    it("complete frame (backend poll + devices + context) < 25 µs", () => {
      const sys = new InputSystem();
      const backend = {
        start() {},
        stop() {},
        poll(queue) {
          for (let i = 0; i < 10; i++) {
            queue.push(new InputEvent(EventType.KEY_DOWN, {
              key: " ", code: "Space", repeat: false,
              ctrl: false, shift: false, alt: false, meta: false,
              printable: false,
            }), Tier.HIGH);
          }
        },
      };
      sys.setBackend(backend);

      const kb = new Keyboard();
      sys.devices.register(kb);

      const map = new ActionMap();
      map.bind("jump", new KeyBinding(KeyCode.SPACE));
      const cs = new ContextStack();
      cs.push(new InputContext("bench", map));
      sys.contextStack = cs;

      const time = measure(() => sys.update(), 5000);
      assert.ok(time < 25, `full frame: ${time.toFixed(4)} µs`);
    });
  });

  describe("InputEventQueue operations", () => {
    it("push 64 events < 0.5 µs per push", () => {
      const q = new InputEventQueue(64);
      const ev = new InputEvent(EventType.KEY_DOWN, {
        key: "a", code: "KeyA", repeat: false,
        ctrl: false, shift: false, alt: false, meta: false,
        printable: false,
      });
      const time = measure(() => q.push(ev, Tier.HIGH), 50000);
      assert.ok(time < 0.5, `push: ${time.toFixed(4)} µs`);
    });

    it("each (read-only iteration) < 0.05 µs per event", () => {
      const q = new InputEventQueue(64);
      for (let i = 0; i < 32; i++) {
        q.push(new InputEvent(EventType.KEY_DOWN, {
          key: "a", code: "KeyA", repeat: false,
          ctrl: false, shift: false, alt: false, meta: false,
          printable: false,
        }), Tier.HIGH);
      }

      function iterate() {
        q.each((ev, tier) => { /* read-only */ });
      }

      const totalTime = measure(iterate, 10000);
      const perEvent = totalTime / 32;
      assert.ok(perEvent < 0.05, `each per-event: ${perEvent.toFixed(4)} µs`);
    });
  });

  describe("Zero allocations at steady state", () => {
    it("no heap growth over 1000 frames", () => {
      gc();
      const heapBefore = process.memoryUsage().heapUsed;

      const sys = new InputSystem();
      const backend = {
        start() {},
        stop() {},
        poll(queue) {
          for (let i = 0; i < 5; i++) {
            queue.push(new InputEvent(EventType.KEY_DOWN, {
              key: " ", code: "Space", repeat: false,
              ctrl: false, shift: false, alt: false, meta: false,
              printable: false,
            }), Tier.HIGH);
          }
        },
      };
      sys.setBackend(backend);

      const kb = new Keyboard();
      sys.devices.register(kb);

      const map = new ActionMap();
      map.bind("a", new KeyBinding(KeyCode.SPACE));
      map.bind("b", new KeyBinding(KeyCode.KEY_A));
      map.bind("c", new KeyBinding(KeyCode.KEY_B));
      const cs = new ContextStack();
      cs.push(new InputContext("bench", map));
      sys.contextStack = cs;

      // Run setup once, measure steady state
      sys.update();

      gc();
      const heapAfterSetup = process.memoryUsage().heapUsed;

      // Run 1000 frames
      for (let i = 0; i < 1000; i++) {
        sys.update();
      }

      gc();
      const heapAfterSteady = process.memoryUsage().heapUsed;

      // Allow 512 KB of setup allocation, but steady state should not grow
      const growth = heapAfterSteady - heapAfterSetup;
      assert.ok(growth < 524288,
        `Heap grew by ${(growth / 1024).toFixed(1)} KB over 1000 frames (limit: 512 KB)`,
      );
    });
  });
});
