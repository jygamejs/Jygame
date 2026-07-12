import { Device } from "./Device.js";
import { InputEvent } from "./InputEvent.js";
import { EventType } from "./EventType.js";
import { Tier } from "./Tier.js";
import { GestureType } from "./GestureType.js";
import { TapRecognizer } from "./recognizers/TapRecognizer.js";
import { DoubleTapRecognizer } from "./recognizers/DoubleTapRecognizer.js";
import { LongPressRecognizer } from "./recognizers/LongPressRecognizer.js";
import { DragRecognizer } from "./recognizers/DragRecognizer.js";
import { SwipeRecognizer } from "./recognizers/SwipeRecognizer.js";
import { PinchRecognizer } from "./recognizers/PinchRecognizer.js";
import { RotateRecognizer } from "./recognizers/RotateRecognizer.js";
import { PanRecognizer } from "./recognizers/PanRecognizer.js";

export class GestureEngine extends Device {
  constructor(pointerManager) {
    super();
    this._pm = pointerManager;
    this._recognizers = [
      new TapRecognizer(),
      new DoubleTapRecognizer(),
      new LongPressRecognizer(),
      new DragRecognizer(),
      new SwipeRecognizer(),
      new PinchRecognizer(),
      new RotateRecognizer(),
      new PanRecognizer(),
    ];
    this._results = new Map();
  }

  get type() { return GestureEngine; }

  isActive(type) {
    for (const r of this._recognizers) {
      if (r.type === type && r.active) return true;
    }
    return false;
  }

  last(type) {
    return this._results.get(type) ?? null;
  }

  consume(type) {
    const result = this._results.get(type) ?? null;
    if (result) this._results.delete(type);
    return result;
  }

  update(queue, dt = 16.67) {
    const pointers = this._pm.getPointers();

    this._results.clear();

    for (const r of this._recognizers) {
      r.update(pointers, dt);
      const result = r.result;
      if (result) {
        this._results.set(r.type, result);
        queue.push(
          new InputEvent(EventType.GESTURE, {
            gestureType: result.type,
            position: result.position,
            delta: result.delta,
            scale: result.scale,
            rotation: result.rotation,
            velocity: result.velocity,
            duration: result.duration,
            pointerIds: result.pointerIds,
          }),
          Tier.NORMAL,
        );
      }
    }
  }
}
