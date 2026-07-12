import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";

export class DoubleTapRecognizer extends GestureRecognizer {
  constructor(interval = 300, maxDistance = 10, maxTapTime = 200) {
    super();
    this._interval = interval;
    this._maxDistance = maxDistance;
    this._maxTapTime = maxTapTime;
    this._firstTapTime = 0;
    this._firstTapX = 0;
    this._firstTapY = 0;
    this._state = "idle";
    this._tracked = new Map();
  }

  get type() { return GestureType.DOUBLE_TAP; }
  get priority() { return 20; }

  reset() {
    super.reset();
    this._tracked.clear();
    this._state = "idle";
    this._firstTapTime = 0;
  }

  update(pointers, dt) {
    const now = performance.now();

    if (this._state === "waiting" && (now - this._firstTapTime) > this._interval) {
      this._state = "idle";
    }

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
          state: "down",
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
        if (elapsed <= this._maxTapTime && Math.sqrt(dx * dx + dy * dy) <= this._maxDistance) {
          if (this._state === "idle") {
            this._firstTapTime = now;
            this._firstTapX = tracked.lastX;
            this._firstTapY = tracked.lastY;
            this._state = "waiting";
          } else if (this._state === "waiting") {
            const intDx = tracked.lastX - this._firstTapX;
            const intDy = tracked.lastY - this._firstTapY;
            if (Math.sqrt(intDx * intDx + intDy * intDy) <= this._maxDistance) {
              this._result = new GestureEvent(GestureType.DOUBLE_TAP, {
                position: { x: tracked.lastX, y: tracked.lastY },
                pointerIds: [id],
                duration: now - this._firstTapTime,
              });
            }
            this._state = "idle";
          }
        }
        this._tracked.delete(id);
      }
    }

    this._active = this._tracked.size > 0 || this._state === "waiting";
  }
}
