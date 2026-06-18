export class VelocityModifier {
  constructor({ drag = 0, affectX = true, affectY = true, priority } = {}) {
    this.enabled = true;
    this.priority = priority;
    this._drag = Math.max(0, drag);
    this._affectX = affectX;
    this._affectY = affectY;
    this._factor = 1;
  }

  beginFrame(dt) {
    this._factor = Math.exp(-this._drag * dt);
  }

  update(particle) {
    if (this._affectX) particle.vx *= this._factor;
    if (this._affectY) particle.vy *= this._factor;
  }

  clone() {
    return new VelocityModifier({
      drag: this._drag,
      affectX: this._affectX,
      affectY: this._affectY,
      priority: this.priority
    });
  }

  toJSON() {
    const obj = { type: "VelocityModifier", drag: this._drag, affectX: this._affectX, affectY: this._affectY };
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new VelocityModifier(data);
  }
}
