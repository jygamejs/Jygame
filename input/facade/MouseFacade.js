import { Mouse } from "../Mouse.js";
import { MouseButton } from "../MouseButton.js";
import { PointerManager } from "../PointerManager.js";

const BUTTON_NAME_TO_INDEX = {
  left: MouseButton.LEFT,
  right: MouseButton.RIGHT,
  middle: MouseButton.MIDDLE,
  back: MouseButton.BACK,
  forward: MouseButton.FORWARD,
  "0": MouseButton.LEFT,
  "1": MouseButton.MIDDLE,
  "2": MouseButton.RIGHT,
  "3": MouseButton.BACK,
  "4": MouseButton.FORWARD,
};

function resolveButtonName(name) {
  if (name == null) return null;
  if (typeof name === "number") {
    if (name >= 0 && name <= 4) return name;
    return null;
  }
  const key = String(name).toLowerCase();
  if (key in BUTTON_NAME_TO_INDEX) return BUTTON_NAME_TO_INDEX[key];
  // also accept MouseButton constants string like "LEFT"
  const upper = String(name).toUpperCase();
  if (upper === "LEFT") return MouseButton.LEFT;
  if (upper === "RIGHT") return MouseButton.RIGHT;
  if (upper === "MIDDLE") return MouseButton.MIDDLE;
  if (upper === "BACK") return MouseButton.BACK;
  if (upper === "FORWARD") return MouseButton.FORWARD;
  return null;
}

function makeButtonObject(facade, idx) {
  return {
    get down() { return facade.isDown(idx); },
    get pressed() { return facade.pressed(idx); },
    get released() { return facade.released(idx); },
    get index() { return idx; },
  };
}

export class MouseFacade {
  constructor(system, cursorManager = null, pointerLockManager = null) {
    this._system = system;
    this._cursor = cursorManager;
    this._pointerLock = pointerLockManager;
    // cache button objects
    this._left = makeButtonObject(this, MouseButton.LEFT);
    this._right = makeButtonObject(this, MouseButton.RIGHT);
    this._middle = makeButtonObject(this, MouseButton.MIDDLE);
    this._back = makeButtonObject(this, MouseButton.BACK);
    this._forward = makeButtonObject(this, MouseButton.FORWARD);
  }

  _attachSystem(system) {
    this._system = system;
  }

  setCursorManager(cm) { this._cursor = cm; }
  setPointerLockManager(pl) { this._pointerLock = pl; }

  get _mouse() {
    return this._system ? this._system.devices.get(Mouse) : null;
  }

  get _pm() {
    return this._system ? this._system.devices.get(PointerManager) : null;
  }

  get _cs() {
    return this._system ? this._system.coordinateSystem : null;
  }

  // position — mouse-specific, via Mouse device, through coordinate system
  get x() {
    const m = this._mouse;
    const cs = this._cs;
    if (!m) return 0;
    // hasPosition false still returns 0, but (0,0) is valid after hasPosition true
    const pos = m.position;
    if (cs) return cs.toViewport(pos).x;
    return pos.x;
  }

  get y() {
    const m = this._mouse;
    const cs = this._cs;
    if (!m) return 0;
    const pos = m.position;
    if (cs) return cs.toViewport(pos).y;
    return pos.y;
  }

  get worldX() {
    const m = this._mouse;
    const cs = this._cs;
    if (!m) return 0;
    const pos = m.position;
    if (cs) {
      const vp = cs.toViewport(pos);
      return cs.toWorld(vp).x;
    }
    return pos.x;
  }

  get worldY() {
    const m = this._mouse;
    const cs = this._cs;
    if (!m) return 0;
    const pos = m.position;
    if (cs) {
      const vp = cs.toViewport(pos);
      return cs.toWorld(vp).y;
    }
    return pos.y;
  }

  get hasPosition() {
    const m = this._mouse;
    return m ? m.hasPosition : false;
  }

  get deltaX() {
    const m = this._mouse;
    return m ? m.delta.x : 0;
  }

  get deltaY() {
    const m = this._mouse;
    return m ? m.delta.y : 0;
  }

  get wheel() {
    const m = this._mouse;
    return m ? m.wheel : 0;
  }

  get wheelX() {
    const m = this._mouse;
    return m ? m.wheelHorizontal : 0;
  }

  // generic button queries
  isDown(name) {
    const idx = resolveButtonName(name);
    if (idx == null) return false;
    const m = this._mouse;
    return m ? m.isDown(idx) : false;
  }

  pressed(name) {
    const idx = resolveButtonName(name);
    if (idx == null) return false;
    const m = this._mouse;
    return m ? m.justPressed(idx) : false;
  }

  released(name) {
    const idx = resolveButtonName(name);
    if (idx == null) return false;
    const m = this._mouse;
    return m ? m.justReleased(idx) : false;
  }

  button(name) {
    const idx = resolveButtonName(name);
    if (idx == null) return null;
    // return cached ergonomic objects for known indices, else new
    if (idx === MouseButton.LEFT) return this.left;
    if (idx === MouseButton.RIGHT) return this.right;
    if (idx === MouseButton.MIDDLE) return this.middle;
    if (idx === MouseButton.BACK) return this.back;
    if (idx === MouseButton.FORWARD) return this.forward;
    return makeButtonObject(this, idx);
  }

  get left() { return this._left; }
  get right() { return this._right; }
  get middle() { return this._middle; }
  get back() { return this._back; }
  get forward() { return this._forward; }

  get cursor() {
    return this._cursor;
  }

  get pointerLock() {
    return this._pointerLock;
  }
}
