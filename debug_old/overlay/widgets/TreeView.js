export class TreeView {
  constructor(opts = {}) {
    this.nodes = opts.nodes || [];
    this.expanded = new Set(opts.expanded || []);
    this.onToggle = opts.onToggle || null;
    this._nodeRects = [];
    this._rowHeight = 20;
  }

  measure(theme, availableWidth) {
    const count = this._countVisible(this.nodes);
    return { width: availableWidth, height: count * this._rowHeight };
  }

  render(ctx, x, y, width, height, theme) {
    this._nodeRects = [];
    this._renderNodes(ctx, x, y, width, this.nodes, 0, theme);
  }

  _renderNodes(ctx, x, y, width, nodes, depth, theme) {
    const textColor = (theme && theme.text) || "#e0e0f0";
    const dimColor = (theme && theme.textDim) || "#8888aa";
    const fontSize = (theme && theme.fontSize) || 12;
    const fontFamily = (theme && theme.fontFamily) || "monospace";
    const indent = 16;
    let cy = y;

    for (const node of nodes) {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = this.expanded.has(node.id);
      const ix = x + depth * indent;

      this._nodeRects.push({
        id: node.id,
        x: ix, y: cy,
        width: width - depth * indent,
        height: this._rowHeight,
      });

      if (hasChildren) {
        ctx.fillStyle = dimColor;
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isExpanded ? "▼" : "▶", ix + 10, cy + this._rowHeight / 2);
      }

      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillText(node.label || node.id, ix + (hasChildren ? 20 : 10), cy + this._rowHeight / 2);

      if (node.value !== undefined) {
        ctx.fillStyle = dimColor;
        ctx.textAlign = "right";
        ctx.fillText(String(node.value), x + width - 8, cy + this._rowHeight / 2);
      }

      cy += this._rowHeight;

      if (isExpanded && hasChildren) {
        cy = this._renderNodes(ctx, x, cy, width, node.children, depth + 1, theme);
      }
    }

    return cy;
  }

  onInput(event, rect) {
    if (event.type !== "click") return false;
    for (const r of this._nodeRects) {
      if (event.x >= r.x && event.x < r.x + r.width &&
          event.y >= r.y && event.y < r.y + r.height) {
        if (this.expanded.has(r.id)) {
          this.expanded.delete(r.id);
        } else {
          this.expanded.add(r.id);
        }
        if (this.onToggle) this.onToggle(r.id, this.expanded.has(r.id));
        return true;
      }
    }
    return false;
  }

  _countVisible(nodes) {
    let count = 0;
    for (const node of nodes) {
      count++;
      if (node.children && node.children.length > 0 && this.expanded.has(node.id)) {
        count += this._countVisible(node.children);
      }
    }
    return count;
  }
}
