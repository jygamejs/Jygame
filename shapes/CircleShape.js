import { EmitterShape } from "./EmitterShape.js";

export class CircleShape extends EmitterShape {
  constructor(param) {
    super();

    let radius, direction, speed, spread;

    if (typeof param === "object" && param !== null) {
      radius = param.radius;
      direction = param.direction;
      speed = param.speed;
      spread = param.spread;
    } else {
      radius = param;
    }

    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("CircleShape radius must be a finite number > 0");
    }

    this._radius = radius;
    this._tau = Math.PI * 2;

    if (direction !== undefined) {
      this._setDirection(
        ["outward", "inward", "clockwise", "counterclockwise"],
        direction,
        speed,
        spread
      );
    }
  }

  get radius() {
    return this._radius;
  }

  sample(particle) {
    const spawnAngle = Math.random() * this._tau;
    const r = Math.sqrt(Math.random()) * this._radius;
    particle.x = Math.cos(spawnAngle) * r + this._x;
    particle.y = Math.sin(spawnAngle) * r + this._y;

    if (this._direction) {
      this._writeVelocity(particle, this._getRadialDirectionAngle(this._direction, spawnAngle));
    }
  }
}
