export class TooltipManager {
  constructor() {
    this._active = null;
    this._delay = 300;
    this._pendingTimer = null;
    this._listeners = new Map();
  }

  get active() { return this._active; }

  schedule(text, x, y) {
    this._clearPending();
    this._pendingTimer = setTimeout(() => {
      this._active = { text, x, y };
      this._pendingTimer = null;
      this._emit("visibilityChanged");
    }, this._delay);
  }

  show(text, x, y) {
    this._clearPending();
    this._active = { text, x, y };
    this._emit("visibilityChanged");
  }

  dismiss() {
    this._clearPending();
    if (this._active) {
      this._active = null;
      this._emit("visibilityChanged");
    }
  }

  _clearPending() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
  }

  onInput(event) {
    if (event.type === "pointermove" || event.type === "mousemove") {
      if (this._active) {
        const dx = Math.abs(event.data?.x - this._active.x);
        const dy = Math.abs(event.data?.y - this._active.y);
        if (dx > 5 || dy > 5) this.dismiss();
      }
    }
    if (event.type === "pointerdown" || event.type === "mousedown" ||
        event.type === "keydown") {
      this.dismiss();
    }
    return false;
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const arr = this._listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  _emit(event, data) {
    const arr = this._listeners.get(event);
    if (arr) arr.slice().forEach(cb => cb(data));
  }
}
