import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";

export class PanRecognizer extends GestureRecognizer {
  constructor(threshold = 5) {
    super();
    this._threshold = threshold;
    this._activePointerIds = [];
    this._tracking = false;
    this._lastCentroid = null;
    this._totalDx = 0;
    this._totalDy = 0;
  }

  get type() { return GestureType.PAN; }
  get priority() { return 55; }

  reset() {
    super.reset();
    this._tracking = false;
    this._activePointerIds = [];
    this._lastCentroid = null;
    this._totalDx = 0;
    this._totalDy = 0;
  }

  _centroid(pointers) {
    let cx = 0, cy = 0;
    for (const p of pointers) {
      cx += p.position.x;
      cy += p.position.y;
    }
    return { x: cx / pointers.length, y: cy / pointers.length };
  }

  update(pointers, dt) {
    const touchPointers = pointers.filter(p => p.isDown);

    if (touchPointers.length < 2) {
      if (this._tracking) {
        this._result = new GestureEvent(GestureType.PAN, {
          position: this._lastCentroid ?? { x: 0, y: 0 },
          delta: { x: this._totalDx, y: this._totalDy },
          pointerIds: [...this._activePointerIds],
        });
        this._tracking = false;
        this._activePointerIds = [];
      }
      this._active = false;
      return;
    }

    const centroid = this._centroid(touchPointers);

    if (!this._tracking) {
      this._tracking = true;
      this._lastCentroid = centroid;
      this._totalDx = 0;
      this._totalDy = 0;
      this._activePointerIds = touchPointers.map(p => p.id);
    }

    const dx = centroid.x - this._lastCentroid.x;
    const dy = centroid.y - this._lastCentroid.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= this._threshold) {
      this._totalDx += dx;
      this._totalDy += dy;
      this._lastCentroid = centroid;
    }

    this._active = true;
  }
}
