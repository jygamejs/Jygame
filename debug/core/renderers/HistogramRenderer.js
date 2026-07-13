export class HistogramRenderer {
  render(ctx, x, y, width, height, values, opts = {}) {
    if (!values || values.length === 0) return;

    const bins = opts.bins || 20;
    const color = opts.color || "#88ccff";
    const binWidth = width / bins;
    const counts = new Array(bins).fill(0);
    const min = opts.min != null ? opts.min : Math.min(...values);
    const max = opts.max != null ? opts.max : Math.max(...values);
    const range = max - min || 1;

    for (const v of values) {
      const bin = Math.min(Math.floor(((v - min) / range) * bins), bins - 1);
      counts[bin]++;
    }

    const maxCount = Math.max(...counts, 1);
    ctx.fillStyle = color;
    for (let i = 0; i < bins; i++) {
      const barHeight = (counts[i] / maxCount) * height;
      ctx.fillRect(x + i * binWidth, y + height - barHeight, Math.max(binWidth - 1, 1), barHeight);
    }
  }
}
