import { Binding, registerBinding } from "./Binding.js";
import { Gamepad } from "../Gamepad.js";

// Evaluates the button's analog value (0..1). Digital buttons report 0 or 1,
// so this is a plain on/off for them; triggers (LT/RT) carry their analog
// strength through, which is what a binding like throttle: "PAD_RT" wants.
export class GamepadButtonBinding extends Binding {
  constructor(button, gamepadIndex = 0) {
    super();
    this._button = button;
    this._gamepadIndex = gamepadIndex;
  }

  get type() { return "gamepadButton"; }
  get button() { return this._button; }
  get gamepadIndex() { return this._gamepadIndex; }

  evaluate(deviceRegistry) {
    const gp = deviceRegistry.get(Gamepad);
    if (!gp) return 0;
    return gp.value(this._gamepadIndex, this._button);
  }

  serialize() {
    return { ...super.serialize(), button: this._button, gamepadIndex: this._gamepadIndex };
  }

  static deserialize(data) {
    return new GamepadButtonBinding(data.button, data.gamepadIndex);
  }
}

registerBinding("gamepadButton", GamepadButtonBinding);
