export class Camera {
  constructor(x = 0, y = 0, zoom = 1) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
    this.target = null;
    this._rotation = 0;
    this._cos = 1;
    this._sin = 0;
  }

  get rotation() {
    return this._rotation;
  }

  set rotation(v) {
    this._rotation = v;
    this._cos = Math.cos(v);
    this._sin = Math.sin(v);
  }

  lookAt(x, y) {
    this.x = x;
    this.y = y;
  }

  translate(dx, dy) {
    this.x += dx;
    this.y += dy;
  }

  rotate(rad) {
    this.rotation += rad;
  }

  clone() {
    const c = new Camera(this.x, this.y, this.zoom);
    c._rotation = this._rotation;
    c._cos = this._cos;
    c._sin = this._sin;
    return c;
  }

  copy(other) {
    this.x = other.x;
    this.y = other.y;
    this.zoom = other.zoom;
    this._rotation = other._rotation;
    this._cos = other._cos;
    this._sin = other._sin;
    this.target = other.target;
  }

  apply(ctx, vx, vy, vw, vh) {
    const cx = (vw || 0) * 0.5;
    const cy = (vh || 0) * 0.5;
    ctx.translate(cx, cy);
    ctx.scale(this.zoom, this.zoom);
    ctx.rotate(-this._rotation);
    ctx.translate(-this.x, -this.y);
  }

  _syncTarget() {
    if (this.target) {
      this.x = this.target.x;
      this.y = this.target.y;
    }
  }
}
