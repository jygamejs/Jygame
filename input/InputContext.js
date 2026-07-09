import { resolveMetricIds } from "../debug/index.js";

const DEFAULT_KEY_MAP = Object.freeze({
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  w: "UP",
  W: "UP",
  s: "DOWN",
  S: "DOWN",
  a: "LEFT",
  A: "LEFT",
  d: "RIGHT",
  D: "RIGHT",
  " ": "SPACE",
  Escape: "ESCAPE",
  Enter: "ENTER",
});

export class InputContext {
  constructor(options = {}) {
    this._pressed = new Map();
    this._justPressed = new Map();
    this._justReleased = new Map();
    this._pointers = new Map();
    this._actions = new Map();
    this._pointerX = 0;
    this._pointerY = 0;
    this._target = null;
    this._swipeListeners = new Set();
    this._tapListeners = new Set();
    this._keyMap = new Map(Object.entries(DEFAULT_KEY_MAP));
    this.buffer = [];

    this._diagnostics = null;
    this._frameKeyEvents = 0;
    this._framePointerEvents = 0;
    this._frameActions = 0;

    this.swipeThreshold = options.swipeThreshold ?? 30;
    this.tapTimeout = options.tapTimeout ?? 300;

    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundKeyUp = this._handleKeyUp.bind(this);
    this._boundPointerDown = this._handlePointerDown.bind(this);
    this._boundPointerMove = this._handlePointerMove.bind(this);
    this._boundPointerUp = this._handlePointerUp.bind(this);
    this._boundPointerCancel = this._handlePointerCancel.bind(this);
  }

  get x() { return this._pointerX; }
  get y() { return this._pointerY; }
  get isPointerDown() { return this._pointers.size > 0; }
  get pointerCount() { return this._pointers.size; }

  init(target) {
    const el = target || document;
    this._target = el;
    document.addEventListener("keydown", this._boundKeyDown);
    document.addEventListener("keyup", this._boundKeyUp);
    el.addEventListener("pointerdown", this._boundPointerDown, { passive: false });
    el.addEventListener("pointermove", this._boundPointerMove, { passive: false });
    el.addEventListener("pointerup", this._boundPointerUp, { passive: false });
    el.addEventListener("pointercancel", this._boundPointerCancel, { passive: false });
    el.style.touchAction = "none";
  }

  destroy() {
    const el = this._target;
    if (!el) return;
    document.removeEventListener("keydown", this._boundKeyDown);
    document.removeEventListener("keyup", this._boundKeyUp);
    el.removeEventListener("pointerdown", this._boundPointerDown);
    el.removeEventListener("pointermove", this._boundPointerMove);
    el.removeEventListener("pointerup", this._boundPointerUp);
    el.removeEventListener("pointercancel", this._boundPointerCancel);
    el.style.touchAction = "";
    this._pointers.clear();
    this._pressed.clear();
    this._justPressed.clear();
    this._justReleased.clear();
    this._actions.clear();
    this._swipeListeners.clear();
    this._tapListeners.clear();
    this._target = null;
    this.buffer = [];
  }

  _initDiag(diag) {
    if (this._diagIds) return;
    this._diagIds = resolveMetricIds(diag, {
      actions: "input.actionQueries",
      pointerEvents: "input.pointerEvents",
      keyEvents: "input.keyEvents",
      activePointers: "input.activePointers",
    });
  }

  updateFrame() {
    if (this._diagnostics) {
      this._initDiag(this._diagnostics);
      const ids = this._diagIds;
      if (ids) {
        if (ids.keyEvents >= 0) this._diagnostics.recordCounter(ids.keyEvents, this._frameKeyEvents);
        if (ids.pointerEvents >= 0) this._diagnostics.recordCounter(ids.pointerEvents, this._framePointerEvents);
        if (ids.actions >= 0) this._diagnostics.recordCounter(ids.actions, this._frameActions);
        if (ids.activePointers >= 0) this._diagnostics.recordGauge(ids.activePointers, this._pointers.size);
      }
    }
    this._frameKeyEvents = 0;
    this._framePointerEvents = 0;
    this._frameActions = 0;
    this._justPressed.clear();
    this._justReleased.clear();
  }

  clearJustPressed() {
    this._justPressed.clear();
  }

  mapKey(rawKey, alias) {
    this._keyMap.set(rawKey, alias);
  }

  unmapKey(rawKey) {
    this._keyMap.delete(rawKey);
  }

  setKeyMap(map) {
    this._keyMap = new Map(Object.entries(map));
  }

  resetKeyMap() {
    this._keyMap = new Map(Object.entries(DEFAULT_KEY_MAP));
  }

