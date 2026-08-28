import { DeviceRegistry } from "./DeviceRegistry.js";
import { InputEventQueue } from "./InputEventQueue.js";
import { HistoryBuffer } from "./HistoryBuffer.js";
import { EventType } from "./EventType.js";
import { PointerManager } from "./PointerManager.js";
import { CursorManager } from "./CursorManager.js";
import { PointerLockManager } from "./PointerLockManager.js";

export class InputSystem {
  constructor(options = {}) {
    this._devices = new DeviceRegistry();
    this._events = new InputEventQueue(options.queueCapacity || 64);
    this._snapshotEvents = Object.freeze([]);
    this._history = new HistoryBuffer(options.historyCapacity || 128);
    this._tickId = 0;
    this._backend = null;
    this._contextStack = null;
    this._coordinateSystem = null;
    this._consumers = [];
    // Per-frame event tallies, reported by Game into the input.* diagnostics
    // metrics. Counted here rather than pushed to Diagnostics directly so the
    // input layer keeps no dependency on the debug layer.
    this._keyEventCount = 0;
    this._pointerEventCount = 0;
    this._domElement = null;
    this._host = null;
    this._cursorManager = new CursorManager(this);
    this._pointerLockManager = new PointerLockManager(this, this._cursorManager);
  }

  get keyEventCount() { return this._keyEventCount; }
  get pointerEventCount() { return this._pointerEventCount; }

  get activePointerCount() {
    const pm = this._devices.get(PointerManager);
    if (!pm) return 0;
    const pointers = pm.getPointers();
    let n = 0;
    for (let i = 0; i < pointers.length; i++) {
      if (pointers[i].isDown) n++;
    }
    return n;
  }

  get devices() { return this._devices; }
  get events() { return this._events; }
  get eventSnapshot() { return this._snapshotEvents; }
  get history() { return this._history; }
  get historySnapshot() { return this._history.snapshot(); }
  get tickId() { return this._tickId; }
  get backend() { return this._backend; }
  get contextStack() { return this._contextStack; }
  get coordinateSystem() { return this._coordinateSystem; }
  get domElement() { return this._domElement; }
  set domElement(el) {
    this._domElement = el;
    if (this._cursorManager) this._cursorManager.setElement(el);
    if (this._pointerLockManager) this._pointerLockManager.setElement(el);
  }
  get host() { return this._host; }
  set host(h) {
    this._host = h;
    if (this._pointerLockManager) this._pointerLockManager.setHost(h);
  }
  get cursorManager() { return this._cursorManager; }
  get pointerLockManager() { return this._pointerLockManager; }

  set contextStack(cs) {
    this._contextStack = cs;
    // The stack needs live device state so push() can prime a new context
    // against inputs that are already held.
    if (cs) cs.devices = this._devices;
  }
  set coordinateSystem(cs) { this._coordinateSystem = cs; }

  addInputConsumer(fn) {
    if (!this._consumers.includes(fn)) {
      this._consumers.push(fn);
    }
  }

  removeInputConsumer(fn) {
    const idx = this._consumers.indexOf(fn);
    if (idx !== -1) this._consumers.splice(idx, 1);
  }

  setBackend(backend) {
    if (this._backend) this._backend.stop();
    this._backend = backend;
    if (backend) backend.start();
  }

  // Opens a new sampling window across the whole input stack: action states
  // and device edge state collapse together. Called once at the top of
  // update(), and again by the game loop after each fixed tick so that a
  // single press reads as "just pressed" in exactly one tick — at both the
  // action level (Input.pressed) and the device level (Input.pointer.justPressed).
  snapshot() {
    this._devices.snapshot();
    if (this._contextStack) {
      this._contextStack.snapshot();
    }
  }

  _countEvents() {
    let keys = 0;
    let pointers = 0;
    this._events.each((event) => {
      const t = event.type;
      if (t === EventType.KEY_DOWN || t === EventType.KEY_UP) keys++;
      else if (
        t === EventType.POINTER_DOWN ||
        t === EventType.POINTER_UP ||
        t === EventType.POINTER_MOVE
      ) pointers++;
    });
    this._keyEventCount = keys;
    this._pointerEventCount = pointers;
  }

  update() {
    this._tickId++;
    this.snapshot();

    if (this._backend) {
      this._backend.poll(this._events);
    }

    this._countEvents();

    if (this._consumers.length > 0) {
      this._events.each(event => {
        for (const fn of this._consumers) fn(event);
      });
    }

    this._devices.update(this._events);

    if (this._contextStack) {
      this._contextStack.evaluate(this._devices);
    }

    this._snapshotEvents = this._events.snapshot();
    this._history.pushAll(this._snapshotEvents);
    this._events.clear();
  }

  destroy() {
    if (this._pointerLockManager) this._pointerLockManager.destroy();
    if (this._cursorManager) this._cursorManager.destroy();
    if (this._backend) {
      try { this._backend.stop(); } catch {}
      this._backend = null;
    }
    this._domElement = null;
    this._host = null;
  }
}
