export class Rect {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  contains(px, py) {
    return px >= this.x && px < this.x + this.width &&
           py >= this.y && py < this.y + this.height;
  }

  get centerX() { return this.x + this.width / 2; }
  get centerY() { return this.y + this.height / 2; }

  static fromRect(r) {
    return new Rect(r.x, r.y, r.width, r.height);
  }
}
