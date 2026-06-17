export class EmitterShape {
  constructor() {
    this._x = 0;
    this._y = 0;
    this._direction = null;
    this._speedMin = 0;
    this._speedMax = 0;
    this._spread = 0;
  }

  get x() {
    return this._x;
  }

  set x(value) {
    if (!Number.isFinite(value)) {
      throw new Error("EmitterShape x must be a finite number");
    }
    this._x = value;
  }

  get y() {
    return this._y;
  }

  set y(value) {
    if (!Number.isFinite(value)) {
      throw new Error("EmitterShape y must be a finite number");
    }
    this._y = value;
  }

  get direction() {
    return this._direction;
  }

  get spread() {
    return this._spread;
  }

  get minSpeed() {
    return this._speedMin;
  }

  get maxSpeed() {
    return this._speedMax;
  }

  _setDirection(validDirections, direction, speed, spread) {
    if (!validDirections.includes(direction)) {
      const name = this.constructor.name;
      throw new Error(
        `${name}: invalid direction "${direction}". Must be one of: ${validDirections.join(", ")}`
      );
    }

    this._direction = direction;

    if (speed === undefined) {
      throw new Error(`${name}: speed is required when direction is set`);
    }

    if (Array.isArray(speed)) {
      if (speed.length !== 2) {
        throw new Error(`${name}: speed range must be [min, max]`);
      }
      const [min, max] = speed;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || max < min) {
        throw new Error(
          `${name}: speed range [min, max] must be finite numbers > 0 with max >= min`
        );
      }
      this._speedMin = min;
      this._speedMax = max;
    } else {
      if (!Number.isFinite(speed) || speed <= 0) {
        throw new Error(`${name}: speed must be a finite number > 0`);
      }
      this._speedMin = speed;
      this._speedMax = speed;
    }

    if (spread !== undefined) {
      if (!Number.isFinite(spread) || spread < 0) {
        throw new Error(`${name}: spread must be a non-negative finite number`);
      }
      this._spread = spread;
    } else {
      this._spread = 0;
    }
  }

  _writeVelocity(particle, baseAngle) {
    const speed = this._speedMin + Math.random() * (this._speedMax - this._speedMin);
    const angle = baseAngle + (Math.random() - 0.5) * this._spread;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;
  }

  _getRadialDirectionAngle(direction, spawnAngle) {
    switch (direction) {
      case "outward":
        return spawnAngle;
      case "inward":
        return spawnAngle + Math.PI;
      case "clockwise":
        return spawnAngle + Math.PI / 2;
      case "counterclockwise":
        return spawnAngle - Math.PI / 2;
    }
  }

  sample(particle) {
    throw new Error("EmitterShape.sample() must be implemented");
  }
}
