// The seam between the engine and the environment it runs in.
//
// Game and Scene used to reach for `document`, `window`, `getComputedStyle`,
// `ResizeObserver`, `requestAnimationFrame` and `performance` directly, which
// meant neither could be constructed without a browser. That is why the frame
// loop went untested: every test that wanted a Game first had to hand-roll a
// DOM, and six of them did, to the tune of ~400 duplicated lines.
//
// A Host provides those capabilities. BrowserHost is the default and behaves
// exactly as before; HeadlessHost implements the same surface with plain
// objects so the engine runs under Node with no DOM at all.
//
// This is deliberately a capability bag, not an abstraction over the DOM: it
// covers only what the engine actually calls. Renderers still receive a real
// canvas and talk to it directly.

export class Host {
  // ─── Elements ───────────────────────────────────────

  createElement(tag) { throw new Error("Host.createElement() is not implemented."); }
  querySelector(selector) { return null; }

  // The element a game attaches to when no `parent` is given.
  get defaultParent() { throw new Error("Host.defaultParent is not implemented."); }

  // The root element, used by scaleToFit for viewport scaling.
  get documentElement() { throw new Error("Host.documentElement is not implemented."); }

  computedStyle(element) { throw new Error("Host.computedStyle() is not implemented."); }

  // ─── Frame pump ─────────────────────────────────────

  requestFrame(callback) { throw new Error("Host.requestFrame() is not implemented."); }
  cancelFrame(handle) {}

  // Monotonic milliseconds. Kept on the host so tests can drive time.
  now() { return 0; }

  // ─── Environment ────────────────────────────────────

  get devicePixelRatio() { return 1; }
  get viewportWidth() { return 0; }
  get viewportHeight() { return 0; }
  get hidden() { return false; }

  // ─── Events ─────────────────────────────────────────

  // "focus" and "resize" are window-scoped; "visibilitychange" is document
  // -scoped. The host hides that split — callers just name the event.
  onWindow(event, handler) {}
  offWindow(event, handler) {}
  onDocument(event, handler) {}
  offDocument(event, handler) {}

  observeResize(callback) { return { disconnect() {} }; }

  // The Gamepad device polls this each frame instead of reaching for
  // navigator directly. Returns an array of Gamepad-like snapshots indexed by
  // gamepad.index (null for empty slots), the shape navigator.getGamepads()
  // produces.
  getGamepads() { return []; }

  // ─── Pointer lock (optional) ────────────────────────
  requestPointerLock(element) { return Promise.reject(new Error("Pointer lock not supported")); }
  exitPointerLock() {}
  get pointerLockElement() { return null; }

  // ─── Misc ───────────────────────────────────────────

  // Used by the debug workspace, which opens a generated page in a new window.
  openWindow(url, name) { return null; }
  createObjectURL(content, type) { return ""; }
}

export class BrowserHost extends Host {
  createElement(tag) {
    return document.createElement(tag);
  }

  querySelector(selector) {
    return document.querySelector(selector);
  }

  get defaultParent() {
    return document.body;
  }

  get documentElement() {
    return document.documentElement;
  }

  computedStyle(element) {
    return getComputedStyle(element);
  }

  requestFrame(callback) {
    return requestAnimationFrame(callback);
  }

  cancelFrame(handle) {
    cancelAnimationFrame(handle);
  }

  now() {
    return performance.now();
  }

  get devicePixelRatio() {
    return window.devicePixelRatio || 1;
  }

  get viewportWidth() {
    return window.innerWidth;
  }

  get viewportHeight() {
    return window.innerHeight;
  }

  get hidden() {
    return document.hidden;
  }

  onWindow(event, handler) { window.addEventListener(event, handler); }
  offWindow(event, handler) { window.removeEventListener(event, handler); }
  onDocument(event, handler) { document.addEventListener(event, handler); }
  offDocument(event, handler) { document.removeEventListener(event, handler); }

  observeResize(callback) {
    if (typeof ResizeObserver === "undefined") {
      return { disconnect() {} };
    }
    const observer = new ResizeObserver(callback);
    observer.observe(document.documentElement);
    return observer;
  }

