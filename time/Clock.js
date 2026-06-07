export class Clock {
  constructor(fps = 60, maxTicks = 5) {
    this._fps = fps;
    this._fixedDt = 1 / fps;
    this._maxDelta = 0.2;
    this._maxTicks = maxTicks;
    this._accumulator = 0;
  }

  get fps() {
    return this._fps;
  }

  set fps(v) {
    this._fps = v;
    this._fixedDt = 1 / v;
  }

  get fixedDt() {
    return this._fixedDt;
  }

  get alpha() {
    return this._fixedDt > 0 ? this._accumulator / this._fixedDt : 0;
  }

  get maxTicks() {
    return this._maxTicks;
  }

  set maxTicks(v) {
    this._maxTicks = v;
  }

  tick(realDt) {
    this._accumulator += Math.min(realDt, this._maxDelta);
    let count = 0;
    while (this._accumulator >= this._fixedDt && count < this._maxTicks) {
      this._accumulator -= this._fixedDt;
      count++;
    }
    if (count >= this._maxTicks) {
      this._accumulator = 0;
    }
    return count;
  }

  reset() {
    this._accumulator = 0;
  }
}
