export class OffscreenCache {
  constructor() {
    this._canvases = new Map();
  }

  get(key, factory, width, height) {
    const existing = this._canvases.get(key);
    if (existing && existing.width >= width && existing.height >= height) {
      return existing;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx && factory) factory(ctx, width, height);
    this._canvases.set(key, canvas);
    return canvas;
  }

  invalidateAll() {
    this._canvases.clear();
  }

  has(key) {
    return this._canvases.has(key);
  }

  remove(key) {
    this._canvases.delete(key);
  }

  clear() {
    this._canvases.clear();
  }

  get size() {
    return this._canvases.size;
  }
}
