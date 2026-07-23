export class Camera {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.zoom = 1;
    this._rotation = 0;
    this._cos = 1;
    this._sin = 0;
    this._viewport = null;
  }

  get rotation() {
    return this._rotation;
  }

  set rotation(v) {
    this._rotation = v;
    this._cos = Math.cos(v);
    this._sin = Math.sin(v);
  }

  get viewport() {
    return this._viewport;
  }

  set viewport(v) {
    this._viewport = v;
  }

  setViewport(x, y, w, h) {
    this._viewport = { x, y, w, h };
  }

  clearViewport() {
    this._viewport = null;
  }

  apply(ctx) {
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    ctx.translate(cx, cy);
    ctx.scale(this.zoom, this.zoom);
    ctx.rotate(-this._rotation);
    ctx.translate(-this.x, -this.y);
  }

  render(ctx, queue) {
    ctx.save();
    if (this._viewport) {
      ctx.beginPath();
      ctx.rect(this._viewport.x, this._viewport.y, this._viewport.w, this._viewport.h);
      ctx.clip();
    }
    queue.execute(ctx, this);
    ctx.restore();
  }

  worldToScreen(wx, wy, out) {
    const dx = wx - this.x;
    const dy = wy - this.y;
    out.x = this.width * 0.5 + (dx * this._cos + dy * this._sin) * this.zoom;
    out.y = this.height * 0.5 + (-dx * this._sin + dy * this._cos) * this.zoom;
  }

  screenToWorld(sx, sy, out) {
    const a = (sx - this.width * 0.5) / this.zoom;
    const b = (sy - this.height * 0.5) / this.zoom;
    out.x = this.x + a * this._cos - b * this._sin;
    out.y = this.y + a * this._sin + b * this._cos;
  }

  project(x, y) {
    const out = {};
    this.worldToScreen(x, y, out);
    return out;
  }

  unproject(x, y) {
    const out = {};
    this.screenToWorld(x, y, out);
    return out;
  }

  follow(entity) {
    this.x = entity.transform.x;
    this.y = entity.transform.y;
  }
}
