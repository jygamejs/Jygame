import { Device } from "./Device.js";
import { GamepadState } from "./GamepadState.js";
import { GamepadButton } from "./GamepadButton.js";
import { GamepadAxis } from "./GamepadAxis.js";
import { InputEvent } from "./InputEvent.js";
import { EventType } from "./EventType.js";
import { Tier } from "./Tier.js";

// The Gamepad device. The Web Gamepad API is poll-based — the browser only
// hands back controller state via navigator.getGamepads() — so unlike the
// keyboard and mouse this device reads the raw snapshots itself in update()
// and diffs them into button edges, exactly the way GestureEngine derives
// gestures from the pointer manager.
//
// The read source is injectable: `new Gamepad(() => pads)` for tests, a host
// that provides getGamepads(), or the browser default.
export class Gamepad extends Device {
  constructor(source = null, options = {}) {
    super();
    if (typeof source === "function") {
      this._source = source;
      this._host = null;
    } else {
      this._host = source;
      this._source = null;
    }
    this._max = options.max ?? 4;
    this._deadZone = options.deadZone ?? 0.2;
    this._axisMoveThreshold = options.axisMoveThreshold ?? 0.05;
    this._enabled = options.enabled ?? true;
    this._minAxis = 0;
    this._minButtons = 0;
    this._listeners = new Map();
    this._states = [];
    this._present = new Uint8Array(this._max);
    for (let i = 0; i < this._max; i++) {
      this._states.push(new GamepadState());
    }
  }

  get type() { return Gamepad; }
  get max() { return this._max; }
  get deadZone() { return this._deadZone; }

  // Polling is a per-frame cost the game may not need. enabled defaults to
  // true (gamepads just work), but flipping it off stops the getGamepads()
  // poll entirely and disconnects any tracked pads.
  get enabled() { return this._enabled; }
  set enabled(value) {
    this._enabled = !!value;
    if (!this._enabled) {
      for (const s of this._states) s.disconnect();
    }
  }

  // The absolute axis value at which "axis" events start firing (idle sticks
  // can report small values even when untouched).
  get axisMoveThreshold() { return this._axisMoveThreshold; }
  set axisMoveThreshold(value) { this._axisMoveThreshold = value; }

  // Filters out devices the browser reports as gamepads but a game does not
  // want (touchpads, mice, web cameras). A pad that fails the minimums is
  // treated as absent.
  setMinimumGamepadConfiguration({ axis = 0, buttons = 0 } = {}) {
    this._minAxis = axis;
    this._minButtons = buttons;
  }

