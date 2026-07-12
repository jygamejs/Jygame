import { ActionKind } from "../ActionKind.js";

export class ActionState {
  constructor(kind = ActionKind.DIGITAL) {
    this._kind = kind;
    this._strength = 0;
    this._prevStrength = 0;
    this._vector = { x: 0, y: 0 };
    this._prevVector = { x: 0, y: 0 };
    this._bufferTimer = 0;
  }

  get kind() { return this._kind; }

  get pressed() { return this._strength > 0; }
  get justPressed() { return this._strength > 0 && this._prevStrength <= 0; }
  get justReleased() { return this._strength <= 0 && this._prevStrength > 0; }

  get strength() { return this._kind === ActionKind.DIGITAL ? (this._strength > 0 ? 1 : 0) : this._strength; }

  get vector() {
    if (this._kind === ActionKind.VECTOR2) return { x: this._vector.x, y: this._vector.y };
    return { x: 0, y: 0 };
  }

  get isBuffered() { return this._bufferTimer > 0; }

  buffer(durationMs) {
    this._bufferTimer = durationMs;
  }

  consumeBuffered() {
    if (this._bufferTimer > 0) {
      this._bufferTimer = 0;
      return true;
    }
    return false;
  }

  snapshot() {
    this._prevStrength = this._strength;
    this._prevVector.x = this._vector.x;
    this._prevVector.y = this._vector.y;

    if (this._bufferTimer > 0) {
      this._bufferTimer -= 16.67;
      if (this._bufferTimer < 0) this._bufferTimer = 0;
    }
  }

  _update(strength, vector) {
    this._strength = Math.max(0, Math.min(1, strength));
    if (vector) {
      this._vector.x = vector.x;
      this._vector.y = vector.y;
    }
  }
}
