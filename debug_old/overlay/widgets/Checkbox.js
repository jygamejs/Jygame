export class Checkbox {
  constructor(opts = {}) {
    this.label = opts.label || "";
    this.checked = !!opts.checked;
    this.onChange = opts.onChange || null;
    this._bounds = null;
    this._boxSize = 16;
  }

  measure(theme, availableWidth) {
    return { width: availableWidth, height: 24 };
  }

  render(ctx, x, y, width, height, theme) {
    this._bounds = { x, y, width, height };
    const bs = this._boxSize;
    const textColor = (theme && theme.text) || "#e0e0f0";
    const borderColor = (theme && theme.border) || "#444466";
    const okColor = (theme && theme.ok) || "#44cc44";
    const fontSize = (theme && theme.fontSize) || 12;
    const fontFamily = (theme && theme.fontFamily) || "monospace";

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + (height - bs) / 2, bs, bs);

    if (this.checked) {
      ctx.fillStyle = okColor;
      ctx.fillRect(x + 4, y + (height - bs) / 2 + 2, bs - 4, bs - 4);
      ctx.fillStyle = (theme && theme.textInverse) || "#000000";
      ctx.font = `${bs - 6}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✓", x + 2 + bs / 2, y + height / 2);
    }

    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(this.label, x + bs + 8, y + height / 2);
  }

  onInput(event, rect) {
    if (event.type !== "click") return false;
    if (!this._bounds) return false;
    const bx = this._bounds.x;
    const by = this._bounds.y;
    const bw = this._bounds.width;
    const bh = this._bounds.height;
    if (event.x >= bx && event.x < bx + bw && event.y >= by && event.y < by + bh) {
      this.checked = !this.checked;
      if (this.onChange) this.onChange(this.checked);
      return true;
    }
    return false;
  }
}