  // Subscription surface. on(type, cb) returns an unsubscribe function.
  // Types: "connect", "disconnect", "button", "axis".
  on(type, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("callback must be a function");
    }
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    const set = this._listeners.get(type);
    set.add(callback);
    return () => set.delete(callback);
  }

  _emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set || set.size === 0) return;
    for (const cb of [...set]) cb(payload);
  }

  // Number of connected gamepads.
  get count() {
    if (!this._enabled) return 0;
    let n = 0;
    for (const s of this._states) {
      if (s.connected) n++;
    }
    return n;
  }

  get(index) {
    return this._states[index] ?? null;
  }

  isConnected(index) {
    return this._enabled && this._stateAt(index)?.connected === true;
  }

  _stateAt(index) {
    if (!this._enabled) return null;
    const s = this._states[index];
    return s && s.connected ? s : null;
  }

  // Digital press. With a threshold, a button counts as down when its analog
  // value reaches it; otherwise the browser's own pressed flag is used.
  isDown(index, button, threshold) {
    const s = this._stateAt(index);
    if (!s) return false;
    if (threshold !== undefined) return s.value(button) >= threshold;
    return s.isDown(button);
  }

  justPressed(index, button) {
    const s = this._stateAt(index);
    return !!s && s.justPressed(button);
  }

  justReleased(index, button) {
    const s = this._stateAt(index);
    return !!s && s.justReleased(button);
  }

  // Analog button value, 0..1 (triggers). With a threshold the value is
  // suppressed below it, so idle drift reads as 0.
  value(index, button, threshold) {
    const s = this._stateAt(index);
    if (!s) return 0;
    const v = s.value(button);
    if (threshold !== undefined && v < threshold) return 0;
    return v;
  }

  // Raw axis position, -1..1. With a threshold values inside it read as 0.
  axis(index, axisIndex, threshold) {
    const s = this._stateAt(index);
    if (!s) return 0;
    const v = s.axis(axisIndex);
    if (threshold !== undefined && Math.abs(v) < threshold) return 0;
    return v;
  }

  // Dead-zoned stick vector for "left" or "right". The radial dead zone
  // scales the surviving magnitude so the vector ramps from 0 smoothly
  // instead of jumping in from the edge of the dead zone.
  stick(index, side) {
    const x = this.axis(index, side === "right" ? GamepadAxis.RIGHT_X : GamepadAxis.LEFT_X);
    const y = this.axis(index, side === "right" ? GamepadAxis.RIGHT_Y : GamepadAxis.LEFT_Y);
    const mag = Math.sqrt(x * x + y * y);
    const dz = this._deadZone;
    if (mag <= dz || mag === 0) return { x: 0, y: 0 };
    const scaled = (mag - dz) / (1 - dz);
    return { x: (x / mag) * scaled, y: (y / mag) * scaled };
  }

  snapshot() {
    for (const s of this._states) {
      if (s.connected) s.snapshot();
    }
  }

  update(queue) {
    if (!this._enabled) return;
    this.snapshot();

    const pads = this._read() || [];
    this._present.fill(0);

    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || pad.connected === false) continue;
      if (!this._meetsMinimum(pad)) continue;
      const idx = typeof pad.index === "number" ? pad.index : i;
      if (idx < 0 || idx >= this._max) continue;

      const state = this._states[idx];
      this._present[idx] = 1;

      if (!state.connected) {
        state.connect(pad.id ?? "", pad.mapping ?? "", idx);
        const payload = { gamepadIndex: idx, id: pad.id ?? "", mapping: pad.mapping ?? "" };
        queue.push(new InputEvent(EventType.GAMEPAD_CONNECTED, payload), Tier.HIGH);
        this._emit("connect", payload);
      }

      this._syncPad(state, pad, queue);
    }

    for (let i = 0; i < this._max; i++) {
      const state = this._states[i];
      if (state.connected && this._present[i] === 0) {
        state.disconnect();
        const payload = { gamepadIndex: i };
        queue.push(new InputEvent(EventType.GAMEPAD_DISCONNECTED, payload), Tier.HIGH);
        this._emit("disconnect", payload);
      }
    }
  }

  _meetsMinimum(pad) {
    if (this._minButtons > 0 && (pad.buttons?.length ?? 0) < this._minButtons) return false;
    if (this._minAxis > 0 && (pad.axes?.length ?? 0) < this._minAxis) return false;
    return true;
  }

  _syncPad(state, pad, queue) {
    const buttons = pad.buttons || [];
    for (let b = 0; b < GamepadButton.BUTTON_COUNT; b++) {
      const raw = buttons[b] || { pressed: false, value: 0 };
      const pressed = !!raw.pressed;
      const value = typeof raw.value === "number" ? raw.value : pressed ? 1 : 0;
      state.setValue(b, value);
      if (pressed && !state.isDown(b)) {
        state.press(b);
        const payload = { gamepadIndex: state.index, button: b, value, pressed: true };
        queue.push(new InputEvent(EventType.GAMEPAD_BUTTON_DOWN, payload), Tier.HIGH);
        this._emit("button", payload);
      } else if (!pressed && state.isDown(b)) {
        state.release(b);
        const payload = { gamepadIndex: state.index, button: b, value, pressed: false };
        queue.push(new InputEvent(EventType.GAMEPAD_BUTTON_UP, payload), Tier.HIGH);
        this._emit("button", payload);
      }
    }

    const axes = pad.axes || [];
    for (let a = 0; a < GamepadAxis.AXIS_COUNT; a++) {
      const v = typeof axes[a] === "number" ? axes[a] : 0;
      state.setAxis(a, v);
      // "axis" events fire when a stick leaves the move threshold, and again
      // whenever the value changes past it — not while it sits still.
      if (Math.abs(v) >= this._axisMoveThreshold && v !== state._axisEventValue[a]) {
        state._axisEventValue[a] = v;
        const payload = { gamepadIndex: state.index, axis: a, value: v };
        queue.push(new InputEvent(EventType.GAMEPAD_AXIS, payload), Tier.NORMAL);
        this._emit("axis", payload);
      }
    }
  }

  _read() {
    if (this._source) return this._source();
    if (this._host && typeof this._host.getGamepads === "function") {
      return this._host.getGamepads();
    }
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      return navigator.getGamepads();
    }
    return [];
  }
}
