export class RotationModifier {
  static get capabilities() {
    return {
      gpuCompatible: true,
      requiresState: false,
      spawnsParticles: false,
      requiresCollision: false,
      pass: "integration",
    };
  }

  constructor({ speed, from, to, randomStart = false, priority } = {}) {
    if (speed !== undefined) {
      this._mode = "velocity";
      this._speed = speed;
    } else if (from !== undefined && to !== undefined) {
      this._mode = "interpolate";
      this._from = from;
      this._to = to;
      this._diff = to - from;
    } else {
      throw new Error(
        "RotationModifier requires either `speed` (velocity mode) or `from` + `to` (interpolation mode)"
      );
    }

    this.enabled = true;
    this.priority = priority;
    this._randomStart = randomStart;
  }

  onEmit(particle) {
    if (this._randomStart) {
      particle.rotation = Math.random() * Math.PI * 2;
    }

    if (this._mode === "velocity") {
      particle.rotationSpeed = this._speed;
    }
  }

  update(particle, dt) {
    if (this._mode === "interpolate") {
      particle.rotation = this._from + this._diff * particle.ageRatio;
    }
  }

  toDescriptor() {
    const d = { type: "rotation", mode: this._mode, randomStart: this._randomStart };
    if (this._mode === "velocity") {
      d.speed = this._speed;
    } else {
      d.from = this._from;
      d.to = this._to;
    }
    return d;
  }

  clone() {
    const opts = { randomStart: this._randomStart, priority: this.priority };
    if (this._mode === "velocity") {
      opts.speed = this._speed;
    } else {
      opts.from = this._from;
      opts.to = this._to;
    }
    return new RotationModifier(opts);
  }

  toJSON() {
    const obj = { type: "RotationModifier", randomStart: this._randomStart };
    if (this._mode === "velocity") {
      obj.speed = this._speed;
    } else {
      obj.from = this._from;
      obj.to = this._to;
    }
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new RotationModifier(data);
  }
}
