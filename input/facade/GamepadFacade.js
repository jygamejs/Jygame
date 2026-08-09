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

  connected(index = 0) {
    return this._gp ? this._gp.isConnected(index) : false;
  }

  isDown(button, index = 0) {
    return this._gp ? this._gp.isDown(index, button) : false;
  }

  pressed(button, index = 0) {
    return this._gp ? this._gp.justPressed(index, button) : false;
  }

  released(button, index = 0) {
    return this._gp ? this._gp.justReleased(index, button) : false;
  }

  // Analog button value (0..1); meaningful for the LT/RT triggers.
  value(button, index = 0) {
    return this._gp ? this._gp.value(index, button) : 0;
  }

  // Dead-zoned stick vector for "left" or "right".
  stick(index = 0, side = "left") {
    return this._gp ? this._gp.stick(index, side) : { x: 0, y: 0 };
  }

  // Raw axis position for a GamepadAxis index.
  axis(index = 0, axisIndex = 0) {
    return this._gp ? this._gp.axis(index, axisIndex) : 0;
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
