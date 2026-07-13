export class SplitPane {
  constructor(opts = {}) {
    this.direction = opts.direction || "horizontal";
    this.ratio = opts.ratio ?? 0.5;
    this.minSize = opts.minSize ?? 50;
    this.onResize = opts.onResize || null;
    this._bounds = null;
    this._dragging = false;
    this._dividerSize = 4;
    this._dividerHover = false;
  }

  measure(theme, availableWidth) {
    return { width: availableWidth, height: 200 };
  }

  render(ctx, x, y, width, height, theme) {
    this._bounds = { x, y, width, height };
    const divColor = (theme && theme.border) || "#444466";
    const divHoverColor = (theme && theme.borderFocused) || "#6688ff";

    if (this.direction === "horizontal") {
      const divX = x + (width - this._dividerSize) * this.ratio;
      this._dividerRect = { x: divX, y, width: this._dividerSize, height };
      ctx.fillStyle = this._dividerHover ? divHoverColor : divColor;
      ctx.fillRect(divX, y, this._dividerSize, height);
    } else {
      const divY = y + (height - this._dividerSize) * this.ratio;
      this._dividerRect = { x, y: divY, width, height: this._dividerSize };
      ctx.fillStyle = this._dividerHover ? divHoverColor : divColor;
      ctx.fillRect(x, divY, width, this._dividerSize);
    }
  }

  onInput(event, rect) {
    if (!this._bounds) return false;

    if (event.type === "mousemove") {
      if (this._dividerRect) {
        const wasHover = this._dividerHover;
        this._dividerHover = event.x >= this._dividerRect.x &&
                            event.x < this._dividerRect.x + this._dividerRect.width &&
                            event.y >= this._dividerRect.y &&
                            event.y < this._dividerRect.y + this._dividerRect.height;
      }
      if (this._dragging) {
        if (this.direction === "horizontal") {
          const total = this._bounds.width - this._dividerSize;
          this.ratio = Math.max(0.1, Math.min(0.9, (event.x - this._bounds.x) / (total || 1)));
        } else {
          const total = this._bounds.height - this._dividerSize;
          this.ratio = Math.max(0.1, Math.min(0.9, (event.y - this._bounds.y) / (total || 1)));
        }
        if (this.onResize) this.onResize(this.ratio);
        return true;
      }
      if (this._dividerHover && !wasHover) return true;
      return false;
    }

    if (event.type === "mousedown" && this._dividerHover) {
      this._dragging = true;
      return true;
    }

    if (event.type === "mouseup" && this._dragging) {
      this._dragging = false;
      return true;
    }

    return false;
  }
}
