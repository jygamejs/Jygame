import { DeviceRegistry } from "./DeviceRegistry.js";
import { InputEventQueue } from "./InputEventQueue.js";

export class InputSystem {
  constructor(options = {}) {
    this._devices = new DeviceRegistry();
    this._events = new InputEventQueue(options.queueCapacity || 64);
    this._backend = null;
    this._contextStack = null;
    this._coordinateSystem = null;
  }

  get devices() { return this._devices; }
  get events() { return this._events; }
  get backend() { return this._backend; }
  get contextStack() { return this._contextStack; }
  get coordinateSystem() { return this._coordinateSystem; }

  set contextStack(cs) { this._contextStack = cs; }
  set coordinateSystem(cs) { this._coordinateSystem = cs; }

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

    this._devices.update(this._events);

    if (this._contextStack) {
      this._contextStack.evaluate(this._devices);
    }

    this._events.clear();
  }
}
