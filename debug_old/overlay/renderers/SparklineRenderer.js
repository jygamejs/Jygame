export class SparklineRenderer {
  render(ctx, x, y, width, height, values, opts = {}) {
    if (!values || values.length < 2) return;

    const color = opts.color || "#88ccff";
    const lineWidth = opts.lineWidth ?? 1.5;
    const fill = opts.fill ?? true;
    const min = opts.min != null ? opts.min : Math.min(...values);
    const max = opts.max != null ? opts.max : Math.max(...values);
    const range = max - min || 1;
    const step = width / (values.length - 1);

    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const px = x + i * step;
      const py = y + height - ((values[i] - min) / range) * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    if (fill) {
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      ctx.fillStyle = color + "40";
      ctx.fill();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}
