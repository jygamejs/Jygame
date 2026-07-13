export class TabBar {
  constructor(opts = {}) {
    this.tabs = opts.tabs || [];
    this.activeTab = opts.activeTab ?? 0;
    this.onSwitch = opts.onSwitch || null;
    this._tabRects = [];
  }

  measure(theme, availableWidth) {
    return { width: availableWidth, height: (theme && theme.tabHeight) || 24 };
  }

  render(ctx, x, y, width, height, theme) {
    this._tabRects = [];
    const tabH = height;
    const textColor = (theme && theme.text) || "#e0e0f0";
    const textDim = (theme && theme.textDim) || "#8888aa";
    const borderColor = (theme && theme.border) || "#444466";
    const activeBg = (theme && theme.panelBg) || "rgba(30, 30, 45, 0.95)";
    const fontSize = (theme && theme.fontSize) || 12;
    const fontFamily = (theme && theme.fontFamily) || "monospace";
    const tabW = Math.min(120, Math.max(60, (width / this.tabs.length)));

    for (let i = 0; i < this.tabs.length; i++) {
      const tx = x + i * tabW;
      const isActive = i === this.activeTab;
      this._tabRects.push({ x: tx, y, width: tabW, height: tabH });

      ctx.fillStyle = isActive ? activeBg : "transparent";
      ctx.fillRect(tx, y, tabW, tabH);

      ctx.fillStyle = isActive ? textColor : textDim;
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.tabs[i], tx + tabW / 2, y + tabH / 2);

      if (isActive) {
        ctx.fillStyle = (theme && theme.borderFocused) || "#6688ff";
        ctx.fillRect(tx, y + tabH - 2, tabW, 2);
      }

      if (i < this.tabs.length - 1) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx + tabW, y + 4);
        ctx.lineTo(tx + tabW, y + tabH - 4);
        ctx.stroke();
      }
    }
  }

  onInput(event, rect) {
    if (event.type !== "click") return false;
    for (let i = 0; i < this._tabRects.length; i++) {
      const r = this._tabRects[i];
      if (event.x >= r.x && event.x < r.x + r.width &&
          event.y >= r.y && event.y < r.y + r.height) {
        if (i !== this.activeTab) {
          this.activeTab = i;
          if (this.onSwitch) this.onSwitch(i);
        }
        return true;
      }
    }
    return false;
  }
}
