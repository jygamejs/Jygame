import { GestureRecognizer } from "../GestureRecognizer.js";
import { GestureType } from "../GestureType.js";
import { GestureEvent } from "../GestureEvent.js";

export class DragRecognizer extends GestureRecognizer {
  constructor(threshold = 10) {
    super();
    this._threshold = threshold;
    this._tracked = new Map();
  }

  get type() { return GestureType.DRAG; }
  get priority() { return 30; }

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
          totalDx: 0,
          totalDy: 0,
          startTime: performance.now(),
          dragging: false,
        });
        continue;
      }

      const tracked = this._tracked.get(p.id);
      if (!tracked) continue;

      if (!tracked.dragging) {
        const dx = p.position.x - tracked.startX;
        const dy = p.position.y - tracked.startY;
        if (Math.sqrt(dx * dx + dy * dy) > this._threshold) {
          tracked.dragging = true;
        }
      }
    }

    for (const [id, tracked] of this._tracked) {
      if (!currentIds.has(id)) {
        if (tracked.dragging) {
          this._result = new GestureEvent(GestureType.DRAG, {
            position: { x: tracked.startX + tracked.totalDx, y: tracked.startY + tracked.totalDy },
            delta: { x: tracked.totalDx, y: tracked.totalDy },
            pointerIds: [id],
            duration: performance.now() - tracked.startTime,
          });
        }
        this._tracked.delete(id);
      }
    }

    this._active = this._tracked.size > 0 && [...this._tracked.values()].some(t => t.dragging);
  }
}
