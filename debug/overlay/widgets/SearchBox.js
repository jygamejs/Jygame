export class SearchBox {
  constructor(opts = {}) {
    this.query = opts.query || "";
    this.placeholder = opts.placeholder || "search...";
    this.results = opts.results ?? 0;
    this.total = opts.total ?? 0;
    this.onChange = opts.onChange || null;
    this._bounds = null;
    this._focused = false;
    this._cursorVisible = true;
    this._cursorTimer = 0;
  }

  get focused() {
    return this._focused;
  }

  focus() {
    this._focused = true;
    this._cursorTimer = 0;
    this._cursorVisible = true;
  }

  blur() {
    this._focused = false;
  }

  setQuery(value) {
    this.query = value;
  }

  measure(theme, availableWidth) {
    return { width: availableWidth, height: 28 };
  }

  render(ctx, x, y, width, height, theme) {
    this._bounds = { x, y, width, height };
    const bgColor = (theme && theme.panelBg) || "rgba(30, 30, 45, 0.95)";
    const borderColor = this._focused
      ? ((theme && theme.borderFocused) || "#6688ff")
      : ((theme && theme.border) || "#444466");
    const textColor = (theme && theme.text) || "#e0e0f0";
    const dimColor = (theme && theme.textDim) || "#8888aa";
    const fontSize = (theme && theme.fontSize) || 12;
    const fontFamily = (theme && theme.fontFamily) || "monospace";
    const padding = 6;
    const iconW = 18;

    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    const r = (theme && theme.cornerRadius) || 4;
    roundRect(ctx, x, y, width, height, r);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = dimColor;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔍", x + iconW / 2 + 2, y + height / 2);

    const textX = x + iconW + padding;
    const textW = width - iconW - padding - 50;

    if (this.query) {
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      ctx.fillText(this.query, textX, y + height / 2);
    } else if (!this._focused) {
      ctx.fillStyle = dimColor;
      ctx.textAlign = "left";
      ctx.fillText(this.placeholder, textX, y + height / 2);
    }

    if (this._focused) {
      const cursorX = textX + ctx.measureText(this.query).width + 1;
      ctx.fillStyle = textColor;
      ctx.fillRect(cursorX, y + 5, 1, height - 10);
    }

    const resultText = `${this.results}/${this.total}`;
    ctx.fillStyle = dimColor;
    ctx.textAlign = "right";
    ctx.font = `${fontSize - 1}px ${fontFamily}`;
    ctx.fillText(resultText, x + width - padding, y + height / 2);
  }

  onInput(event, rect) {
    if (event.type === "click") {
      if (this._bounds && event.x >= this._bounds.x && event.x < this._bounds.x + this._bounds.width &&
          event.y >= this._bounds.y && event.y < this._bounds.y + this._bounds.height) {
        this.focus();
        return true;
      }
      this.blur();
      return false;
    }

    if (event.type === "keydown" && this._focused) {
      if (event.key === "Escape") {
        this.blur();
        return true;
      }
      if (event.key === "Backspace") {
        this.query = this.query.slice(0, -1);
        if (this.onChange) this.onChange(this.query);
        return true;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        this.query += event.key;
        if (this.onChange) this.onChange(this.query);
        return true;
      }
    }
    return false;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
