import { Device } from "./Device.js";
import { Pointer } from "./Pointer.js";

export class Stylus extends Device {
  constructor(pointerManager) {
    super();
    this._pm = pointerManager;
  }

  get type() { return Stylus; }

  get _penPointer() {
    const all = this._pm.getPointers();
    for (const p of all) {
      if (p.type === "pen") return p;
    }
    return null;
  }

  get active() { return this._penPointer !== null; }

  get position() {
    const p = this._penPointer;
    return p ? p.position : { x: 0, y: 0 };
  }

  get pressure() {
    const p = this._penPointer;
    return p ? p.pressure : 0;
  }

  get tilt() {
    const p = this._penPointer;
    return p ? p.tilt : { x: 0, y: 0 };
  }

  get twist() {
    const p = this._penPointer;
    return p ? p.twist : 0;
  }

  get isEraser() {
    const p = this._penPointer;
    return p ? p.isEraser : false;
  }

  update(queue) {
    // Stylus derives state from PointerManager; no direct event processing.
  }
}
