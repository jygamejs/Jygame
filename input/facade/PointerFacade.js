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
    const pm = this._pm;
    const ptr = this._getPrimary();
    const cs = this._cs;
    if (ptr) {
      if (cs) return cs.toViewport(ptr.position).x;
      return ptr.position.x;
    }
    if (!pm) return 0;
    const pos = pm.position;
    if (cs) return cs.toViewport(pos).x;
    return pos.x;
  }

  get y() {
    const pm = this._pm;
    const ptr = this._getPrimary();
    const cs = this._cs;
    if (ptr) {
      if (cs) return cs.toViewport(ptr.position).y;
      return ptr.position.y;
    }
    if (!pm) return 0;
    const pos = pm.position;
    if (cs) return cs.toViewport(pos).y;
    return pos.y;
  }

  get worldX() {
    const pm = this._pm;
    const ptr = this._getPrimary();
    const cs = this._cs;
    if (ptr) {
      if (cs) {
        const world = cs.toWorld(cs.toViewport(ptr.position));
        return world.x;
      }
      return ptr.position.x;
    }
    if (!pm) return 0;
    const pos = pm.position;
    if (cs) {
      const world = cs.toWorld(cs.toViewport(pos));
      return world.x;
    }
    return pos.x;
  }

  get worldY() {
    const pm = this._pm;
    const ptr = this._getPrimary();
    const cs = this._cs;
    if (ptr) {
      if (cs) {
        const world = cs.toWorld(cs.toViewport(ptr.position));
        return world.y;
      }
      return ptr.position.y;
    }
    if (!pm) return 0;
    const pos = pm.position;
    if (cs) {
      const world = cs.toWorld(cs.toViewport(pos));
      return world.y;
    }
    return pos.y;
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

  get hasPosition() {
    const pm = this._pm;
    return pm ? pm.hasPosition : false;
  }
}
