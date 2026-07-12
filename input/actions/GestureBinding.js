import { Binding } from "./Binding.js";
import { GestureEngine } from "../GestureEngine.js";

export class GestureBinding extends Binding {
  constructor(gestureType) {
    super();
    this._gestureType = gestureType;
  }

  get type() { return "gesture"; }
  get gestureType() { return this._gestureType; }

  evaluate(deviceRegistry) {
    const ge = deviceRegistry.get(GestureEngine);
    if (!ge) return 0;
    return ge.last(this._gestureType) !== null ? 1 : 0;
  }

  serialize() {
    return { type: this.type, gestureType: this._gestureType };
  }

  static deserialize(data) {
    return new GestureBinding(data.gestureType);
  }
}
