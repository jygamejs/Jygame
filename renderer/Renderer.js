export class Renderer {
  constructor({ canvas = null, width = 0, height = 0, options = {} } = {}) {
    if (new.target === Renderer) {
      throw new Error(
        "Renderer is an abstract class and cannot be instantiated directly."
      );
    }
    this.canvas = canvas;
    this._options = options;
    this._width = width;
    this._height = height;
  }

  beginFrame() {
    throw new Error("Renderer.beginFrame() is not implemented.");
  }

  clear() {
    throw new Error("Renderer.clear() is not implemented.");
  }

  render(world) {
    throw new Error("Renderer.render() is not implemented.");
  }

  endFrame() {
    throw new Error("Renderer.endFrame() is not implemented.");
  }

  resize(width, height) {
    this._width = width;
    this._height = height;
  }

  destroy() {
    throw new Error("Renderer.destroy() is not implemented.");
  }

  get immediateContext() {
    throw new Error("Renderer.immediateContext is not implemented.");
  }

  get immediateBackgroundContext() {
    throw new Error("Renderer.immediateBackgroundContext is not implemented.");
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }
}
