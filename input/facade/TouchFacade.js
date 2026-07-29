import { PointerManager } from "../PointerManager.js";

export class TouchFacade {
  constructor(inputSystem) {
    this._system = inputSystem;
  }

  get _pm() {
    return this._system ? this._system.devices.get(PointerManager) : null;
  }

  _touchPointers() {
    const pm = this._pm;
    if (!pm) return [];
    return pm.getPointers().filter(p => p.type === "touch");
  }

  get count() {
    return this._touchPointers().length;
  }

  get contacts() {
    return this._touchPointers().map(p => ({
      id: p.id,
      x: p.position.x,
      y: p.position.y,
      down: p.isDown,
      justPressed: p.justDown,
      justReleased: p.justUp,
      pressure: p.pressure,
    }));
  }

  get primary() {
    const touches = this._touchPointers();
    if (touches.length === 0) return null;
    const p = touches[0];
    return {
      id: p.id,
      x: p.position.x,
      y: p.position.y,
      down: p.isDown,
      justPressed: p.justDown,
      justReleased: p.justUp,
      pressure: p.pressure,
    };
  }
}
