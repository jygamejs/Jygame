export class Toolbar {
  constructor(opts = {}) {
    this.buttons = opts.buttons || [];
    this.onAction = opts.onAction || null;
    this._buttonRects = [];
    this._buttonSize = 24;
    this._gap = 2;
  }

  measure(theme, availableWidth) {
    const w = this.buttons.length * (this._buttonSize + this._gap) - this._gap;
    return { width: Math.max(w, 0), height: this._buttonSize + 4 };
  }

  render(ctx, x, y, width, height, theme) {
    this._buttonRects = [];
    const bgColor = (theme && theme.panelHeaderBg) || "rgba(40, 40, 55, 0.95)";
    const textColor = (theme && theme.textDim) || "#8888aa";
    const hoverColor = (theme && theme.text) || "#e0e0f0";
    const fontSize = (theme && theme.fontSizeSmall) || 10;
    const bs = this._buttonSize;

    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, width, height);

    let bx = x + 2;
    for (let i = 0; i < this.buttons.length; i++) {
      const btn = this.buttons[i];
      this._buttonRects.push({ x: bx, y: y + 2, width: bs, height: bs });

      ctx.fillStyle = (theme && theme.panelBg) || "rgba(30, 30, 45, 0.95)";
      ctx.fillRect(bx, y + 2, bs, bs);

      ctx.fillStyle = textColor;
      ctx.font = `${fontSize}px ${(theme && theme.fontFamily) || "monospace"}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(btn.icon || btn.label || String(i + 1), bx + bs / 2, y + 2 + bs / 2);

      bx += bs + this._gap;
    }
  }

  onInput(event, rect) {
    if (event.type !== "click") return false;
    for (let i = 0; i < this._buttonRects.length; i++) {
      const r = this._buttonRects[i];
      if (event.x >= r.x && event.x < r.x + r.width &&
          event.y >= r.y && event.y < r.y + r.height) {
        if (this.onAction) this.onAction(this.buttons[i].action || i);
        return true;
      }
    }
    return false;
  }
}
