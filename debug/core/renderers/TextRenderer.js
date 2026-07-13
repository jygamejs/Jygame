export class TextRenderer {
  constructor(theme) {
    this._theme = theme || {};
    this._cache = new Map();
    this._maxEntries = 500;
  }

  measure(ctx, text, opts = {}) {
    const font = opts.font || this._theme.fontFamily || "monospace";
    const size = opts.size || this._theme.fontSize || 12;
    const key = `${font}:${size}:${text}`;

    let entry = this._cache.get(key);
    if (!entry) {
      ctx.font = `${size}px ${font}`;
      const m = ctx.measureText(text);
      entry = { width: Math.ceil(m.width), height: Math.ceil(size * 1.2) };
      this._cache.set(key, entry);
      if (this._cache.size > this._maxEntries) {
        const first = this._cache.keys().next().value;
        if (first) this._cache.delete(first);
      }
    }
    return entry;
  }

  render(ctx, text, x, y, opts = {}) {
    const font = opts.font || this._theme.fontFamily || "monospace";
    const size = opts.size || this._theme.fontSize || 12;
    const color = opts.color || this._theme.text || "#e0e0f0";
    const align = opts.align || "left";
    const baseline = opts.baseline || "top";

    ctx.font = `${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  clearCache() {
    this._cache.clear();
  }

  get cacheSize() {
    return this._cache.size;
  }
}
