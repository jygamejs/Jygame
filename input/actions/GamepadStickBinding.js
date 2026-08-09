import { Binding, registerBinding } from "./Binding.js";
import { Gamepad } from "../Gamepad.js";

// A whole stick as a 2D vector. evaluate() returns the dead-zoned magnitude
// (strength), and vector() exposes the same stick as { x, y } so a VECTOR2
// action (read with Input.axis) carries the direction — mirroring how
// CompositeBinding exposes its last vector.
export class GamepadStickBinding extends Binding {
  constructor(side, gamepadIndex = 0) {
    super();
    this._side = side;
    this._gamepadIndex = gamepadIndex;
    this._lastVector = { x: 0, y: 0 };
  }

  get type() { return "gamepadStick"; }
  get side() { return this._side; }
  get gamepadIndex() { return this._gamepadIndex; }
  get vector() { return { ...this._lastVector }; }

  evaluate(deviceRegistry) {
    const gp = deviceRegistry.get(Gamepad);
    if (!gp) return 0;
    const v = gp.stick(this._gamepadIndex, this._side);
    this._lastVector = { x: v.x, y: v.y };
    return Math.min(1, Math.sqrt(v.x * v.x + v.y * v.y));
  }

  serialize() {
    return { ...super.serialize(), side: this._side, gamepadIndex: this._gamepadIndex };
  }

  static deserialize(data) {
    return new GamepadStickBinding(data.side, data.gamepadIndex);
  }
}

registerBinding("gamepadStick", GamepadStickBinding);
