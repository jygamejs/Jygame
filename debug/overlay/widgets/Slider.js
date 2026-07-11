export class Slider {
  constructor(opts = {}) {
    this.label = opts.label || "";
    this.value = opts.value ?? 50;
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 100;
    this.step = opts.step ?? 1;
    this.onChange = opts.onChange || null;
    this._bounds = null;
    this._dragging = false;
  }

  measure(theme, availableWidth) {
    return { width: availableWidth, height: 28 };
  }

  render(ctx, x, y, width, height, theme) {
    this._bounds = { x, y, width, height };
    const trackY = y + height / 2 - 2;
    const trackH = 4;
    const knobSize = 12;
    const range = this.max - this.min || 1;
    const frac = (this.value - this.min) / range;
    const knobX = x + 100 + frac * (width - 100 - knobSize);

    ctx.fillStyle = (theme && theme.border) || "#444466";
    ctx.fillRect(x + 100, trackY, width - 100, trackH);

    ctx.fillStyle = (theme && theme.ok) || "#44cc44";
    ctx.fillRect(x + 100, trackY, knobX - x - 100 + knobSize / 2, trackH);

    ctx.fillStyle = (theme && theme.text) || "#e0e0f0";
    ctx.font = `${(theme && theme.fontSize) || 12}px ${(theme && theme.fontFamily) || "monospace"}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(this.label, x + 4, y + height / 2);

    ctx.fillStyle = (theme && theme.textDim) || "#8888aa";
    ctx.textAlign = "right";
    ctx.fillText(String(this.value), x + 92, y + height / 2);

    ctx.fillStyle = (theme && theme.textAccent) || "#ffffff";
    ctx.beginPath();
    ctx.arc(knobX + knobSize / 2, y + height / 2, knobSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  onInput(event, rect) {
    if (!this._bounds) return false;
    if (event.type === "mousedown") {
      if (this._hitKnob(event.x, event.y)) {
        this._dragging = true;
        return true;
      }
    }
    if (event.type === "mouseup") {
      if (this._dragging) {
        this._dragging = false;
        return true;
      }
    }
    if (event.type === "mousemove" && this._dragging) {
      const range = this.max - this.min || 1;
      const trackStart = this._bounds.x + 100;
      const trackWidth = this._bounds.width - 100 - 12;
      const frac = Math.max(0, Math.min(1, (event.x - trackStart) / (trackWidth || 1)));
      const newValue = Math.round((this.min + frac * range) / this.step) * this.step;
      if (newValue !== this.value) {
        this.value = Math.max(this.min, Math.min(this.max, newValue));
        if (this.onChange) this.onChange(this.value);
      }
      return true;
    }
    return false;
  }

  _hitKnob(x, y) {
    return x >= this._bounds.x && x <= this._bounds.x + this._bounds.width &&
           y >= this._bounds.y && y <= this._bounds.y + this._bounds.height;
  }
}
