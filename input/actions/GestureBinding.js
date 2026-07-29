import { Binding, registerBinding } from "./Binding.js";
import { GestureEngine } from "../GestureEngine.js";
import { GestureType } from "../GestureType.js";

const DIRECTION_SECTORS = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

export class GestureBinding extends Binding {
  constructor(gestureType, options = {}) {
    super();
    this._gestureType = gestureType;
    this._direction = options.direction || null;
    this._lastResult = null;
  }

  get type() { return "gesture"; }
  get gestureType() { return this._gestureType; }

  evaluate(deviceRegistry) {
    const ge = deviceRegistry.get(GestureEngine);
    if (!ge) return 0;

    const result = this._resolveResult(ge);
    this._lastResult = result;
    if (!result) return 0;

    if (this._gestureType === GestureType.PINCH) {
      return result.scale || 1;
    }

    return 1;
  }

  _resolveResult(ge) {
    let baseType = this._gestureType;
    let direction = this._direction;

    if (!direction) {
      if (this._gestureType === GestureType.SWIPE_LEFT) { baseType = GestureType.SWIPE; direction = "left"; }
      else if (this._gestureType === GestureType.SWIPE_RIGHT) { baseType = GestureType.SWIPE; direction = "right"; }
      else if (this._gestureType === GestureType.SWIPE_UP) { baseType = GestureType.SWIPE; direction = "up"; }
      else if (this._gestureType === GestureType.SWIPE_DOWN) { baseType = GestureType.SWIPE; direction = "down"; }
    }

    if (direction && baseType === GestureType.SWIPE) {
      const result = ge.last(GestureType.SWIPE);
      if (!result || !result.delta) return null;
      const angle = Math.atan2(-result.delta.y, result.delta.x);
      const target = DIRECTION_SECTORS[direction];
      if (target === undefined) return null;
      let diff = Math.abs(angle - target);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      return diff < Math.PI / 3 ? result : null;
    }

    return ge.last(baseType);
  }

  get vector() {
    if (!this._lastResult) return undefined;
    if (this._gestureType === GestureType.PAN || this._gestureType === GestureType.DRAG) {
      return {
        x: this._lastResult.delta?.x || 0,
        y: this._lastResult.delta?.y || 0,
      };
    }
    return undefined;
  }

  serialize() {
    const data = { ...super.serialize(), gestureType: this._gestureType };
    if (this._direction) data.direction = this._direction;
    return data;
  }

  static deserialize(data) {
    return new GestureBinding(data.gestureType, { direction: data.direction });
  }
}

registerBinding("gesture", GestureBinding);
