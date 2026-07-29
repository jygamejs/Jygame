import { PointerManager } from "../PointerManager.js";
import { CoordinateSystem } from "../CoordinateSystem.js";

export class PointerFacade {
  constructor(inputSystem) {
    this._system = inputSystem;
  }

  get _pm() {
    return this._system ? this._system.devices.get(PointerManager) : null;
  }

  get _cs() {
    return this._system ? this._system.coordinateSystem : null;
  }

  _getPrimary() {
    const pm = this._pm;
    if (!pm) return null;
    const ptrs = pm.getPointers();
    return ptrs.length > 0 ? ptrs[0] : null;
  }

  get x() {
    const ptr = this._getPrimary();
    return ptr ? ptr.position.x : 0;
  }

  get y() {
    const ptr = this._getPrimary();
    return ptr ? ptr.position.y : 0;
  }

  get worldX() {
    const ptr = this._getPrimary();
    if (!ptr) return 0;
    const cs = this._cs;
    if (cs) {
      const world = cs.toWorld(ptr.position);
      return world.x;
    }
    return ptr.position.x;
  }

  get worldY() {
    const ptr = this._getPrimary();
    if (!ptr) return 0;
    const cs = this._cs;
    if (cs) {
      const world = cs.toWorld(ptr.position);
      return world.y;
    }
    return ptr.position.y;
  }

  get down() {
    const ptr = this._getPrimary();
    return ptr ? ptr.isDown : false;
  }

  get justPressed() {
    const ptr = this._getPrimary();
    return ptr ? ptr.justDown : false;
  }

  get justReleased() {
    const ptr = this._getPrimary();
    return ptr ? ptr.justUp : false;
  }

  get deltaX() {
    const ptr = this._getPrimary();
    return ptr ? ptr.delta.x : 0;
  }

  get deltaY() {
    const ptr = this._getPrimary();
    return ptr ? ptr.delta.y : 0;
  }

  get pressure() {
    const ptr = this._getPrimary();
    return ptr ? ptr.pressure : 0;
  }
}
