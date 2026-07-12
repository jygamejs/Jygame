import { Binding, registerBinding } from "./Binding.js";

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
    return 0;
  }

  serialize() {
    return { ...super.serialize(), axis: this._axis, gamepadIndex: this._gamepadIndex };
  }

  static deserialize(data) {
    return new GamepadAxisBinding(data.axis, data.gamepadIndex);
  }
}

registerBinding("gamepadAxis", GamepadAxisBinding);
