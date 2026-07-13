export class Table {
  constructor(opts = {}) {
    this.columns = opts.columns || [];
    this.rows = opts.rows || [];
    this.sortColumn = opts.sortColumn ?? -1;
    this.sortAsc = opts.sortAsc ?? true;
    this.onSort = opts.onSort || null;
    this._headerRects = [];
    this._rowHeight = 20;
    this._headerHeight = 24;
  }

  measure(theme, availableWidth) {
    const rowCount = this.rows.length;
    return { width: availableWidth, height: this._headerHeight + rowCount * this._rowHeight };
  }

  render(ctx, x, y, width, height, theme) {
    this._headerRects = [];
    const textColor = (theme && theme.text) || "#e0e0f0";
    const dimColor = (theme && theme.textDim) || "#8888aa";
    const borderColor = (theme && theme.border) || "#444466";
    const fontSize = (theme && theme.fontSize) || 12;
    const fontFamily = (theme && theme.fontFamily) || "monospace";
    const colW = width / Math.max(this.columns.length, 1);

    for (let i = 0; i < this.columns.length; i++) {
      const cx = x + i * colW;
      this._headerRects.push({ x: cx, y, width: colW, height: this._headerHeight });

      ctx.fillStyle = borderColor;
      ctx.fillRect(cx, y, 1, this._headerHeight);

      let headerText = this.columns[i];
      if (i === this.sortColumn) {
        headerText += this.sortAsc ? " ▲" : " ▼";
      }

      ctx.fillStyle = textColor;
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(headerText, cx + colW / 2, y + this._headerHeight / 2);
    }

    ctx.fillStyle = borderColor;
    ctx.fillRect(x, y + this._headerHeight, width, 1);

    for (let r = 0; r < this.rows.length; r++) {
      const ry = y + this._headerHeight + r * this._rowHeight;
      if (r % 2 === 1) {
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fillRect(x, ry, width, this._rowHeight);
      }

      for (let c = 0; c < this.columns.length; c++) {
        const cx = x + c * colW;
        const cellText = String(this.rows[r][c] ?? "");

        ctx.fillStyle = textColor;
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(cellText, cx + 4, ry + this._rowHeight / 2);
      }
    }
  }

  onInput(event, rect) {
    if (event.type !== "click") return false;
    for (let i = 0; i < this._headerRects.length; i++) {
      const r = this._headerRects[i];
      if (event.x >= r.x && event.x < r.x + r.width &&
          event.y >= r.y && event.y < r.y + r.height) {
        if (this.sortColumn === i) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortColumn = i;
          this.sortAsc = true;
        }
        if (this.onSort) this.onSort(i, this.sortAsc);
        return true;
      }
    }
    return false;
  }
}
