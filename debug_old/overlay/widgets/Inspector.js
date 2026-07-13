export function renderInspector(ctx, x, y, width, height, data, theme) {
  const entries = data.entries || [];
  const textColor = (theme && theme.text) || "#e0e0f0";
  const dimColor = (theme && theme.textDim) || "#8888aa";
  const fontSize = (theme && theme.fontSize) || 12;
  const fontFamily = (theme && theme.fontFamily) || "monospace";
  const rowH = 18;
  const keyW = Math.min(width * 0.4, 150);

  ctx.font = `${fontSize}px ${fontFamily}`;

  for (let i = 0; i < entries.length; i++) {
    const ry = y + i * rowH;
    const entry = entries[i];
    const key = entry.key || "";
    const val = entry.value !== undefined ? String(entry.value) : "";
    const valColor = entry.color || textColor;

    ctx.fillStyle = dimColor;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(key, x + keyW - 4, ry);

    ctx.fillStyle = valColor;
    ctx.textAlign = "left";
    ctx.fillText(val, x + keyW + 4, ry);
  }
}
