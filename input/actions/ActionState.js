import { ActionKind } from "../ActionKind.js";
import { RepeatConfig } from "../RepeatConfig.js";

export class ActionState {
  constructor(kind = ActionKind.DIGITAL) {
    this._kind = kind;
    this._strength = 0;
    this._prevStrength = 0;
    this._vector = { x: 0, y: 0 };
    this._prevVector = { x: 0, y: 0 };
    this._bufferUntil = 0;
    this._repeatDelay = RepeatConfig.delay;
    this._repeatRate = RepeatConfig.rate;
    this._repeatPressedAt = 0;
    this._repeatNextAt = 0;
    this._repeated = false;
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

  get isBuffered() {
    return this._bufferUntil > 0 && performance.now() < this._bufferUntil;
  }

  get bufferedRemaining() {
    if (this._bufferUntil === 0) return 0;
    const rem = this._bufferUntil - performance.now();
    return rem > 0 ? rem : 0;
  }

  buffer(durationMs) {
    this._bufferUntil = performance.now() + durationMs;
  }

  consumeBuffered() {
    if (this.isBuffered) {
      this._bufferUntil = 0;
      return true;
    }
    return false;
  }

  get repeatDelay() { return this._repeatDelay; }
  set repeatDelay(v) {
    if (typeof v !== "number" || v < 0 || !Number.isFinite(v)) throw new TypeError("repeatDelay must be a finite number >= 0");
    this._repeatDelay = v;
  }
  get repeatRate() { return this._repeatRate; }
  set repeatRate(v) {
    if (typeof v !== "number" || v <= 0 || !Number.isFinite(v)) throw new TypeError("repeatRate must be a finite number > 0");
    this._repeatRate = v;
  }
  get repeated() { return this._repeated; }

  snapshot() {
    this._prevStrength = this._strength;
    this._prevVector.x = this._vector.x;
    this._prevVector.y = this._vector.y;

    if (this._bufferUntil !== 0 && performance.now() >= this._bufferUntil) {
      this._bufferUntil = 0;
    }
    this._repeated = false;
  }

  // justPressed/justReleased are a plain comparison against the snapshotted
  // previous value. They used to also require two prior evaluations, to stop a
  // context pushed while its keys were already held from reporting a press
  // that happened before the context existed. That guard also swallowed
  // genuine input: an action pressed on the first frame it was ever polled
  // could never report justPressed at all. ContextStack.push now primes new
  // contexts against live device state instead, which fixes only the case
  // that needed fixing.
  _update(strength, vector) {
    const wasDown = this._prevStrength > 0;
    const isDown = strength > 0;
    this._strength = Math.max(0, Math.min(1, strength));
    if (vector) {
      this._vector.x = vector.x;
      this._vector.y = vector.y;
    } else if (this._strength === 0) {
      this._vector.x = 0;
      this._vector.y = 0;
    }
    const now = performance.now();
    if (!wasDown && isDown) {
      this._repeatPressedAt = now;
      this._repeatNextAt = now + this._repeatDelay;
      this._repeated = true;
    } else if (wasDown && isDown) {
      if (now >= this._repeatNextAt) {
        this._repeated = true;
        do {
          this._repeatNextAt += this._repeatRate;
        } while (now >= this._repeatNextAt);
      } else {
        this._repeated = false;
      }
    } else if (!isDown) {
      this._repeatPressedAt = 0;
      this._repeatNextAt = 0;
      this._repeated = false;
    }
  }
}
