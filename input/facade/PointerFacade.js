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
    if (!ptr) return 0;
    const cs = this._cs;
    if (cs) return cs.toViewport(ptr.position).x;
    return ptr.position.x;
  }

  get y() {
    const ptr = this._getPrimary();
    if (!ptr) return 0;
    const cs = this._cs;
    if (cs) return cs.toViewport(ptr.position).y;
    return ptr.position.y;
  }

  get worldX() {
    const ptr = this._getPrimary();
    if (!ptr) return 0;
    const cs = this._cs;
    if (cs) {
      const world = cs.toWorld(cs.toViewport(ptr.position));
      return world.x;
    }
    return ptr.position.x;
  }

  get worldY() {
    const ptr = this._getPrimary();
    if (!ptr) return 0;
    const cs = this._cs;
    if (cs) {
      const world = cs.toWorld(cs.toViewport(ptr.position));
      return world.y;
    }
    return ptr.position.y;
  }

  get down() {
    const ptr = this._getPrimary();
    return ptr ? ptr.isDown : false;
  }

  get pressed() {
    const ptr = this._getPrimary();
    return ptr ? ptr.justDown : false;
  }

  get released() {
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
