import { Binding, registerBinding } from "./Binding.js";
import { Mouse } from "../Mouse.js";

export class WheelBinding extends Binding {
  constructor(direction = "vertical") {
    super();
    this._direction = direction;
  }

  get type() { return "wheel"; }
  get direction() { return this._direction; }

  evaluate(deviceRegistry) {
    const mouse = deviceRegistry.get(Mouse);
    if (!mouse) return 0;

    if (this._direction === "horizontal") {
      const val = Math.abs(mouse.wheelHorizontal);
      return val > 0 ? Math.min(1, val / 120) : 0;
    }

    const val = mouse.wheel;
    if (this._direction === "down") return val < 0 ? Math.min(1, Math.abs(val) / 120) : 0;
    if (this._direction === "up") return val > 0 ? Math.min(1, val / 120) : 0;
    return val !== 0 ? Math.min(1, Math.abs(val) / 120) : 0;
  }

  serialize() {
    return { ...super.serialize(), direction: this._direction };
  }

  static deserialize(data) {
    return new WheelBinding(data.direction);
  }
}

registerBinding("wheel", WheelBinding);
