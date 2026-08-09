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
    this._states = [];
    this._present = new Uint8Array(this._max);
    for (let i = 0; i < this._max; i++) {
      this._states.push(new GamepadState());
    }
  }

  get type() { return Gamepad; }
  get max() { return this._max; }
  get deadZone() { return this._deadZone; }

  // Number of connected gamepads.
  get count() {
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
    const s = this._states[index];
    return !!s && s.connected;
  }

  isDown(index, button) {
    const s = this._states[index];
    return !!s && s.connected && s.isDown(button);
  }

  justPressed(index, button) {
    const s = this._states[index];
    return !!s && s.connected && s.justPressed(button);
  }

  justReleased(index, button) {
    const s = this._states[index];
    return !!s && s.connected && s.justReleased(button);
  }

  // Analog button value, 0..1 (triggers).
  value(index, button) {
    const s = this._states[index];
    return !!s && s.connected ? s.value(button) : 0;
  }

  // Raw axis position, -1..1.
  axis(index, axisIndex) {
    const s = this._states[index];
    return !!s && s.connected ? s.axis(axisIndex) : 0;
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
    this.snapshot();

    const pads = this._read() || [];
    this._present.fill(0);

    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || pad.connected === false) continue;
      const idx = typeof pad.index === "number" ? pad.index : i;
      if (idx < 0 || idx >= this._max) continue;

      const state = this._states[idx];
      this._present[idx] = 1;

      if (!state.connected) {
        state.connect(pad.id ?? "", pad.mapping ?? "", idx);
        queue.push(new InputEvent(EventType.GAMEPAD_CONNECTED, {
          gamepadIndex: idx,
          id: pad.id ?? "",
          mapping: pad.mapping ?? "",
        }), Tier.HIGH);
      }

      this._syncPad(state, pad, queue);
    }

    for (let i = 0; i < this._max; i++) {
      const state = this._states[i];
      if (state.connected && this._present[i] === 0) {
        state.disconnect();
        queue.push(new InputEvent(EventType.GAMEPAD_DISCONNECTED, {
          gamepadIndex: i,
        }), Tier.HIGH);
      }
    }
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
        queue.push(new InputEvent(EventType.GAMEPAD_BUTTON_DOWN, {
          gamepadIndex: state.index,
          button: b,
          value,
        }), Tier.HIGH);
      } else if (!pressed && state.isDown(b)) {
        state.release(b);
        queue.push(new InputEvent(EventType.GAMEPAD_BUTTON_UP, {
          gamepadIndex: state.index,
          button: b,
        }), Tier.HIGH);
      }
    }

    const axes = pad.axes || [];
    for (let a = 0; a < GamepadAxis.AXIS_COUNT; a++) {
      state.setAxis(a, typeof axes[a] === "number" ? axes[a] : 0);
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
