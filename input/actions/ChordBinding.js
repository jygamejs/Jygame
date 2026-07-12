import { Binding } from "./Binding.js";
import { Keyboard } from "../Keyboard.js";
import { Modifier } from "../Modifier.js";

export class ChordBinding extends Binding {
  constructor(keyCode, options = {}) {
    super();
    this._keyCode = keyCode;
    this._ctrl = !!options.ctrl;
    this._shift = !!options.shift;
    this._alt = !!options.alt;
    this._meta = !!options.meta;
  }

  get type() { return "chord"; }
  get keyCode() { return this._keyCode; }

  evaluate(deviceRegistry) {
    const kb = deviceRegistry.get(Keyboard);
    if (!kb) return 0;

    if (this._ctrl && !(kb.modifiers & Modifier.CTRL)) return 0;
    if (this._shift && !(kb.modifiers & Modifier.SHIFT)) return 0;
    if (this._alt && !(kb.modifiers & Modifier.ALT)) return 0;
    if (this._meta && !(kb.modifiers & Modifier.META)) return 0;

    return kb.isDown(this._keyCode) ? 1 : 0;
  }

  serialize() {
    return {
      type: this.type,
      keyCode: this._keyCode,
      ctrl: this._ctrl,
      shift: this._shift,
      alt: this._alt,
      meta: this._meta,
    };
  }

  static deserialize(data) {
    return new ChordBinding(data.keyCode, {
      ctrl: data.ctrl,
      shift: data.shift,
      alt: data.alt,
      meta: data.meta,
    });
  }
}
