import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";

export class LongPressRecognizer extends GestureRecognizer {
  constructor(minTime = 500, maxDistance = 10) {
    super();
    this._minTime = minTime;
    this._maxDistance = maxDistance;
    this._tracked = new Map();
  }

  get type() { return GestureType.LONG_PRESS; }
  get priority() { return 50; }

  reset() {
    super.reset();
    this._tracked.clear();
  }

  update(pointers, dt) {
    const now = performance.now();
    const currentIds = new Set();

    for (const p of pointers) {
      currentIds.add(p.id);

      if (p.justDown) {
        this._tracked.set(p.id, {
          startX: p.position.x,
          startY: p.position.y,
          lastX: p.position.x,
          lastY: p.position.y,
          startTime: now,
        });
        continue;
      }

      const tracked = this._tracked.get(p.id);
      if (!tracked) continue;

      tracked.lastX = p.position.x;
      tracked.lastY = p.position.y;

      const dx = p.position.x - tracked.startX;
      const dy = p.position.y - tracked.startY;
      if (Math.sqrt(dx * dx + dy * dy) > this._maxDistance) {
        this._tracked.delete(p.id);
        continue;
      }

      if ((now - tracked.startTime) >= this._minTime && !tracked.fired) {
        tracked.fired = true;
        this._result = new GestureEvent(GestureType.LONG_PRESS, {
          position: { x: p.position.x, y: p.position.y },
          pointerIds: [p.id],
          duration: now - tracked.startTime,
        });
      }
    }

    for (const [id, tracked] of this._tracked) {
      if (!currentIds.has(id)) {
        this._tracked.delete(id);
      }
    }

    this._active = this._tracked.size > 0;
  }
}
