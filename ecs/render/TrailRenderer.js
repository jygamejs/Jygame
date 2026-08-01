export class TrailRenderer {
  constructor() {
    this._colorCache = new Map();
  }

  render(ctx, items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.mode === 1) {
        this._renderRibbon(ctx, item.buffer, item.color, item.width);
      } else {
        this._renderLine(ctx, item.buffer, item.color, item.width);
      }
    }
  }

  _getColorString(color) {
    let s = this._colorCache.get(color);
    if (!s) {
      s = "#" + color.toString(16).padStart(6, "0");
      this._colorCache.set(color, s);
    }
    return s;
  }

  _renderLine(ctx, buffer, color, width) {
    ctx.strokeStyle = this._getColorString(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    buffer.forEachPoint((x, y, i) => {
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  _renderRibbon(ctx, buffer, color, width) {
    ctx.fillStyle = this._getColorString(color);
    const hw = width * 0.5;
    ctx.beginPath();

    let prevX, prevY;
    let first = true;

    buffer.forEachPoint((x, y, i) => {
      if (first) {
        prevX = x;
        prevY = y;
        first = false;
        return;
      }

      const dx = x - prevX;
      const dy = y - prevY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-10) return;

      const nx = -dy / len;
      const ny = dx / len;
      const lx = prevX - nx * hw;
      const ly = prevY - ny * hw;
      const lx1 = x - nx * hw;
      const ly1 = y - ny * hw;
      const rx = prevX + nx * hw;
      const ry = prevY + ny * hw;
      const rx1 = x + nx * hw;
      const ry1 = y + ny * hw;

      ctx.moveTo(lx, ly);
      ctx.lineTo(lx1, ly1);
      ctx.lineTo(rx1, ry1);
      ctx.lineTo(rx, ry);
      ctx.lineTo(lx, ly);

      prevX = x;
      prevY = y;
    });

    ctx.fill();
  }
}
