import { ParticleVisual, VisualType } from "./ParticleVisual.js";

export class CircleParticleVisual extends ParticleVisual {
  constructor({ radius } = {}) {
    super();
    if (radius !== undefined && radius !== null) {
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error("CircleParticleVisual radius must be a finite number > 0");
      }
    }
    this._radius = radius ?? null;
    Object.freeze(this);
  }

  get type() {
    return "circle";
  }

  get visualType() {
    return VisualType.CIRCLE;
  }

  get radius() {
    return this._radius;
  }

  toJSON() {
    const out = { type: "circle" };
    if (this._radius !== null) out.radius = this._radius;
    return out;
  }
}
