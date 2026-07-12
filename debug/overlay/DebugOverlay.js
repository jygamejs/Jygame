import { OverlaySession } from "./OverlaySession.js";
import { MetricSearchIndex } from "./metrics/MetricSearchIndex.js";

export class DebugOverlay {
  constructor(game) {
    this._game = game;
    this._session = new OverlaySession();
  }

  get visible() { return this._session.visible; }
  get session() { return this._session; }

  _sync() {
    const diag = this._game._getDiag();
    if (!diag) return;
    const ctx = this._session.context;
    if (!ctx.history) {
      ctx.history = diag.history;
      ctx.registry = diag.registry;
      ctx.analysis = diag.analysis;
    }
  }

  show() {
    this._sync();
    this._session.setupDefaultPanels();
    this._session.show();
    const ic = this._game.input;
    if (ic && !this._wired) {
      ic.onInput = (event) => this._session.processInput(event);
      this._wired = true;
    }
  }

  hide() {
    this._session.hide();
  }

  toggle() {
    this._sync();
    if (this._session.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  panel(id) { return this._session.panels.get(id); }

  capture() {
    const diag = this._game._getDiag();
    if (!diag || !diag.triggerEngine) return null;
    return diag.triggerEngine.capture();
  }

  search(query) {
    const diag = this._game._getDiag();
    if (!diag || !diag.registry) return [];
    const idx = new MetricSearchIndex();
    idx.rebuild(diag.registry);
    return idx.search(query);
  }

  export() {
    const diag = this._game._getDiag();
    const data = {
      metrics: diag && diag.registry ? diag.registry.getAll().map(d => ({ name: d.name, type: d.type, category: d.category })) : [],
      captures: this._session.context.captures.map(c => c.toJSON()),
    };
    return JSON.stringify(data, null, 2);
  }

  import(json) {
    try {
      const data = typeof json === "string" ? JSON.parse(json) : json;
      if (data.captures) {
        this._session.context.captures = data.captures;
      }
      return true;
    } catch {
      return false;
    }
  }

  update(dt) { this._session.update(dt); }
  render(ctx, width, height) { this._session.render(ctx, width, height); }
  processInput(event) { return this._session.processInput(event); }

  destroy() { this._session.destroy(); }
}
