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
    const cap = this._maxTicks > 0 ? this._maxTicks : Infinity;
    while (this._accumulator >= this._fixedDt && count < cap) {
      this._accumulator -= this._fixedDt;
      count++;
    }
    // Spiral-of-death protection: when the tick cap is hit we drop the
    // unsimulated backlog, but we keep the sub-step remainder. Zeroing the
    // accumulator outright would also force `alpha` to 0, adding an
    // interpolation snap on top of the frame spike that caused the overrun.
    if (this._maxTicks > 0 && count >= this._maxTicks) {
      this._accumulator %= this._fixedDt;
    }
    return count;
  }

  reset() {
    this._accumulator = 0;
  }
}
