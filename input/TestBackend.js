import { InputBackend } from "./InputBackend.js";
import { InputEvent } from "./InputEvent.js";
import { EventType } from "./EventType.js";
import { Tier } from "./Tier.js";

export class TestBackend extends InputBackend {
  constructor() {
    super();
    this._events = [];
  }

  get name() { return "test"; }

  start() {}
  stop() {}

  poll(queue) {
    for (const { event, tier } of this._events) {
      queue.push(event, tier);
    }
    this._events = [];
  }

  keyDown(key, options = {}) {
    this._events.push({
      event: new InputEvent(EventType.KEY_DOWN, {
        key,
        code: options.code || key,
        repeat: options.repeat || false,
        ctrl: options.ctrl || false,
        shift: options.shift || false,
        alt: options.alt || false,
        meta: options.meta || false,
        printable: key.length === 1,
      }),
      tier: Tier.HIGH,
    });
    return this;
  }

  keyUp(key, options = {}) {
    this._events.push({
      event: new InputEvent(EventType.KEY_UP, {
        key,
        code: options.code || key,
        ctrl: options.ctrl || false,
        shift: options.shift || false,
        alt: options.alt || false,
        meta: options.meta || false,
      }),
      tier: Tier.HIGH,
    });
    return this;
  }

  pointerDown(options = {}) {
    this._events.push({
      event: new InputEvent(EventType.POINTER_DOWN, {
        pointerId: options.pointerId ?? 0,
        x: options.x ?? 0,
        y: options.y ?? 0,
        type: options.type ?? "mouse",
        pressure: options.pressure ?? 0.5,
        tiltX: options.tiltX ?? 0,
        tiltY: options.tiltY ?? 0,
        twist: options.twist ?? 0,
        width: options.width ?? 1,
        height: options.height ?? 1,
        isPrimary: options.isPrimary ?? true,
      }),
      tier: Tier.HIGH,
    });
    return this;
  }

  pointerMove(options = {}) {
    this._events.push({
      event: new InputEvent(EventType.POINTER_MOVE, {
        pointerId: options.pointerId ?? 0,
        x: options.x ?? 0,
        y: options.y ?? 0,
        type: options.type ?? "mouse",
        pressure: options.pressure ?? 0.5,
        tiltX: options.tiltX ?? 0,
        tiltY: options.tiltY ?? 0,
        twist: options.twist ?? 0,
        width: options.width ?? 1,
        height: options.height ?? 1,
        isPrimary: options.isPrimary ?? true,
      }),
      tier: Tier.LOW,
    });
    return this;
  }

  pointerUp(options = {}) {
    this._events.push({
      event: new InputEvent(EventType.POINTER_UP, {
        pointerId: options.pointerId ?? 0,
        x: options.x ?? 0,
        y: options.y ?? 0,
        type: options.type ?? "mouse",
        pressure: options.pressure ?? 0,
        isPrimary: options.isPrimary ?? true,
        cancelled: options.cancelled ?? false,
      }),
      tier: Tier.HIGH,
    });
    return this;
  }

  wheel(options = {}) {
    this._events.push({
      event: new InputEvent(EventType.WHEEL, {
        x: options.x ?? 0,
        y: options.y ?? 0,
        deltaX: options.deltaX ?? 0,
        deltaY: options.deltaY ?? 0,
        deltaZ: options.deltaZ ?? 0,
        deltaMode: options.deltaMode ?? 0,
      }),
      tier: Tier.NORMAL,
    });
    return this;
  }

  clear() {
    this._events = [];
    return this;
  }
}