  getGamepads() {
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      return navigator.getGamepads();
    }
    return [];
  }

  requestPointerLock(element) {
    if (element && typeof element.requestPointerLock === "function") {
      const res = element.requestPointerLock();
      // Some browsers return void, normalize to promise
      if (res && typeof res.then === "function") return res;
      return Promise.resolve();
    }
    if (typeof document !== "undefined" && element === document.documentElement) {
      return Promise.resolve();
    }
    return Promise.reject(new Error("Pointer lock not supported"));
  }

  exitPointerLock() {
    if (typeof document !== "undefined" && typeof document.exitPointerLock === "function") {
      document.exitPointerLock();
    }
  }

  get pointerLockElement() {
    if (typeof document !== "undefined") return document.pointerLockElement || null;
    return null;
  }

  openWindow(url, name) {
    return window.open(url, name);
  }

  createObjectURL(content, type) {
    const blob = new Blob([content], { type });
    return URL.createObjectURL(blob);
  }
}

// A minimal stand-in element. Enough for the engine's own use — style, class,
// dimensions, child attachment and event listeners — and nothing more.
export class HeadlessElement {
  constructor(tag = "div") {
    this.tagName = String(tag).toUpperCase();
    this.style = { cssText: "", removeProperty() {}, setProperty() {} };
    this.className = "";
    this.id = "";
    this.width = 0;
    this.height = 0;
    this.innerHTML = "";
    this.children = [];
    this.parentNode = null;
    this._listeners = new Map();
    this._context = null;
  }

  get parentElement() { return this.parentNode; }

  appendChild(child) {
    if (child && child.parentNode && child.parentNode !== this) {
      child.parentNode.removeChild(child);
    }
    this.children.push(child);
    if (child) child.parentNode = this;
    return child;
  }

  append(...nodes) {
    for (const n of nodes) this.appendChild(n);
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) {
      this.children.splice(i, 1);
      if (child) child.parentNode = null;
    }
    return child;
  }

  replaceChild(next, prev) {
    const i = this.children.indexOf(prev);
    if (i === -1) return prev;
    this.children[i] = next;
    if (prev) prev.parentNode = null;
    if (next) next.parentNode = this;
    return prev;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  querySelector() { return null; }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, width: this.width, height: this.height };
  }

  addEventListener(type, fn) {
    let set = this._listeners.get(type);
    if (!set) { set = new Set(); this._listeners.set(type, set); }
    set.add(fn);
  }

  removeEventListener(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }

  dispatch(type, event) {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(event);
  }

  // Canvases hand back whatever context the host was configured with, so a
  // headless game can still drive CanvasRenderer end to end.
  getContext(kind) {
    if (this.tagName !== "CANVAS") return null;
    return this._context ? this._context(kind) : null;
  }
}

// A no-op 2D context. Every call a renderer makes is accepted and discarded,
// so the full render path executes without drawing anything.
export function createHeadlessContext2D() {
  const ctx = {
    canvas: null,
    imageSmoothingEnabled: true,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    globalAlpha: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    measureText(text) { return { width: String(text).length * 6 }; },
  };
  const noop = [
    "clearRect", "save", "restore", "translate", "rotate", "scale", "setTransform",
    "transform", "resetTransform", "fillRect", "strokeRect", "drawImage",
    "beginPath", "closePath", "arc", "arcTo", "ellipse", "rect", "fill", "stroke",
    "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "clip",
    "fillText", "strokeText", "setLineDash", "createLinearGradient",
    "createRadialGradient", "createPattern", "putImageData",
  ];
  for (const name of noop) ctx[name] = () => {};
  return ctx;
}

// Runs the engine with no DOM. Frames are pumped manually via flushFrames()
// rather than by a real rAF, so tests and benchmarks control time exactly.
export class HeadlessHost extends Host {
  constructor({ width = 800, height = 600, devicePixelRatio = 1 } = {}) {
    super();
    this._root = new HeadlessElement("html");
    this._body = new HeadlessElement("body");
    this._root.appendChild(this._body);
    this._width = width;
    this._height = height;
    this._dpr = devicePixelRatio;
    this._time = 0;
    this._frameCallbacks = new Map();
    this._nextFrameHandle = 1;
    this._windowListeners = new Map();
    this._documentListeners = new Map();
    this._resizeCallbacks = new Set();
    this._selectors = new Map();
    this._gamepads = [];
    this._pointerLockElement = null;
    this._mockPointerLockShouldFail = false;
    this.hiddenValue = false;
    this.openedWindows = [];
    this.createdObjectURLs = [];
  }

  get body() { return this._body; }

  // Test hook: feed fake Gamepad snapshots to any Gamepad device polling this
  // host. The array is indexed by gamepad.index, like navigator.getGamepads().
  setGamepads(pads) {
    this._gamepads = pads || [];
  }

  get pointerLockElement() { return this._pointerLockElement || null; }

