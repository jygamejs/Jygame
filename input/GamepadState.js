import { GamepadButton } from "./GamepadButton.js";
import { GamepadAxis } from "./GamepadAxis.js";

// Per-gamepad state. Mirrors the Keyboard/Mouse pattern: digital button
// arrays for edges (current + previous), plus the analog button values and
// axis positions the device feeds in from each poll.
export class GamepadState {
  constructor() {
    this._buttons = new Uint8Array(GamepadButton.BUTTON_COUNT);
    this._prevButtons = new Uint8Array(GamepadButton.BUTTON_COUNT);
    this._values = new Float32Array(GamepadButton.BUTTON_COUNT);
    this._axes = new Float32Array(GamepadAxis.AXIS_COUNT);
    this._connected = false;
    this._id = null;
    this._mapping = "";
    this._index = -1;
  }

  get connected() { return this._connected; }
  get id() { return this._id; }
  get mapping() { return this._mapping; }
  get index() { return this._index; }

  connect(id, mapping = "", index = 0) {
    this._buttons.fill(0);
    this._prevButtons.fill(0);
    this._values.fill(0);
    this._axes.fill(0);
    this._connected = true;
    this._id = id;
    this._mapping = mapping;
    this._index = index;
  }

  disconnect() {
    this._connected = false;
    this._id = null;
    this._mapping = "";
    this._buttons.fill(0);
    this._values.fill(0);
    this._axes.fill(0);
  }

  isDown(button) {
    return this._buttons[button] === 1;
  }

  justPressed(button) {
    return this._buttons[button] === 1 && this._prevButtons[button] === 0;
  }

  justReleased(button) {
    return this._buttons[button] === 0 && this._prevButtons[button] === 1;
  }

  // Analog button value, 0..1 (meaningful for triggers).
  value(button) {
    return this._values[button];
  }

  axis(axisIndex) {
    return this._axes[axisIndex];
  }

  setValue(button, value) {
    if (button < 0 || button >= this._values.length) return;
    this._values[button] = value;
  }

  setAxis(axisIndex, value) {
    if (axisIndex < 0 || axisIndex >= this._axes.length) return;
    this._axes[axisIndex] = value;
  }

  press(button) {
    if (button < 0 || button >= this._buttons.length) return;
    this._buttons[button] = 1;
  }

  release(button) {
    if (button < 0 || button >= this._buttons.length) return;
    this._buttons[button] = 0;
  }

  snapshot() {
    this._prevButtons.set(this._buttons);
  }
}
