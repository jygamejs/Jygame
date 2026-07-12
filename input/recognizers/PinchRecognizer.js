import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";

export class PinchRecognizer extends GestureRecognizer {
  constructor() {
    super();
    this._initialDist = 0;
    this._lastScale = 1;
    this._activePointerIds = [];
    this._tracking = false;
  }

  get type() { return GestureType.PINCH; }
  get priority() { return 60; }

  reset() {
    super.reset();
    this._tracking = false;
    this._activePointerIds = [];
    this._initialDist = 0;
    this._lastScale = 1;
  }

  _dist(p1, p2) {
    const dx = p1.position.x - p2.position.x;
    const dy = p1.position.y - p2.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  update(pointers, dt) {
    const touchPointers = pointers.filter(p => p.isDown);

    if (touchPointers.length < 2) {
      if (this._tracking) {
        this._result = new GestureEvent(GestureType.PINCH, {
          scale: this._lastScale,
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
      this._initialDist = this._dist(p1, p2);
      this._lastScale = 1;
      this._activePointerIds = [p1.id, p2.id];
    }

    const currentDist = this._dist(p1, p2);
    this._lastScale = this._initialDist > 0 ? currentDist / this._initialDist : 1;

    this._active = true;
  }
}
