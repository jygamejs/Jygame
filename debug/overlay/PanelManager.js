import { Panel } from "./Panel.js";

export class PanelManager {
  constructor(context) {
    this._ctx = context;
    this._panels = new Map();
    this._visible = new Set();
    this._order = [];
  }

  register(panel) {
    if (!(panel instanceof Panel)) {
      throw new TypeError("PanelManager.register() expects a Panel instance");
    }
    if (this._panels.has(panel.id)) {
      throw new Error(`Panel "${panel.id}" is already registered`);
    }
    this._panels.set(panel.id, panel);
    this._order.push(panel.id);
    panel.onRegister();
  }

  unregister(id) {
    const panel = this._panels.get(id);
    if (!panel) return;
    panel.onDestroy();
    this._panels.delete(id);
    this._visible.delete(id);
    const idx = this._order.indexOf(id);
    if (idx !== -1) this._order.splice(idx, 1);
  }

  get(id) {
    return this._panels.get(id) || null;
  }

  show(id) {
    const panel = this._panels.get(id);
    if (!panel) return false;
    if (this._visible.has(id)) return false;
    this._visible.add(id);
    panel.onShow();
    return true;
  }

  hide(id) {
    const panel = this._panels.get(id);
    if (!panel) return false;
    if (!this._visible.has(id)) return false;
    this._visible.delete(id);
    panel.onHide();
    return true;
  }

  toggle(id) {
    if (this._visible.has(id)) {
      return this.hide(id);
    }
    return this.show(id);
  }

  isVisible(id) {
    return this._visible.has(id);
  }

  forEach(fn) {
    this._order.forEach(id => fn(this._panels.get(id), id));
  }

  forEachVisible(fn) {
    for (const id of this._visible) {
      fn(this._panels.get(id), id);
    }
  }

  update(data) {
    for (const id of this._visible) {
      const panel = this._panels.get(id);
      if (panel) panel.update(data);
    }
  }

  render(ctx) {
    for (const id of this._order) {
      if (!this._visible.has(id)) continue;
      const panel = this._panels.get(id);
      if (panel) panel.render(ctx);
    }
  }

  get visibleCount() {
    return this._visible.size;
  }

  get count() {
    return this._panels.size;
  }

  showAll() {
    for (const id of this._order) {
      this.show(id);
    }
  }

  hideAll() {
    for (const id of [...this._visible]) {
      this.hide(id);
    }
  }
}
