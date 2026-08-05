import { GestureType } from "./GestureType.js";
import { GestureEngine } from "./GestureEngine.js";

// GestureEngine is poll-only: it publishes the gestures recognized during the
// last update and callers ask for them by type. That suits per-frame game code
// but not the callback style Scene.onTap/onSwipe exposes, which used to be
// served by the legacy InputContext's own pointer tracking.
//
// This bridges the two: poll() runs once per frame after InputSystem.update()
// and fans out whatever the engine recognized to registered listeners. It
// holds no pointer state of its own — all recognition still happens in the
// modern recognizers.
export class GestureDispatcher {
  constructor(inputSystem = null) {
    this._system = inputSystem;
    this._listeners = new Map();
  }

  setSystem(system) {
    this._system = system;
  }

  get _engine() {
    if (!this._system || !this._system.devices) return null;
    return this._system.devices.get(GestureEngine) || null;
  }

  // Returns an unsubscribe function, matching the old Input.onTap/onSwipe
  // contract that Scene relies on for its cleanup list.
  on(type, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("GestureDispatcher.on(): callback must be a function.");
    }
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(callback);
    return () => this.off(type, callback);
  }

  off(type, callback) {
    const set = this._listeners.get(type);
    if (set) set.delete(callback);
  }

  clear() {
    this._listeners.clear();
  }

  get listenerCount() {
    let n = 0;
    for (const set of this._listeners.values()) n += set.size;
    return n;
  }

  // Called once per frame by the Game, after InputSystem.update() has run the
  // recognizers. Cheap no-op when nothing is subscribed, which is the common
  // case — most games never register a gesture callback.
  poll() {
    if (this._listeners.size === 0) return;
    const engine = this._engine;
    if (!engine) return;

    for (const [type, set] of this._listeners) {
      if (set.size === 0) continue;
      const result = engine.last(type);
      if (!result) continue;
      for (const cb of set) {
        try {
          cb(this._payload(type, result));
        } catch (err) {
          console.error(`[jygame] Gesture listener for "${type}" threw.`, err);
        }
      }
    }
  }

  // Tap and swipe keep the payload shape their old callbacks used, so existing
  // Scene.onTap/onSwipe code keeps working: tap receives {x, y, pointerId} and
  // swipe receives a direction string. Every other gesture type gets the
  // GestureEvent itself, which carries position, delta, velocity and duration.
  _payload(type, result) {
    if (type === GestureType.TAP) {
      const pos = result.position || { x: 0, y: 0 };
      const ids = result.pointerIds || [];
      return { x: pos.x, y: pos.y, pointerId: ids.length > 0 ? ids[0] : null };
    }
    if (type === GestureType.SWIPE) {
      return GestureDispatcher.swipeDirection(result);
    }
    return result;
  }

  static swipeDirection(result) {
    const d = result && result.delta ? result.delta : { x: 0, y: 0 };
    return Math.abs(d.x) > Math.abs(d.y)
      ? (d.x > 0 ? "RIGHT" : "LEFT")
      : (d.y > 0 ? "DOWN" : "UP");
  }
}
