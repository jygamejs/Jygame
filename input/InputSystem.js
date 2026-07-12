import { DeviceRegistry } from "./DeviceRegistry.js";
import { InputEventQueue } from "./InputEventQueue.js";

export class InputSystem {
  constructor(options = {}) {
    this._devices = new DeviceRegistry();
    this._events = new InputEventQueue(options.queueCapacity || 64);
    this._backend = null;
    this._contextStack = null;
    this._coordinateSystem = null;
    this._consumers = [];
  }

  get devices() { return this._devices; }
  get events() { return this._events; }
  get backend() { return this._backend; }
  get contextStack() { return this._contextStack; }
  get coordinateSystem() { return this._coordinateSystem; }

  set contextStack(cs) { this._contextStack = cs; }
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

  snapshot() {
    if (this._contextStack) {
      this._contextStack.snapshot();
    }
  }

  update() {
    this.snapshot();

    if (this._backend) {
      this._backend.poll(this._events);
    }

    if (this._consumers.length > 0) {
      this._events.each(event => {
        for (const fn of this._consumers) fn(event);
      });
    }

    this._devices.update(this._events);

    if (this._contextStack) {
      this._contextStack.evaluate(this._devices);
    }

    this._events.clear();
  }
}
