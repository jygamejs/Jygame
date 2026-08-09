import { Binding, registerBinding } from "./Binding.js";
import { Gamepad } from "../Gamepad.js";

// Evaluates the axis magnitude (0..1). Direction is not available on a scalar
// axis binding — read sticks or a specific axis directly for signed values.
export class GamepadAxisBinding extends Binding {
  constructor(axis, gamepadIndex = 0) {
    super();
    this._axis = axis;
    this._gamepadIndex = gamepadIndex;
  }

  get type() { return "gamepadAxis"; }
  get axis() { return this._axis; }
  get gamepadIndex() { return this._gamepadIndex; }

  evaluate(deviceRegistry) {
    const gp = deviceRegistry.get(Gamepad);
    if (!gp) return 0;
    return Math.min(1, Math.abs(gp.axis(this._gamepadIndex, this._axis)));
  }

  serialize() {
    return { ...super.serialize(), axis: this._axis, gamepadIndex: this._gamepadIndex };
  }

  static deserialize(data) {
    return new GamepadAxisBinding(data.axis, data.gamepadIndex);
  }
}

registerBinding("gamepadAxis", GamepadAxisBinding);
