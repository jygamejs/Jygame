import { OverlayContext } from "./OverlayContext.js";
import { PanelManager } from "./PanelManager.js";

export class OverlaySession {
  constructor({ history, registry, analysis, config, theme } = {}) {
    this._ctx = new OverlayContext({ history, registry, analysis, config, theme });
    this._visible = false;
    this._panels = new PanelManager(this._ctx);
  }

  get visible() {
    return this._visible;
  }

  get context() {
    return this._ctx;
  }

  get panels() {
    return this._panels;
  }

  update(dt) {
    if (!this._visible) return;
    this._panels.update({ dt });
  }

  render(ctx, width, height) {
    if (!this._visible) return;
    ctx.save();
    this._panels.render(ctx);
    ctx.restore();
  }

  show() {
    if (this._visible) return;
    this._visible = true;
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
  }

  toggle() {
    if (this._visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  destroy() {
    this._panels.hideAll();
    this._panels.forEach(panel => panel.onDestroy());
    this._visible = false;
  }
}
