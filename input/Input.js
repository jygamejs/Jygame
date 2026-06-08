const _pressed = new Map();
const _justPressed = new Map();
const _justReleased = new Map();

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

let _keyMap = { ...DEFAULT_KEY_MAP };

const _pointers = new Map();
let _pointerX = 0;
let _pointerY = 0;
let _target = null;

let _swipeListeners = [];
let _tapListeners = [];
const MIN_SWIPE = 30;
const TAP_TIMEOUT = 300;

function handleKeyDown(e) {
  const raw = e.key;
  if (!_pressed.get(raw)) _justPressed.set(raw, true);
  _pressed.set(raw, true);

  const alias = _keyMap[raw];
  if (alias) {
    if (!_pressed.get(alias)) _justPressed.set(alias, true);
    _pressed.set(alias, true);
  }

  if (raw.startsWith("Arrow") || raw === " ") {
    e.preventDefault();
  }
}

function handleKeyUp(e) {
  const raw = e.key;
  if (_pressed.get(raw)) _justReleased.set(raw, true);
  _pressed.set(raw, false);

  const alias = _keyMap[raw];
  if (alias) {
    if (_pressed.get(alias)) _justReleased.set(alias, true);
    _pressed.set(alias, false);
  }
}

function handlePointerDown(e) {
  _pointers.set(e.pointerId, {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    startX: e.clientX,
    startY: e.clientY,
    startTime: performance.now(),
    pointerType: e.pointerType,
    isDown: true,
  });
  _pointerX = e.clientX;
  _pointerY = e.clientY;
  if (e.cancelable) e.preventDefault();
}

function handlePointerMove(e) {
  const p = _pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  _pointerX = e.clientX;
  _pointerY = e.clientY;
  if (e.cancelable) e.preventDefault();
}

function handlePointerUp(e) {
  const p = _pointers.get(e.pointerId);
  if (!p || !p.isDown) return;
  p.x = e.clientX;
  p.y = e.clientY;
  p.isDown = false;

  const dx = p.x - p.startX;
  const dy = p.y - p.startY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const elapsed = performance.now() - p.startTime;

  if (absDx < MIN_SWIPE && absDy < MIN_SWIPE && elapsed < TAP_TIMEOUT) {
    for (const cb of _tapListeners) {
      cb({ x: p.x, y: p.y, pointerId: p.id });
    }
  } else if (absDx >= MIN_SWIPE || absDy >= MIN_SWIPE) {
    const dir = absDx > absDy
      ? (dx > 0 ? "RIGHT" : "LEFT")
      : (dy > 0 ? "DOWN" : "UP");
    for (const cb of _swipeListeners) cb(dir);
  }

  _pointers.delete(e.pointerId);
  if (e.cancelable) e.preventDefault();
}

function handlePointerCancel(e) {
  _pointers.delete(e.pointerId);
}

export const Input = {
  buffer: [],

  get x() { return _pointerX; },
  get y() { return _pointerY; },
  get isPointerDown() { return _pointers.size > 0; },
  get pointerCount() { return _pointers.size; },

  init(target) {
    const el = target || document;
    _target = el;
    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("keyup", handleKeyUp);
    el.addEventListener("pointerdown", handlePointerDown, { passive: false });
    el.addEventListener("pointermove", handlePointerMove, { passive: false });
    el.addEventListener("pointerup", handlePointerUp, { passive: false });
    el.addEventListener("pointercancel", handlePointerCancel, { passive: false });
    el.style.touchAction = "none";
  },

  destroy(target) {
    const el = target || _target || document;
    el.removeEventListener("keydown", handleKeyDown);
    el.removeEventListener("keyup", handleKeyUp);
    el.removeEventListener("pointerdown", handlePointerDown);
    el.removeEventListener("pointermove", handlePointerMove);
    el.removeEventListener("pointerup", handlePointerUp);
    el.removeEventListener("pointercancel", handlePointerCancel);
    el.style.touchAction = "";
    _pointers.clear();
    _pressed.clear();
    _justPressed.clear();
    _justReleased.clear();
    _swipeListeners = [];
    _tapListeners = [];
    _target = null;
    this.buffer = [];
  },

  updateFrame() {
    _justPressed.clear();
    _justReleased.clear();
  },

  clearJustPressed() {
    _justPressed.clear();
  },

  mapKey(rawKey, alias) {
    _keyMap[rawKey] = alias;
  },

  unmapKey(rawKey) {
    delete _keyMap[rawKey];
  },

  setKeyMap(map) {
    _keyMap = { ...map };
  },

  resetKeyMap() {
    _keyMap = { ...DEFAULT_KEY_MAP };
  },

  getKeyMap() {
    return { ..._keyMap };
  },

  isDown(key) {
    return !!_pressed.get(key);
  },

  justPressed(key) {
    return !!_justPressed.get(key);
  },

  justReleased(key) {
    return !!_justReleased.get(key);
  },

  consumeBuffer() {
    if (this.buffer.length === 0) return null;
    return this.buffer.shift();
  },

  peekBuffer() {
    if (this.buffer.length === 0) return null;
    return this.buffer[0];
  },

  getPointer(id) {
    return _pointers.get(id) || null;
  },

  getPointers() {
    return [..._pointers.values()];
  },

  forEachPointer(fn) {
    for (const p of _pointers.values()) fn(p);
  },

  onSwipe(cb) {
    _swipeListeners.push(cb);
    return () => {
      _swipeListeners = _swipeListeners.filter(l => l !== cb);
    };
  },

  onTap(cb) {
    _tapListeners.push(cb);
    return () => {
      _tapListeners = _tapListeners.filter(l => l !== cb);
    };
  },

  removeSwipe(cb) {
    _swipeListeners = _swipeListeners.filter(l => l !== cb);
  },

  removeTap(cb) {
    _tapListeners = _tapListeners.filter(l => l !== cb);
  },
};
