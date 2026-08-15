// Canvas 2D methods that actually commit pixels. Used to mark an immediate
// surface dirty so the renderer can skip compositing an overlay nobody drew to.
const DRAW_METHODS = new Set([
  "fillRect",
  "strokeRect",
  "clearRect",
  "fillText",
  "strokeText",
  "drawImage",
  "putImageData",
  "fill",
  "stroke",
  "drawFocusIfNeeded",
]);

export class ImmediateCanvas {
  constructor(width = 0, height = 0) {
    const canCreate = typeof document !== "undefined" && typeof document.createElement === "function";
    this.canvas = canCreate ? document.createElement("canvas") : null;
    if (!this.canvas) {
      this.canvas = { width, height, getContext: () => null };
    }
    this.canvas.width = width;
    this.canvas.height = height;
    this.context = this.canvas.getContext("2d");
    this.dirty = false;
    this._drawingContext = null;
  }

  clear() {
    if (this.context) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.dirty = false;
  }

  resize(width, height) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  // The context handed to game code. It proxies the real 2D context and marks
  // the surface dirty whenever a drawing call happens, so the renderer knows
  // whether the overlay changed since the last composite.
  get drawingContext() {
    if (this._drawingContext) return this._drawingContext;
    const target = this.context;
    if (!target) return null;
    const self = this;
    this._drawingContext = new Proxy(target, {
      get(obj, prop) {
        const value = obj[prop];
        if (typeof value === "function" && DRAW_METHODS.has(prop)) {
          return (...args) => {
            self.dirty = true;
            return value.apply(obj, args);
          };
        }
        return value;
      },
    });
    return this._drawingContext;
  }
}