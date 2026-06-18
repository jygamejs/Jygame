import { EASINGS } from "./easing.js";

export class FadeModifier {
  constructor({ mode = "out", easing = "linear", priority } = {}) {
    this.enabled = true;
    this.priority = priority;
    this._mode = mode;
    this._easingName = easing;
    this._ease = EASINGS[easing] || EASINGS.linear;
  }

  update(particle, dt) {
    const t = this._ease(particle.ageRatio);
    let alpha;
    if (this._mode === "in") {
      alpha = t;
    } else if (this._mode === "in-out") {
      alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
    } else {
      alpha = 1 - t;
    }
    particle.alpha = alpha;
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
