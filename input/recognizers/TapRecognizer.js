import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";

export class TapRecognizer extends GestureRecognizer {
  constructor(maxTime = 200, maxDistance = 10) {
    super();
    this._maxTime = maxTime;
    this._maxDistance = maxDistance;
    this._tracked = new Map();
  }

  get type() { return GestureType.TAP; }
  get priority() { return 10; }

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
      }
    }

    for (const [id, tracked] of this._tracked) {
      if (!currentIds.has(id)) {
        const elapsed = now - tracked.startTime;
        const dx = tracked.lastX - tracked.startX;
        const dy = tracked.lastY - tracked.startY;
        if (elapsed <= this._maxTime && Math.sqrt(dx * dx + dy * dy) <= this._maxDistance) {
          this._result = new GestureEvent(GestureType.TAP, {
            position: { x: tracked.lastX, y: tracked.lastY },
            pointerIds: [id],
            duration: elapsed,
          });
        }
        this._tracked.delete(id);
      }
    }

    this._active = this._tracked.size > 0;
  }
}
