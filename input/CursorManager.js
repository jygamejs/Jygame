export class CursorManager {
  constructor(system) {
    this._system = system;
    this._visible = true;
    this._style = "default";
    this._image = null;
    this._hotspot = { x: 0, y: 0 };
    this._element = null;
  }

  _getElement() {
    if (this._element) return this._element;
    if (this._system) {
      if (this._system.domElement) return this._system.domElement;
      if (this._system._domElement) return this._system._domElement;
      const backend = this._system.backend;
      if (backend && backend._target) return backend._target;
    }
    return null;
  }

  setElement(el) {
    this._element = el;
    this._apply();
  }

  _attachSystem(system) {
    this._system = system;
    this._apply();
  }

  get visible() { return this._visible; }
  set visible(v) {
    this._visible = !!v;
    this._apply();
  }

  get style() { return this._style; }
  set style(s) {
    if (typeof s !== "string") throw new TypeError("cursor style must be a string");
    this._style = s;
    this._apply();
  }

  get image() { return this._image; }
  set image(src) {
    if (src !== null && typeof src !== "string") throw new TypeError("cursor image must be a string or null");
    this._image = src || null;
    this._apply();
  }

  get hotspot() { return { x: this._hotspot.x, y: this._hotspot.y }; }
  set hotspot(v) {
    if (!v || typeof v.x !== "number" || typeof v.y !== "number") throw new TypeError("hotspot must be {x:number,y:number}");
    this._hotspot = { x: v.x, y: v.y };
    if (this._image) this._apply();
  }

  setImage(src, hotspot = null) {
    if (typeof src !== "string") throw new TypeError("cursor image src must be a string");
    this._image = src;
    if (hotspot) {
      if (typeof hotspot.x !== "number" || typeof hotspot.y !== "number") throw new TypeError("hotspot must be {x:number,y:number}");
      this._hotspot = { x: hotspot.x, y: hotspot.y };
    }
    this._apply();
  }

  clearImage() {
    this._image = null;
    this._apply();
  }

  reset() {
    this._visible = true;
    this._style = "default";
    this._image = null;
    this._hotspot = { x: 0, y: 0 };
    this._apply();
  }

  destroy() {
    const el = this._getElement();
    if (el && el.style) {
      el.style.cursor = "";
    }
  }

  // Called by PointerLockManager on unlock to restore desired cursor
  _restoreAfterUnlock() {
    this._apply();
  }

  _apply() {
    const el = this._getElement();
    if (!el || !el.style) return;
    const host = this._system ? (this._system.host || this._system._host) : null;
    if (host && host.pointerLockElement) {
      const target = this._getElement();
      if (host.pointerLockElement === target) return;
    }
    if (!this._visible) {
      el.style.cursor = "none";
      return;
    }
    if (this._image) {
      const hs = this._hotspot;
      const safe = this._image.replace(/"/g, '\\"');
      el.style.cursor = `url("${safe}") ${hs.x} ${hs.y}, ${this._style}`;
      return;
    }
    el.style.cursor = this._style;
  }
}
