import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";

export class RotateRecognizer extends GestureRecognizer {
  constructor() {
    super();
    this._totalRotation = 0;
    this._activePointerIds = [];
    this._tracking = false;
    this._lastAngle = 0;
  }

  get type() { return GestureType.ROTATE; }
  get priority() { return 70; }

  reset() {
    super.reset();
    this._tracking = false;
    this._activePointerIds = [];
    this._totalRotation = 0;
    this._lastAngle = 0;
  }

  _angle(p1, p2) {
    return Math.atan2(p2.position.y - p1.position.y, p2.position.x - p1.position.x);
  }

  update(pointers, dt) {
    const touchPointers = pointers.filter(p => p.isDown);

    if (touchPointers.length < 2) {
      if (this._tracking) {
        this._result = new GestureEvent(GestureType.ROTATE, {
          rotation: this._totalRotation,
          pointerIds: [...this._activePointerIds],
        });
        this._tracking = false;
        this._activePointerIds = [];
      }
      this._active = false;
      return;
    }

    const p1 = touchPointers[0];
    const p2 = touchPointers[1];

    if (!this._tracking) {
      this._tracking = true;
      this._lastAngle = this._angle(p1, p2);
      this._totalRotation = 0;
      this._activePointerIds = [p1.id, p2.id];
    }

    const currentAngle = this._angle(p1, p2);
    let delta = currentAngle - this._lastAngle;

    if (delta > Math.PI) delta -= 2 * Math.PI;
    else if (delta < -Math.PI) delta += 2 * Math.PI;

    this._totalRotation += delta;
    this._lastAngle = currentAngle;

    this._active = true;
  }
}
