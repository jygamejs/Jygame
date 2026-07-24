export class Viewport {
  constructor(x = 0, y = 0, width = 800, height = 600) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get aspectRatio() {
    return this.width / this.height;
  }

  get center() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  contains(px, py) {
    return px >= this.x && px < this.x + this.width
        && py >= this.y && py < this.y + this.height;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
  }

  set(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
  }
}
