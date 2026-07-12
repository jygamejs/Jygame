import { Binding } from "./Binding.js";
import { Mouse } from "../Mouse.js";

export class MouseButtonBinding extends Binding {
  constructor(button) {
    super();
    this._button = button;
  }

  get type() { return "mouseButton"; }
  get button() { return this._button; }

  evaluate(deviceRegistry) {
    const mouse = deviceRegistry.get(Mouse);
    if (!mouse) return 0;
    return mouse.isDown(this._button) ? 1 : 0;
  }

  serialize() {
    return { type: this.type, button: this._button };
  }

  static deserialize(data) {
    return new MouseButtonBinding(data.button);
  }
}
