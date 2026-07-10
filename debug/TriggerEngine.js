import { TriggerCondition } from "./TriggerCondition.js";
import { CaptureResult } from "./CaptureResult.js";

export class TriggerEngine {
  constructor(history, registry) {
    this._history = history;
    this._registry = registry;
    this._triggers = [];
    this._cooldownRemaining = 0;
    this._captureRemaining = 0;
    this._captureBuffer = null;
    this._captureCallbacks = [];
  }

  addTrigger(config) {
    const trigger = new TriggerCondition(config);
    trigger.resolve(this._registry);
    this._triggers.push(trigger);
    return trigger;
  }

  removeTrigger(trigger) {
    const idx = this._triggers.indexOf(trigger);
    if (idx !== -1) this._triggers.splice(idx, 1);
  }

  onCapture(callback) {
    this._captureCallbacks.push(callback);
  }

  process(snapshot) {
    if (this._cooldownRemaining > 0) {
      this._cooldownRemaining--;
      return;
    }

    if (this._captureRemaining > 0) {
      this._captureBuffer.push(snapshot);
      this._captureRemaining--;
      if (this._captureRemaining === 0) {
        this._emitCapture(this._captureBuffer);
        this._captureBuffer = null;
      }
      return;
    }

    for (let i = 0; i < this._triggers.length; i++) {
      const trigger = this._triggers[i];
      if (trigger.evaluate(snapshot)) {
        const preCount = Math.min(trigger.preFrames, this._history.count - 1);
        const preSnapshots = [];
        for (let j = preCount; j > 0; j--) {
          preSnapshots.push(this._history.at(j));
        }
        preSnapshots.reverse();
        this._captureBuffer = [snapshot];
        this._captureRemaining = trigger.postFrames;
        this._cooldownRemaining = trigger.cooldown;
        break;
      }
    }
  }

  _emitCapture(captureBuffer) {
    const result = new CaptureResult({
      name: "triggered",
      timestamp: performance.now(),
      preFrames: captureBuffer.length - this._captureRemaining - 1,
      postFrames: this._captureRemaining,
      snapshots: captureBuffer,
      registry: this._registry,
    });
    for (let i = 0; i < this._captureCallbacks.length; i++) {
      this._captureCallbacks[i](result);
    }
  }

  reset() {
    this._triggers = [];
    this._cooldownRemaining = 0;
    this._captureRemaining = 0;
    this._captureBuffer = null;
  }
}
