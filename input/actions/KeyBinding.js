import { Binding } from "./Binding.js";
import { Keyboard } from "../Keyboard.js";
import { KeyCode } from "../KeyCode.js";

export class KeyBinding extends Binding {
  constructor(keyCode) {
    super();
    this._keyCode = keyCode;
  }

  get type() { return "key"; }
  get keyCode() { return this._keyCode; }

  evaluate(deviceRegistry) {
    const kb = deviceRegistry.get(Keyboard);
    if (!kb) return 0;
    return kb.isDown(this._keyCode) ? 1 : 0;
  }

  serialize() {
    return { type: this.type, keyCode: this._keyCode };
  }

  static deserialize(data) {
    return new KeyBinding(data.keyCode);
  }
}
