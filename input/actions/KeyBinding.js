import { Binding, registerBinding } from "./Binding.js";
import { Keyboard } from "../Keyboard.js";

// A KeyBinding is either physical (matched against KeyboardEvent.code via a
// KeyCode) or logical (matched against the exact KeyboardEvent.key value).
// `keyCode` is the physical variant and `key` is the logical variant; exactly
// one of the two is set for a given binding.
export class KeyBinding extends Binding {
  constructor(keyCode, key = null) {
    super();
    this._keyCode = keyCode;
    this._key = key;
  }

  get type() { return "key"; }
  get keyCode() { return this._keyCode; }
  get key() { return this._key; }
  get isLogical() { return this._key !== null; }

  evaluate(deviceRegistry) {
    const kb = deviceRegistry.get(Keyboard);
    if (!kb) return 0;
    if (this._key !== null) {
      return kb.isLogicalDown(this._key) ? 1 : 0;
    }
    return kb.isDown(this._keyCode) ? 1 : 0;
  }

  serialize() {
    const data = { ...super.serialize(), keyCode: this._keyCode };
    if (this._key !== null) data.key = this._key;
    return data;
  }

  static deserialize(data) {
    return new KeyBinding(data.keyCode, data.key ?? null);
  }
}

registerBinding("key", KeyBinding);
