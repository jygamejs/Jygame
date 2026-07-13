export class TimelineInteraction {
  constructor(context, model) {
    this.ctx = context;
    this._model = model;
    this._rowRects = [];
  }

  onInput(event) {
    if (event.type === "click") {
      const row = this._hitTest(event.x, event.y);
      if (row && row.children.length > 0) {
        this._model.toggleExpanded(row.id);
        return true;
      }
    }
    if (event.type === "keydown") {
      if (event.key === "ArrowLeft") {
        const idx = this._model.frameIndex;
        if (idx > 0) this._model.frameIndex = idx - 1;
        return true;
      }
      if (event.key === "ArrowRight") {
        const idx = this._model.frameIndex;
        if (idx < (this.ctx.history?.count || 0) - 1) this._model.frameIndex = idx + 1;
        return true;
      }
    }
    return false;
  }

  trackRow(id, y, height) {
    this._rowRects.push({ id, y, height });
  }

  _hitTest(x, y) {
    const rect = this.ctx.input?.panelRect;
    const panelY = rect ? rect.y : 0;
    for (const row of this._rowRects) {
      const ry = panelY + row.y;
      if (y >= ry && y < ry + row.height) {
        return this._findNode(this._model.tree, row.id);
      }
    }
    return null;
  }

  _findNode(tree, id) {
    for (const node of tree) {
      if (node.id === id) return node;
      const found = this._findNode(node.children, id);
      if (found) return found;
    }
    return null;
  }

  reset() {
    this._rowRects = [];
  }
}
