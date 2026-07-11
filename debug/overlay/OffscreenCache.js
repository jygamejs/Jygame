export class OffscreenCache {
  constructor(createCanvas) {
    this._cache = new Map();
    this._createCanvas = createCanvas || (typeof document !== "undefined"
      ? (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
      : null);
  }

  get(key, drawFn, width, height) {
    if (!this._createCanvas) return null;
    let entry = this._cache.get(key);
    if (!entry || entry.width !== width || entry.height !== height) {
      const canvas = this._createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      drawFn(ctx, width, height);
      entry = { canvas, width, height };
      this._cache.set(key, entry);
    }
    return entry.canvas;
  }

  has(key) { return this._cache.has(key); }

  invalidate(key) { this._cache.delete(key); }

  invalidateAll() { this._cache.clear(); }
}
