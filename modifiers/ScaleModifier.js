import { EASINGS } from "./easing.js";

export class ScaleModifier {
  constructor({ mode, from, to, min, max, easing = "linear", priority } = {}) {
    this.enabled = true;
    this.priority = priority;
    if (mode === "in-out") {
      this._min = min !== undefined ? min : 0;
      this._max = max !== undefined ? max : 1;
    } else {
      this._from = from !== undefined ? from : 1;
      this._to = to !== undefined ? to : 0;
      this._diff = this._to - this._from;
    }
    this._mode = mode || null;
    this._easingName = easing;
    this._ease = EASINGS[easing] || EASINGS.linear;
  }

  update(particle, dt) {
    const t = this._ease(particle.ageRatio);
    let size;
    if (this._mode === "in-out") {
      size = t < 0.5
        ? this._min + (this._max - this._min) * t * 2
        : this._min + (this._max - this._min) * (1 - t) * 2;
    } else {
      size = this._from + this._diff * t;
    }
    particle.size = Math.max(0, size);
  }

  clone() {
    return new ScaleModifier({
      mode: this._mode,
      from: this._from,
      to: this._to,
      min: this._min,
      max: this._max,
      easing: this._easingName,
      priority: this.priority
    });
  }

  toJSON() {
    const obj = { type: "ScaleModifier", mode: this._mode, easing: this._easingName };
    if (this._mode === "in-out") {
      obj.min = this._min;
      obj.max = this._max;
    } else {
      obj.from = this._from;
      obj.to = this._to;
    }
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new ScaleModifier(data);
  }
}
