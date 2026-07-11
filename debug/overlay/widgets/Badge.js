export function renderBadge(ctx, x, y, width, height, data, theme) {
  const status = data.status || "info";
  const text = data.text || "";
  const colorMap = {
    ok: (theme && theme.ok) || "#44cc44",
    warn: (theme && theme.warn) || "#ffaa00",
    error: (theme && theme.error) || "#ff4444",
    info: (theme && theme.info) || "#4488ff",
  };
  const bgColor = colorMap[status] || colorMap.info;
  const textColor = (theme && theme.textInverse) || "#000000";
  const fontSize = (theme && theme.fontSizeSmall) || 10;
  const radius = (theme && theme.cornerRadius) || 4;

  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, width, height, radius);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px ${(theme && theme.fontFamily) || "monospace"}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2);
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
