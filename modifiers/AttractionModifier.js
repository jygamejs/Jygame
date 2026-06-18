import { ForceModifier } from "./ForceModifier.js";

export class AttractionModifier extends ForceModifier {
  update(particle, dt) {
    this._computeForce(particle);
    particle.vx += this._tmpNX * this._tmpForce * dt;
    particle.vy += this._tmpNY * this._tmpForce * dt;
  }

  clone() {
    return new AttractionModifier({
      x: this._staticX,
      y: this._staticY,
      target: this._isStaticTarget ? undefined : this._target,
      strength: this._strength,
      falloff: this._falloff,
      minDistance: this._minDistance,
      priority: this.priority
    });
  }

  toJSON() {
    const obj = { type: "AttractionModifier", strength: this._strength, falloff: this._falloff, minDistance: this._minDistance };
    if (this._isStaticTarget) {
      obj.x = this._staticX;
      obj.y = this._staticY;
    } else {
      throw new Error("AttractionModifier.toJSON(): dynamic targets cannot be serialized");
    }
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new AttractionModifier(data);
  }
}
