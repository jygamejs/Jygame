export class FrameBarRenderer {
  render(ctx, x, y, width, height, data, theme) {
    const duration = data.duration || 0;
    const total = data.total || 1;
    const color = data.color || "#88ccff";
    const label = data.label || "";
    const depth = data.depth || 0;
    const textColor = (theme && theme.text) || "#e0e0f0";
    const dimColor = (theme && theme.textDim) || "#8888aa";
    const fontSize = (theme && theme.fontSize) || 12;
    const fontFamily = (theme && theme.fontFamily) || "monospace";
    const indent = depth * 16;
    const labelWidth = 120;
    const barArea = Math.max(width - labelWidth - indent - 50, 20);
    const barWidth = (duration / Math.max(total, 0.001)) * barArea;

    ctx.textBaseline = "middle";
    ctx.font = `${fontSize}px ${fontFamily}`;

    ctx.fillStyle = textColor;
    ctx.fillText(label, x + indent, y + height / 2);

    ctx.fillStyle = color;
    ctx.fillRect(x + labelWidth + indent, y + 2, Math.max(barWidth, 2), height - 4);

    ctx.fillStyle = dimColor;
    ctx.fillText(`${duration.toFixed(1)}ms`, x + labelWidth + indent + barWidth + 6, y + height / 2);
  }
}
