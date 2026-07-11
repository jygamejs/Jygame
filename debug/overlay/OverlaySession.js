import { OverlayContext } from "./OverlayContext.js";
import { PanelManager } from "./PanelManager.js";
import { LayoutEngine } from "./LayoutEngine.js";
import { DarkTheme } from "./theme/DarkTheme.js";

export class OverlaySession {
  constructor({ history, registry, analysis, config, theme } = {}) {
    const resolvedTheme = theme || DarkTheme;
    this._ctx = new OverlayContext({ history, registry, analysis, config, theme: resolvedTheme });
    this._visible = false;
    this._panels = new PanelManager(this._ctx);
    this._layout = new LayoutEngine(resolvedTheme);
    this._ctx.layout = this._layout;
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

  get layout() {
    return this._layout;
  }

  render(ctx, width, height) {
    if (!this._visible) return;
    this._layout.compute(width, height);
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
