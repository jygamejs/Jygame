import { GestureType } from "./GestureType.js";

export class GestureRecognizer {
  constructor() {
    this._result = null;
    this._active = false;
  }

  get type() { return null; }
  get priority() { return 0; }

  get active() { return this._active; }

  get result() {
    const r = this._result;
    this._result = null;
    return r;
  }

  reset() {
    this._result = null;
    this._active = false;
  }

  update(pointers, dt) {
  }
}
