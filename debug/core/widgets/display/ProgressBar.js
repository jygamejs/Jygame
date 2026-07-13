export class ProgressBar {
  constructor(opts = {}) {
    this.label = opts.label || "";
    this.value = opts.value ?? 0;
    this.max = opts.max ?? 100;
    this.warnAt = opts.warnAt ?? 0.8;
    this.critAt = opts.critAt ?? 0.95;
    this._bounds = null;
  }

  measure(theme, availableWidth) {
    return { width: availableWidth, height: 22 };
  }

  render(ctx, x, y, width, height, theme) {
    this._bounds = { x, y, width, height };
    const frac = this.max > 0 ? Math.min(this.value / this.max, 1) : 0;
    const barX = x + 100;
    const barW = width - 100;
    const barH = height - 8;

    let barColor = (theme && theme.ok) || "#44cc44";
    if (frac >= this.critAt) barColor = (theme && theme.error) || "#ff4444";
    else if (frac >= this.warnAt) barColor = (theme && theme.warn) || "#ffaa00";

    ctx.fillStyle = (theme && theme.border) || "#444466";
    ctx.fillRect(barX, y + 4, barW, barH);

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, y + 4, barW * frac, barH);

    const pct = Math.round(frac * 100);
    const textColor = (theme && theme.text) || "#e0e0f0";
    ctx.fillStyle = textColor;
    ctx.font = `${(theme && theme.fontSize) || 12}px ${(theme && theme.fontFamily) || "monospace"}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(this.label, x + 4, y + height / 2);

    ctx.fillStyle = (theme && theme.textDim) || "#8888aa";
    ctx.textAlign = "right";
    ctx.fillText(`${pct}%`, x + 94, y + height / 2);
  }
}
