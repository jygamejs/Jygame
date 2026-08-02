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
  }

  clear() {
    if (this.context) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  resize(width, height) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }
}
