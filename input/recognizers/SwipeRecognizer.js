import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";

export class SwipeRecognizer extends GestureRecognizer {
  constructor(velocityThreshold = 500, distanceThreshold = 30) {
    super();
    this._velocityThreshold = velocityThreshold;
    this._distanceThreshold = distanceThreshold;
    this._tracked = new Map();
  }

  get type() { return GestureType.SWIPE; }
  get priority() { return 40; }

  reset() {
    super.reset();
    this._tracked.clear();
  }

  update(pointers, dt) {
    const currentIds = new Set();

    for (const p of pointers) {
      currentIds.add(p.id);

      if (p.justDown) {
        this._tracked.set(p.id, {
          startX: p.position.x,
          startY: p.position.y,
          lastX: p.position.x,
          lastY: p.position.y,
          startTime: performance.now(),
          maxDx: 0,
          maxDy: 0,
        });
        continue;
      }

      const tracked = this._tracked.get(p.id);
      if (!tracked) continue;

      const dx = p.position.x - tracked.lastX;
      const dy = p.position.y - tracked.lastY;
      tracked.lastX = p.position.x;
      tracked.lastY = p.position.y;

      const totalDx = p.position.x - tracked.startX;
      const totalDy = p.position.y - tracked.startY;
      if (Math.abs(totalDx) > Math.abs(tracked.maxDx)) tracked.maxDx = totalDx;
      if (Math.abs(totalDy) > Math.abs(tracked.maxDy)) tracked.maxDy = totalDy;
    }

    for (const [id, tracked] of this._tracked) {
      if (!currentIds.has(id)) {
        const velocity = Math.sqrt(tracked.maxDx * tracked.maxDx + tracked.maxDy * tracked.maxDy) / Math.max(performance.now() - tracked.startTime, 1) * 1000;
        const totalDist = Math.sqrt(tracked.maxDx * tracked.maxDx + tracked.maxDy * tracked.maxDy);

        if (velocity >= this._velocityThreshold && totalDist >= this._distanceThreshold) {
          this._result = new GestureEvent(GestureType.SWIPE, {
            delta: { x: tracked.maxDx, y: tracked.maxDy },
            velocity,
            pointerIds: [id],
            duration: performance.now() - tracked.startTime,
          });
        }
        this._tracked.delete(id);
      }
    }

    this._active = this._tracked.size > 0;
  }
}
