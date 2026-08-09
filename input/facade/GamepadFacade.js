import { Gamepad } from "../Gamepad.js";
import { GamepadButton } from "../GamepadButton.js";

// Structured facade backing Input.gamepad. Mirrors the pointer/touch facade
// pattern: a thin view over the live Gamepad device, with no state of its own.
//
// Buttons are queried with a GamepadButton index (e.g. GamepadButton.A) and an
// optional gamepad index; sticks return a dead-zoned { x, y }. The facade is
// for raw per-pad access — named queries and bindings go through Input.down("PAD_A")
// etc. — and answers with the primary gamepad by default.
export class GamepadFacade {
  constructor(inputSystem) {
    this._system = inputSystem;
  }

  get _gp() {
    return this._system ? this._system.devices.get(Gamepad) : null;
  }

  // Number of connected gamepads.
  get count() {
    return this._gp ? this._gp.count : 0;
  }

  get deadZone() {
    return this._gp ? this._gp.deadZone : 0;
  }

  // Polling is a per-frame cost the game may not need. enabled defaults to
  // true (gamepads just work); set it to false to stop polling entirely.
  get enabled() {
    return this._gp ? this._gp.enabled : false;
  }

  set enabled(value) {
    if (this._gp) this._gp.enabled = value;
  }

  // The absolute axis value at which "axis" events start firing.
  get axisMoveThreshold() {
    return this._gp ? this._gp.axisMoveThreshold : 0;
  }

  set axisMoveThreshold(value) {
    if (this._gp) this._gp.axisMoveThreshold = value;
  }

  // Filters out devices the browser reports as gamepads but the game does not
  // want (touchpads, mice, web cameras).
  setMinimumGamepadConfiguration(config) {
    if (this._gp) this._gp.setMinimumGamepadConfiguration(config);
  }

  // Subscription surface, mirroring Excalibur's gamepads.on. Types:
  //   "connect"    → { gamepadIndex, id, mapping }
  //   "disconnect" → { gamepadIndex }
  //   "button"     → { gamepadIndex, button, value, pressed }
  //   "axis"       → { gamepadIndex, axis, value }
  // Returns an unsubscribe function.
  on(type, callback) {
    const gp = this._gp;
    if (!gp) return () => {};
    return gp.on(type, callback);
  }

  connected(index = 0) {
    return this._gp ? this._gp.isConnected(index) : false;
  }

  // Digital press. Pass a threshold to count the button as down when its
  // analog value reaches it (useful for touchy triggers), instead of the
  // browser's own pressed flag.
  isDown(button, index = 0, threshold) {
    return this._gp ? this._gp.isDown(index, button, threshold) : false;
  }

  pressed(button, index = 0) {
    return this._gp ? this._gp.justPressed(index, button) : false;
  }

  released(button, index = 0) {
    return this._gp ? this._gp.justReleased(index, button) : false;
  }

  // Analog button value (0..1); meaningful for the LT/RT triggers. With a
  // threshold the value is suppressed below it.
  value(button, index = 0, threshold) {
    return this._gp ? this._gp.value(index, button, threshold) : 0;
  }

  // Dead-zoned stick vector for "left" or "right".
  stick(index = 0, side = "left") {
    return this._gp ? this._gp.stick(index, side) : { x: 0, y: 0 };
  }

  // Raw axis position for a GamepadAxis index. With a threshold, values
  // inside it read as 0.
  axis(index = 0, axisIndex = 0, threshold) {
    return this._gp ? this._gp.axis(index, axisIndex, threshold) : 0;
  }

  // A plain structured snapshot of one pad, or null when it is not connected.
  get(index = 0) {
    const gp = this._gp;
    const state = gp ? gp.get(index) : null;
    if (!state || !state.connected) return null;
    const btn = (b) => ({ pressed: state.isDown(b), value: state.value(b) });
    return {
      connected: true,
      id: state.id,
      mapping: state.mapping,
      buttons: {
        a: btn(GamepadButton.A),
        b: btn(GamepadButton.B),
        x: btn(GamepadButton.X),
        y: btn(GamepadButton.Y),
        lb: btn(GamepadButton.LB),
        rb: btn(GamepadButton.RB),
        lt: btn(GamepadButton.LT),
        rt: btn(GamepadButton.RT),
        back: btn(GamepadButton.BACK),
        start: btn(GamepadButton.START),
        guide: btn(GamepadButton.GUIDE),
        lsb: btn(GamepadButton.LSB),
        rsb: btn(GamepadButton.RSB),
        dpadUp: btn(GamepadButton.DPAD_UP),
        dpadDown: btn(GamepadButton.DPAD_DOWN),
        dpadLeft: btn(GamepadButton.DPAD_LEFT),
        dpadRight: btn(GamepadButton.DPAD_RIGHT),
      },
      sticks: {
        left: gp.stick(index, "left"),
        right: gp.stick(index, "right"),
      },
    };
  }
}
