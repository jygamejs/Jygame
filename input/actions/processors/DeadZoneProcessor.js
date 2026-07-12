import { Processor } from "./Processor.js";

export class DeadZoneProcessor extends Processor {
  constructor(inner = 0.15, outer = 0.95) {
    super();
    this._inner = Math.max(0, Math.min(1, inner));
    this._outer = Math.max(0, Math.min(1, outer));
  }

  get type() { return "deadZone"; }
  get inner() { return this._inner; }
  get outer() { return this._outer; }

  process(value) {
    const abs = Math.abs(value);
    if (abs <= this._inner) return 0;
    if (abs >= this._outer) return Math.sign(value);
    const scaled = (abs - this._inner) / (this._outer - this._inner);
    return Math.sign(value) * scaled;
  }

  serialize() {
    return { type: this.type, inner: this._inner, outer: this._outer };
  }
}
