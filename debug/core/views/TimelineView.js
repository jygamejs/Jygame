import { View } from "../View.js";
import { Timeline } from "../structures/Timeline.js";
import { TimelineRenderer } from "../renderers/TimelineRenderer.js";

export class TimelineView extends View {
  static metadata = { title: "Timeline", icon: "\u231A" };

  constructor(contextProvider) {
    super(contextProvider);
    this._model = new Timeline(this.ctx);
    this._rowRects = [];
    this._renderer = new TimelineRenderer(this.ctx, this);
  }

  update(dt) {
    const history = this.ctx.history;
    if (!history || !history.count) return;
    const idx = this._model.frameIndex >= 0 ? this._model.frameIndex : history.count - 1;
    this._model.frameIndex = idx;
  }

  render(ctx, rect) {
    if (!rect) return;
    const theme = this.ctx.theme;
    ctx.fillStyle = theme?.panelBg || "rgba(30,30,45,0.95)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    this._rowRects = [];
    this._renderer.render(ctx, rect, this._model);
  }

  handleInput(event, rect) {
    if (event.type === "click") {
      const row = this._hitTest(event.x, event.y, rect);
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

  _hitTest(x, y, rect) {
    for (const row of this._rowRects) {
      const ry = rect.y + row.y;
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
}
