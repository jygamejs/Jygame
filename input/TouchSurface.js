import { Device } from "./Device.js";
import { Pointer } from "./Pointer.js";

export class TouchSurface extends Device {
  constructor(pointerManager) {
    super();
    this._pm = pointerManager;
  }

  get type() { return TouchSurface; }

  get contacts() {
    const result = [];
    this._pm.getPointers().forEach(p => {
      if (p.type === "touch") result.push(p);
    });
    return result;
  }

  get contactCount() {
    let count = 0;
    this._pm.getPointers().forEach(p => {
      if (p.type === "touch") count++;
    });
    return count;
  }

  get primary() {
    const all = this._pm.getPointers();
    for (const p of all) {
      if (p.type === "touch") return p;
    }
    return null;
  }

  update(queue) {
    // TouchSurface derives state from PointerManager; no direct event processing.
    // Gesture polling methods (isActive, last) will be added with GestureEngine.
  }
}
