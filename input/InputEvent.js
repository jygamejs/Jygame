function inferDevice(type, data) {
  if (data && typeof data.device === "string") return data.device;
  switch (type) {
    case "keydown":
    case "keyup":
      return "keyboard";
    case "pointerdown":
    case "pointerup":
    case "pointermove":
      return data?.type || "pointer";
    case "wheel":
      return "mouse";
    case "gesture":
      return "gesture";
    case "gamepadconnected":
    case "gamepaddisconnected":
    case "gamepadbuttondown":
    case "gamepadbuttonup":
    case "gamepadaxis":
      return "gamepad";
    case "compositionstart":
    case "compositionupdate":
    case "compositionend":
    case "textinput":
      return "keyboard";
    default:
      return data?.device || "unknown";
  }
}

export class InputEvent {
  constructor(type, data = {}) {
    this._type = type;
    this._data = data;
    this._consumed = false;
    const ts = data && typeof data.timestamp === "number" ? data.timestamp : performance.now();
    this._timestamp = ts;
    this._device = inferDevice(type, data);
  }

  get type() { return this._type; }
  get data() { return this._data; }
  get device() { return this._device; }
  get timestamp() { return this._timestamp; }
  get consumed() { return this._consumed; }

  consume() { this._consumed = true; }
}
