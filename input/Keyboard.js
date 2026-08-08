import { Device } from "./Device.js";
import { KeyboardState } from "./KeyboardState.js";
import { KeyCode } from "./KeyCode.js";
import { Modifier } from "./Modifier.js";
import { EventType } from "./EventType.js";

const MODIFIER_KEY_MAP = {
  [KeyCode.SHIFT_LEFT]: Modifier.SHIFT,
  [KeyCode.SHIFT_RIGHT]: Modifier.SHIFT,
  [KeyCode.CTRL_LEFT]: Modifier.CTRL,
  [KeyCode.CTRL_RIGHT]: Modifier.CTRL,
  [KeyCode.ALT_LEFT]: Modifier.ALT,
  [KeyCode.ALT_RIGHT]: Modifier.ALT,
  [KeyCode.META_LEFT]: Modifier.META,
  [KeyCode.META_RIGHT]: Modifier.META,
};

export class Keyboard extends Device {
  constructor() {
    super();
    this._state = new KeyboardState();
  }

  get type() { return Keyboard; }

  get state() { return this._state; }

  snapshot() {
    this._state.snapshot();
  }

  update(queue) {
    this.snapshot();
    queue.each(event => {
      if (event.type === EventType.KEY_DOWN) {
        const code = KeyCode.fromDOMCode(event.data.code);
        if (code >= 0) {
          if (!event.data.repeat) {
            this._state.press(code);
          } else {
            this._state.setRepeat(code);
          }
          this._updateModifiers(code, true);
        }
        this._state.logicalPress(event.data.key, event.data.repeat);
      } else if (event.type === EventType.KEY_UP) {
        const code = KeyCode.fromDOMCode(event.data.code);
        if (code >= 0) {
          this._state.release(code);
          this._updateModifiers(code, false);
        }
        this._state.logicalRelease(event.data.key);
      }
    });
  }

  _updateModifiers(code, isDown) {
    const bit = MODIFIER_KEY_MAP[code];
    if (bit !== undefined) {
      if (isDown) {
        this._state.modifiers |= bit;
      } else {
        this._state.modifiers &= ~bit;
      }
    }
  }

  reset() { this._state.reset(); }

  isDown(keyCode) { return this._state.isDown(keyCode); }
  justPressed(keyCode) { return this._state.justPressed(keyCode); }
  justReleased(keyCode) { return this._state.justReleased(keyCode); }
  repeat(keyCode) { return this._state.repeat(keyCode); }
  anyDown() { return this._state.anyDown(); }

  // Logical-key queries. The identifier is the exact KeyboardEvent.key value,
  // compared case-sensitively ("m" and "M" are different logical keys).
  isLogicalDown(key) { return this._state.logicalIsDown(key); }
  logicalJustPressed(key) { return this._state.logicalJustPressed(key); }
  logicalJustReleased(key) { return this._state.logicalJustReleased(key); }
  logicalRepeat(key) { return this._state.logicalRepeat(key); }

  get modifiers() { return this._state.modifiers; }
  get pressedKeys() { return this._state.pressedKeys; }
}
