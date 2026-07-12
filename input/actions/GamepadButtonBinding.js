import { Binding } from "./Binding.js";

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
    return 0;
  }

  serialize() {
    return { type: this.type, button: this._button, gamepadIndex: this._gamepadIndex };
  }

  static deserialize(data) {
    return new GamepadButtonBinding(data.button, data.gamepadIndex);
  }
}
