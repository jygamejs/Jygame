export class TooltipManager {
  constructor(context) {
    this._ctx = context;
    this._active = null;
    this._delay = 300;
    this._pendingTimer = null;
  }

  get active() { return this._active; }

  schedule(text, x, y) {
    this._clearPending();
    this._pendingTimer = setTimeout(() => {
      this._active = { text, x, y };
      this._pendingTimer = null;
    }, this._delay);
  }

  show(text, x, y) {
    this._clearPending();
    this._active = { text, x, y };
  }

  dismiss() {
    this._clearPending();
    this._active = null;
  }

  _clearPending() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
  }

  onInput(event) {
    if (event.type === "pointermove") {
      if (this._active) {
        const dx = Math.abs(event.x - this._active.x);
        const dy = Math.abs(event.y - this._active.y);
        if (dx > 5 || dy > 5) this.dismiss();
      }
    }
    if (event.type === "pointerdown" || event.type === "keydown") {
      this.dismiss();
    }
    return false;
  }
}
