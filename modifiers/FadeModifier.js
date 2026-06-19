import { EASINGS } from "./easing.js";

export class FadeModifier {
  static get capabilities() {
    return {
      gpuCompatible: true,
      requiresState: false,
      spawnsParticles: false,
      requiresCollision: false,
      pass: "visual",
    };
  }

  constructor({ mode = "out", easing = "linear", priority } = {}) {
    this.enabled = true;
    this.priority = priority;
    this._mode = mode;
    this._easingName = easing;
    this._ease = EASINGS[easing] || EASINGS.linear;
  }

  update(acc, dt) {
    const t = this._ease(acc.ageRatio);
    let alpha;
    if (this._mode === "in") {
      alpha = t;
    } else if (this._mode === "in-out") {
      alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
    } else {
      alpha = 1 - t;
    }
    acc.alpha = alpha;
  }

  toDescriptor() {
    return { type: "fade", mode: this._mode, easing: this._easingName };
  }

  clone() {
    return new FadeModifier({
      mode: this._mode,
      easing: this._easingName,
      priority: this.priority
    });
  }

  toJSON() {
    const obj = { type: "FadeModifier", mode: this._mode, easing: this._easingName };
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new FadeModifier(data);
  }
}
