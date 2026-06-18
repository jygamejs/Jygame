import { ForceModifier } from "./ForceModifier.js";

export class OrbitModifier extends ForceModifier {
  constructor({ x, y, target, strength, falloff, minDistance, radius, stiffness = 2, direction = "counterclockwise", priority } = {}) {
    super({ x, y, target, strength, falloff, minDistance, priority });

    if (radius !== undefined && (!Number.isFinite(radius) || radius <= 0)) {
      throw new Error("OrbitModifier radius must be a finite number > 0");
    }
    this._radius = radius;
    this._radiusMode = radius !== undefined;

    if (!Number.isFinite(stiffness) || stiffness <= 0) {
      throw new Error("OrbitModifier stiffness must be a finite number > 0");
    }
    this._stiffness = stiffness;

    if (direction !== "clockwise" && direction !== "counterclockwise") {
      throw new Error('OrbitModifier direction must be "clockwise" or "counterclockwise"');
    }
    this._clockwise = direction === "clockwise";
  }

  update(particle, dt) {
    this._computeForce(particle);

    if (this._tmpDist === 0) {
      if (this._radiusMode) {
        particle.vy -= this._radius * this._stiffness * dt;
      }
      return;
    }

    const tx = this._clockwise ? this._tmpNY : -this._tmpNY;
    const ty = this._clockwise ? -this._tmpNX : this._tmpNX;

    particle.vx += tx * this._tmpForce * dt;
    particle.vy += ty * this._tmpForce * dt;

    if (this._radiusMode) {
      const error = this._radius - this._tmpDist;
      const correction = error * this._stiffness;
      particle.vx += this._tmpNX * correction * dt;
      particle.vy += this._tmpNY * correction * dt;
    }
  }

  clone() {
    return new OrbitModifier({
      x: this._staticX,
      y: this._staticY,
      target: this._isStaticTarget ? undefined : this._target,
      strength: this._strength,
      falloff: this._falloff,
      minDistance: this._minDistance,
      radius: this._radius,
      stiffness: this._stiffness,
      direction: this._clockwise ? "clockwise" : "counterclockwise",
      priority: this.priority
    });
  }

  toJSON() {
    const obj = { type: "OrbitModifier", strength: this._strength, falloff: this._falloff, minDistance: this._minDistance, stiffness: this._stiffness, direction: this._clockwise ? "clockwise" : "counterclockwise" };
    if (this._radiusMode) obj.radius = this._radius;
    if (this._isStaticTarget) {
      obj.x = this._staticX;
      obj.y = this._staticY;
    } else {
      throw new Error("OrbitModifier.toJSON(): dynamic targets cannot be serialized");
    }
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new OrbitModifier(data);
  }
}
