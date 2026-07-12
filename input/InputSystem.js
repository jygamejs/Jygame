import { DeviceRegistry } from "./DeviceRegistry.js";
import { InputEventQueue } from "./InputEventQueue.js";

export class InputSystem {
  constructor(options = {}) {
    this._devices = new DeviceRegistry();
    this._events = new InputEventQueue(options.queueCapacity || 64);
    this._backend = null;
    this._actions = null;
  }

  get devices() { return this._devices; }
  get events() { return this._events; }
  get backend() { return this._backend; }
  get actions() { return this._actions; }

  set actions(acts) { this._actions = acts; }

  setBackend(backend) {
    if (this._backend) this._backend.stop();
    this._backend = backend;
    if (backend) backend.start();
  }

  update() {
    if (this._backend) {
      this._backend.poll(this._events);
    }
    this._devices.update();
  }
}
