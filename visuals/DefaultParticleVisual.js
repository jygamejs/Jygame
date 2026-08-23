import { ParticleVisual, VisualType } from "./ParticleVisual.js";

export class DefaultParticleVisual extends ParticleVisual {
  get type() {
    return "default";
  }

  get visualType() {
    return VisualType.DEFAULT;
  }

  toJSON() {
    return { type: "default" };
  }
}
