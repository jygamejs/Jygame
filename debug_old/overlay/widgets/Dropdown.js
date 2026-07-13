export class Dropdown {
  constructor(opts = {}) {
    this.options = opts.options || [];
    this.selected = opts.selected ?? 0;
    this.onChange = opts.onChange || null;
    this._bounds = null;
    this._open = false;
    this._optionHeight = 20;
  }

  measure(theme, availableWidth) {
    return { width: availableWidth, height: this._optionHeight + 4 };
  }

  render(ctx, x, y, width, height, theme) {
    this._bounds = { x, y, width, height };
    const bgColor = (theme && theme.panelBg) || "rgba(30, 30, 45, 0.95)";
    const borderColor = (theme && theme.border) || "#444466";
    const textColor = (theme && theme.text) || "#e0e0f0";
    const dimColor = (theme && theme.textDim) || "#8888aa";
    const fontSize = (theme && theme.fontSize) || 12;
    const fontFamily = (theme && theme.fontFamily) || "monospace";

    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);

    const label = this.options[this.selected] || "";
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 6, y + height / 2);

    ctx.fillStyle = dimColor;
    ctx.textAlign = "right";
    ctx.fillText(this._open ? "▲" : "▼", x + width - 8, y + height / 2);

    if (this._open) {
      const listY = y + height;
      const maxH = this.options.length * this._optionHeight;
      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.fillRect(x, listY, width, maxH);
      ctx.strokeRect(x, listY, width, maxH);

      for (let i = 0; i < this.options.length; i++) {
        if (i === this.selected) {
          ctx.fillStyle = (theme && theme.borderFocused) || "#6688ff" + "30";
          ctx.fillRect(x, listY + i * this._optionHeight, width, this._optionHeight);
        }
        ctx.fillStyle = i === this.selected ? textColor : dimColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillText(this.options[i], x + 6, listY + i * this._optionHeight + this._optionHeight / 2);
      }
    }
  }

  onInput(event, rect) {
    if (event.type !== "click" || !this._bounds) return false;

    if (this._open) {
      const listY = this._bounds.y + this._bounds.height;
      for (let i = 0; i < this.options.length; i++) {
        const oy = listY + i * this._optionHeight;
        if (event.x >= this._bounds.x && event.x < this._bounds.x + this._bounds.width &&
            event.y >= oy && event.y < oy + this._optionHeight) {
          this._open = false;
          if (i !== this.selected) {
            this.selected = i;
            if (this.onChange) this.onChange(i);
          }
          return true;
        }
      }
      this._open = false;
      return true;
    }

    if (event.x >= this._bounds.x && event.x < this._bounds.x + this._bounds.width &&
        event.y >= this._bounds.y && event.y < this._bounds.y + this._bounds.height) {
      this._open = !this._open;
      return true;
    }

    return false;
  }
}