  getKeyMap() {
    return Object.fromEntries(this._keyMap);
  }

  bind(action, input) {
    let inputs = this._actions.get(action);
    if (!inputs) {
      inputs = new Set();
      this._actions.set(action, inputs);
    }
    inputs.add(input);
  }

  unbind(action, input) {
    const inputs = this._actions.get(action);
    if (inputs) inputs.delete(input);
  }

  getBindings(action) {
    const inputs = this._actions.get(action);
    return inputs ? [...inputs] : [];
  }

  clearBindings(action) {
    this._actions.delete(action);
  }

  _resolve(name, map) {
    if (map.get(name)) return true;
    const inputs = this._actions.get(name);
    if (!inputs) return false;
    for (const input of inputs) {
      if (map.get(input)) return true;
    }
    return false;
  }

  isDown(key) {
    return this._resolve(key, this._pressed);
  }

  justPressed(key) {
    const result = this._resolve(key, this._justPressed);
    if (result) this._frameActions++;
    return result;
  }

  justReleased(key) {
    const result = this._resolve(key, this._justReleased);
    if (result) this._frameActions++;
    return result;
  }

  consumeBuffer() {
    if (this.buffer.length === 0) return null;
    return this.buffer.shift();
  }

  peekBuffer() {
    if (this.buffer.length === 0) return null;
    return this.buffer[0];
  }

  get diagnostics() { return this._diagnostics; }
  set diagnostics(diag) {
    this._diagnostics = diag;
    this._diagIds = null;
  }

  getPointer(id) {
    return this._pointers.get(id) || null;
  }

  getPointers() {
    return this._pointers.values();
  }

  forEachPointer(fn) {
    for (const p of this._pointers.values()) fn(p);
  }

  onSwipe(cb) {
    this._swipeListeners.add(cb);
    return () => {
      this._swipeListeners.delete(cb);
    };
  }

  onTap(cb) {
    this._tapListeners.add(cb);
    return () => {
      this._tapListeners.delete(cb);
    };
  }

  removeSwipe(cb) {
    this._swipeListeners.delete(cb);
  }

  removeTap(cb) {
    this._tapListeners.delete(cb);
  }

  _handleKeyDown(e) {
    this._frameKeyEvents++;
    const raw = e.key;
    if (!this._pressed.get(raw)) this._justPressed.set(raw, true);
    this._pressed.set(raw, true);

    const alias = this._keyMap.get(raw);
    if (alias) {
      if (!this._pressed.get(alias)) this._justPressed.set(alias, true);
      this._pressed.set(alias, true);
    }

    if (raw.startsWith("Arrow") || raw === " ") {
      e.preventDefault();
    }
  }

  _handleKeyUp(e) {
    this._frameKeyEvents++;
    const raw = e.key;
    if (this._pressed.get(raw)) this._justReleased.set(raw, true);
    this._pressed.set(raw, false);

    const alias = this._keyMap.get(raw);
    if (alias) {
      if (this._pressed.get(alias)) this._justReleased.set(alias, true);
      this._pressed.set(alias, false);
    }
  }

  _handlePointerDown(e) {
    this._framePointerEvents++;
    this._pointers.set(e.pointerId, {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      pointerType: e.pointerType,
      isDown: true,
    });
    this._pointerX = e.clientX;
    this._pointerY = e.clientY;
    if (e.cancelable) e.preventDefault();
  }

  _handlePointerMove(e) {
    this._framePointerEvents++;
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    this._pointerX = e.clientX;
    this._pointerY = e.clientY;
    if (e.cancelable) e.preventDefault();
  }

  _handlePointerUp(e) {
    this._framePointerEvents++;
    const p = this._pointers.get(e.pointerId);
    if (!p || !p.isDown) return;
    p.x = e.clientX;
    p.y = e.clientY;
    p.isDown = false;

    const dx = p.x - p.startX;
    const dy = p.y - p.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const elapsed = performance.now() - p.startTime;

    if (absDx < this.swipeThreshold && absDy < this.swipeThreshold && elapsed < this.tapTimeout) {
      for (const cb of this._tapListeners) {
        cb({ x: p.x, y: p.y, pointerId: p.id });
      }
    } else if (absDx >= this.swipeThreshold || absDy >= this.swipeThreshold) {
      const dir = absDx > absDy
        ? (dx > 0 ? "RIGHT" : "LEFT")
        : (dy > 0 ? "DOWN" : "UP");
      for (const cb of this._swipeListeners) cb(dir);
    }

    this._pointers.delete(e.pointerId);
    if (e.cancelable) e.preventDefault();
  }

  _handlePointerCancel(e) {
    this._framePointerEvents++;
    this._pointers.delete(e.pointerId);
  }
}
