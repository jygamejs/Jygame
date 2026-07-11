export class MetricRow {
  constructor(opts = {}) {
    this.name = opts.name || "";
    this.value = opts.value ?? 0;
    this.unit = opts.unit || "";
    this.color = opts.color || "#88ccff";
    this.sparklineData = opts.sparklineData || null;
    this.onClick = opts.onClick || null;
    this.selected = !!opts.selected;
    this._bounds = null;
  }

  measure(theme, availableWidth) {
    return { width: availableWidth, height: 22 };
  }

  render(ctx, x, y, width, height, theme, renderers) {
    this._bounds = { x, y, width, height };
    const fontSize = (theme && theme.fontSize) || 12;
    const fontFamily = (theme && theme.fontFamily) || "monospace";
    const textColor = (theme && theme.text) || "#e0e0f0";
    const dimColor = (theme && theme.textDim) || "#8888aa";
    const selectedBg = (theme && theme.borderFocused) || "#6688ff";

    if (this.selected) {
      ctx.fillStyle = selectedBg + "20";
      ctx.fillRect(x, y, width, height);
    }

    ctx.fillStyle = this.color;
    ctx.fillRect(x + 4, y + 4, 4, height - 8);

    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(this.name, x + 14, y + height / 2);

    const valueText = this.unit ? `${this.value} ${this.unit}` : String(this.value);
    ctx.fillStyle = dimColor;
    ctx.textAlign = "right";
    ctx.fillText(valueText, x + (this.sparklineData ? width - 60 : width - 8), y + height / 2);

    if (this.sparklineData && renderers && renderers.sparkline) {
      renderers.sparkline.render(ctx, x + width - 52, y + 2, 48, height - 4, this.sparklineData, {
        color: this.color,
        fill: false,
        lineWidth: 1,
      });
    }
  }

  onInput(event, rect) {
    if (event.type !== "click" || !this._bounds) return false;
    if (event.x >= this._bounds.x && event.x < this._bounds.x + this._bounds.width &&
        event.y >= this._bounds.y && event.y < this._bounds.y + this._bounds.height) {
      if (this.onClick) this.onClick();
      return true;
    }
    return false;
  }
}