  requestPointerLock(element) {
    if (this._mockPointerLockShouldFail) {
      const err = new Error("mock pointer lock failed");
      this.emitDocument("pointerlockerror", err);
      return Promise.reject(err);
    }
    this._pointerLockElement = element;
    this.emitDocument("pointerlockchange", { target: element });
    return Promise.resolve();
  }

  exitPointerLock() {
    if (!this._pointerLockElement) return;
    this._pointerLockElement = null;
    this.emitDocument("pointerlockchange", { target: null });
  }

  /**
   * Test hook: make the next requestPointerLock reject.
   * Call with `false` to restore success.
   */
  set mockPointerLockShouldFail(v) { this._mockPointerLockShouldFail = !!v; }

  getGamepads() {
    return this._gamepads;
  }

  createElement(tag) {
    const el = new HeadlessElement(tag);
    if (el.tagName === "CANVAS") {
      el.width = this._width;
      el.height = this._height;
      const ctx = createHeadlessContext2D();
      ctx.canvas = el;
      el._context = (kind) => (kind === "2d" ? ctx : null);
    }
    return el;
  }

  // Lets a test wire a selector to an element, for `parent: "#game"`.
  registerSelector(selector, element) {
    this._selectors.set(selector, element);
  }

  querySelector(selector) {
    return this._selectors.get(selector) || null;
  }

  get defaultParent() { return this._body; }
  get documentElement() { return this._root; }

  computedStyle() {
    return {
      position: "relative",
      getPropertyValue: () => "",
      removeProperty() {},
    };
  }

  requestFrame(callback) {
    const handle = this._nextFrameHandle++;
    this._frameCallbacks.set(handle, callback);
    return handle;
  }

  cancelFrame(handle) {
    this._frameCallbacks.delete(handle);
  }

  now() { return this._time; }

  // Advances time and runs whatever frame callbacks are pending. Each pass
  // drains the queue once, so a loop that re-arms itself advances by exactly
  // one frame per call rather than spinning forever.
  advance(ms) {
    this._time += ms;
    const pending = [...this._frameCallbacks.entries()];
    this._frameCallbacks.clear();
    for (const [, cb] of pending) cb(this._time);
    return pending.length;
  }

  flushFrames(count, msPerFrame = 1000 / 60) {
    let ran = 0;
    for (let i = 0; i < count; i++) ran += this.advance(msPerFrame);
    return ran;
  }

  get devicePixelRatio() { return this._dpr; }
  get viewportWidth() { return this._width; }
  get viewportHeight() { return this._height; }
  get hidden() { return this.hiddenValue; }

  onWindow(event, handler) { this._add(this._windowListeners, event, handler); }
  offWindow(event, handler) { this._remove(this._windowListeners, event, handler); }
  onDocument(event, handler) { this._add(this._documentListeners, event, handler); }
  offDocument(event, handler) { this._remove(this._documentListeners, event, handler); }

  // Test hooks: fire the events the engine subscribes to.
  emitWindow(event, payload) { this._emit(this._windowListeners, event, payload); }
  emitDocument(event, payload) { this._emit(this._documentListeners, event, payload); }

  setHidden(value) {
    this.hiddenValue = !!value;
    this.emitDocument("visibilitychange");
  }

  observeResize(callback) {
    this._resizeCallbacks.add(callback);
    const self = this;
    return { disconnect() { self._resizeCallbacks.delete(callback); } };
  }

  emitResize() {
    for (const cb of [...this._resizeCallbacks]) cb();
    this.emitWindow("resize");
  }

  openWindow(url, name) {
    const w = { url, name };
    this.openedWindows.push(w);
    return w;
  }

  createObjectURL(content, type) {
    const url = `headless:${this.createdObjectURLs.length}`;
    this.createdObjectURLs.push({ url, content, type });
    return url;
  }

  _add(map, event, handler) {
    let set = map.get(event);
    if (!set) { set = new Set(); map.set(event, set); }
    set.add(handler);
  }

  _remove(map, event, handler) {
    const set = map.get(event);
    if (set) set.delete(handler);
  }

  _emit(map, event, payload) {
    const set = map.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  get windowListenerCount() {
    let n = 0;
    for (const s of this._windowListeners.values()) n += s.size;
    return n;
  }

  get documentListenerCount() {
    let n = 0;
    for (const s of this._documentListeners.values()) n += s.size;
    return n;
  }

  get pendingFrameCount() { return this._frameCallbacks.size; }
}
