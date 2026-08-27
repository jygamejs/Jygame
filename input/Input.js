import { StringResolver } from "./facade/StringResolver.js";
import { PointerFacade } from "./facade/PointerFacade.js";
import { TouchFacade } from "./facade/TouchFacade.js";
import { GamepadFacade } from "./facade/GamepadFacade.js";
import { GestureDispatcher } from "./GestureDispatcher.js";
import { GestureType } from "./GestureType.js";
import { Mouse } from "./Mouse.js";
import { EventType } from "./EventType.js";
import { KeyCode } from "./KeyCode.js";
import { resolveKeyboardIdentifier, resolveGamepadIdentifier, resolveMouseButton } from "./facade/KeyStrings.js";
import { Keyboard } from "./Keyboard.js";
import { ActionKind } from "./ActionKind.js";
import { HistoryBuffer } from "./HistoryBuffer.js";

// The single input facade. Everything here resolves through the InputSystem
// (devices, context stack, action maps).
//
// This used to be a hybrid: half of it delegated to a second, legacy
// InputContext that did its own DOM listening and key tracking in parallel
// with the modern system. Both ran every frame. That legacy half is gone —
// see input/actions/ for bindings and contexts.
let _system = null;
let _resolver = null;
let _pointerFacade = null;
let _touchFacade = null;
let _gamepadFacade = null;
let _gestures = new GestureDispatcher(null);

function getResolver() {
  if (!_resolver) _resolver = new StringResolver(_system);
  return _resolver;
}

function getPointer() {
  if (!_pointerFacade) _pointerFacade = new PointerFacade(_system);
  return _pointerFacade;
}

function getTouch() {
  if (!_touchFacade) _touchFacade = new TouchFacade(_system);
  return _touchFacade;
}

function getGamepad() {
  if (!_gamepadFacade) _gamepadFacade = new GamepadFacade(_system);
  return _gamepadFacade;
}

function getSnapshot() {
  return _system ? _system.eventSnapshot : Object.freeze([]);
}

function isPressEvent(e) {
  if (e.type === EventType.KEY_DOWN) return !e.data.repeat;
  if (e.type === EventType.POINTER_DOWN) return true;
  if (e.type === EventType.GAMEPAD_BUTTON_DOWN) return true;
  return false;
}

function isReleaseEvent(e) {
  if (e.type === EventType.KEY_UP) return true;
  if (e.type === EventType.POINTER_UP) return true;
  if (e.type === EventType.GAMEPAD_BUTTON_UP) return true;
  return false;
}

function isKeyboardPress(e) {
  return e.type === EventType.KEY_DOWN && !e.data.repeat && e.device === "keyboard";
}
function isKeyboardRelease(e) {
  return e.type === EventType.KEY_UP && e.device === "keyboard";
}

function keyBindingMatchesEvent(binding, e) {
  if (e.type !== EventType.KEY_DOWN || e.data.repeat) return false;
  if (e.device !== "keyboard") return false;
  if (binding.isLogical) return e.data.key === binding.key;
  const code = KeyCode.fromDOMCode(e.data.code);
  return code === binding.keyCode;
}
function chordMatchesEvent(binding, e) {
  if (e.type !== EventType.KEY_DOWN || e.data.repeat) return false;
  if (e.device !== "keyboard") return false;
  if (binding._ctrl && !e.data.ctrl) return false;
  if (binding._shift && !e.data.shift) return false;
  if (binding._alt && !e.data.alt) return false;
  if (binding._meta && !e.data.meta) return false;
  if (binding.isLogical) return e.data.key === binding.key;
  const code = KeyCode.fromDOMCode(e.data.code);
  return code === binding.keyCode;
}
function gamepadButtonMatchesEvent(binding, e) {
  if (e.type !== EventType.GAMEPAD_BUTTON_DOWN) return false;
  return e.data.button === binding.button && (e.data.gamepadIndex ?? 0) === binding.gamepadIndex;
}
function mouseButtonMatchesEvent(binding, e) {
  if (e.type !== EventType.POINTER_DOWN) return false;
  return e.data.button === binding.button;
}
function bindingMatchesEvent(binding, e) {
  const t = binding.type;
  if (t === "key") return { matched: keyBindingMatchesEvent(binding, e) };
  if (t === "chord") return { matched: chordMatchesEvent(binding, e) };
  if (t === "gamepadButton") return { matched: gamepadButtonMatchesEvent(binding, e) };
  if (t === "mouseButton") return { matched: mouseButtonMatchesEvent(binding, e) };
  if (t === "composite") {
    for (const sb of binding.subBindings) {
      const inner = bindingMatchesEvent(sb.binding, e);
      if (inner.matched) return { matched: true, vector: sb.vector };
    }
    return { matched: false };
  }
  return { matched: false };
}

function eventMatchesRawIdentifier(e, name) {
  const upper = name.toUpperCase();
  const kbResolved = resolveKeyboardIdentifier(name);
  if (kbResolved) {
    if (kbResolved.kind === "physical") {
      if (!isKeyboardPress(e)) return false;
      const code = KeyCode.fromDOMCode(e.data.code);
      return code === kbResolved.keyCode;
    } else {
      if (!isKeyboardPress(e)) return false;
      return e.data.key === kbResolved.key;
    }
  }
  const gpad = resolveGamepadIdentifier(upper);
  if (gpad) {
    if (gpad.kind === "button") {
      return e.type === EventType.GAMEPAD_BUTTON_DOWN && e.data.button === gpad.button && (e.data.gamepadIndex ?? 0) === gpad.gamepadIndex;
    }
    return false;
  }
  const mb = resolveMouseButton(upper);
  if (mb !== null) {
    return e.type === EventType.POINTER_DOWN && e.data.button === mb;
  }
  return false;
}

let _keyboardFacade = null;
function getKeyboardFacade() {
  if (_keyboardFacade) return _keyboardFacade;
  _keyboardFacade = {
    get lastPressed() {
      const snap = getSnapshot();
      for (let i = snap.length - 1; i >= 0; i--) {
        const e = snap[i];
        if (isKeyboardPress(e)) {
          return { code: e.data.code, key: e.data.key, timestamp: e.timestamp, device: e.device, type: e.type, data: e.data };
        }
      }
      return null;
    },
    get lastReleased() {
      const snap = getSnapshot();
      for (let i = snap.length - 1; i >= 0; i--) {
        const e = snap[i];
        if (isKeyboardRelease(e)) {
          return { code: e.data.code, key: e.data.key, timestamp: e.timestamp, device: e.device, type: e.type, data: e.data };
        }
      }
      return null;
    },
  };
  return _keyboardFacade;
}

const _queues = new Map();
const _queuesSeen = new Map();
const _queueCapacity = 16;

function getOrCreateQueue(name) {
  if (!_queues.has(name)) {
    _queues.set(name, new HistoryBuffer(_queueCapacity));
    _queuesSeen.set(name, new WeakSet());
  }
  return _queues.get(name);
}

function enqueuePendingForQueue(name) {
  const queue = _queues.get(name);
  if (!queue) return;
  const seen = _queuesSeen.get(name);
  const hist = _system ? _system.historySnapshot : getSnapshot();
  const stack = _system ? _system.contextStack : null;
  let actionState = null;
  let actionBindings = null;
  let actionKind = null;
  let isAction = false;
  if (stack) {
    const sorted = [...stack._contexts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const ctx of sorted) {
      const st = ctx.actionMap.getState(name);
      if (st) {
        actionState = st;
        actionBindings = ctx.actionMap.getBindings(name);
        actionKind = st.kind;
        isAction = true;
        break;
      }
    }
  }
  for (const ev of hist) {
    if (!isPressEvent(ev)) continue;
    if (seen.has(ev)) continue;
    let matched = false;
    let matchedVector = null;
    if (isAction) {
      for (const b of actionBindings) {
        const m = bindingMatchesEvent(b, ev);
        if (m.matched) {
          matched = true;
          if (m.vector) matchedVector = m.vector;
          break;
        }
      }
      if (matched) {
        if (actionKind === ActionKind.VECTOR2 && matchedVector) {
          queue.push({ x: matchedVector[0], y: matchedVector[1], timestamp: ev.timestamp });
        } else if (actionKind === ActionKind.VECTOR2) {
          queue.push({ x: 0, y: 0, timestamp: ev.timestamp });
        } else {
          queue.push({ timestamp: ev.timestamp, code: ev.data.code, key: ev.data.key, device: ev.device, type: ev.type });
        }
        seen.add(ev);
      }
    } else {
      if (eventMatchesRawIdentifier(ev, name)) {
        queue.push({ timestamp: ev.timestamp, code: ev.data.code, key: ev.data.key, device: ev.device, type: ev.type, data: ev.data });
        seen.add(ev);
      }
    }
  }
}

export const Input = {
  setSystem(system) {
    _system = system;
    _resolver = new StringResolver(system);
    _pointerFacade = new PointerFacade(system);
    _touchFacade = new TouchFacade(system);
    _gamepadFacade = new GamepadFacade(system);
    _gestures.setSystem(system);
    _queues.clear();
    _queuesSeen.clear();
  },

  getSystem() {
    return _system;
  },

  get raw() {
    return _system ? {
      devices: _system.devices,
      contextStack: _system.contextStack,
      events: _system.events,
      backend: _system.backend,
      coordinateSystem: _system.coordinateSystem,
      get actionMap() {
        const active = _system.contextStack?.active;
        return active ? active.actionMap : null;
      },
    } : null;
  },

  down(name) {
    return getResolver().down(name);
  },

  pressed(name) {
    return getResolver().pressed(name);
  },

  released(name) {
    return getResolver().released(name);
  },

  value(name) {
    return getResolver().value(name);
  },

  axis(name) {
    return getResolver().axis(name);
  },

  bind(name, binding) {
    getResolver().bind(name, binding);
  },

  unbind(name) {
    getResolver().unbind(name);
  },

  addBinding(name, binding) {
    getResolver().addBinding(name, binding);
  },

  removeBinding(name, binding) {
    getResolver().removeBinding(name, binding);
  },

  buffer(name, ms) {
    getResolver().buffer(name, ms);
  },

  buffered(name) {
    return getResolver().buffered(name);
  },

  consumeBuffered(name) {
    return getResolver().consumeBuffered(name);
  },

  bindings() {
    return getResolver().bindings();
  },

  events() {
    return getSnapshot();
  },

  presses(name) {
    if (!name) return Object.freeze([]);
    const snap = getSnapshot();
    if (snap.length === 0) return Object.freeze([]);
    const upper = name.toUpperCase();
    const stack = _system ? _system.contextStack : null;
    let actionState = null;
    let actionBindings = null;
    let actionKind = null;
    if (stack) {
      const sorted = [...stack._contexts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      for (const ctx of sorted) {
        const st = ctx.actionMap.getState(name);
        if (st) {
          actionState = st;
          actionBindings = ctx.actionMap.getBindings(name);
          actionKind = st.kind;
          break;
        }
      }
    }
    if (actionState) {
      const result = [];
      for (const ev of snap) {
        if (!isPressEvent(ev)) continue;
        let matchedVector = null;
        let matched = false;
        for (const b of actionBindings) {
          const m = bindingMatchesEvent(b, ev);
          if (m.matched) {
            matched = true;
            if (m.vector) matchedVector = m.vector;
            break;
          }
        }
        if (matched) {
          if (actionKind === ActionKind.VECTOR2 && matchedVector) {
            result.push({ x: matchedVector[0], y: matchedVector[1] });
          } else if (actionKind === ActionKind.VECTOR2) {
            result.push({ x: 0, y: 0 });
          } else {
            result.push({ timestamp: ev.timestamp, code: ev.data.code, key: ev.data.key, device: ev.device, type: ev.type });
          }
        }
      }
      return Object.freeze(result);
    }
    const result = [];
    for (const ev of snap) {
      if (!isPressEvent(ev)) continue;
      if (eventMatchesRawIdentifier(ev, name)) {
        result.push(ev);
      }
    }
    return Object.freeze(result);
  },

  anyPressed() {
    const snap = getSnapshot();
    for (const e of snap) if (isKeyboardPress(e)) return true;
    return false;
  },

  anyDown() {
    const kb = _system ? _system.devices.get(Keyboard) : null;
    return kb ? kb.anyDown() : false;
  },

  anyReleased() {
    const snap = getSnapshot();
    for (const e of snap) if (isKeyboardRelease(e)) return true;
    return false;
  },

  get keyboard() {
    return getKeyboardFacade();
  },

  history(limitOrOptions) {
    if (!_system) return Object.freeze([]);
    const snap = _system.historySnapshot;
    if (limitOrOptions == null) return snap;
    if (typeof limitOrOptions === "number") {
      if (limitOrOptions <= 0) return Object.freeze([]);
      if (limitOrOptions >= snap.length) return snap;
      return Object.freeze(snap.slice(snap.length - limitOrOptions));
    }
    if (typeof limitOrOptions === "object") {
      if (typeof limitOrOptions.within === "number") {
        const cutoff = performance.now() - limitOrOptions.within;
        const filtered = snap.filter(e => e.timestamp >= cutoff);
        return Object.freeze(filtered);
      }
      if (typeof limitOrOptions.limit === "number") {
        const n = limitOrOptions.limit;
        if (n <= 0) return Object.freeze([]);
        if (n >= snap.length) return snap;
        return Object.freeze(snap.slice(snap.length - n));
      }
    }
    return snap;
  },

  queue(name) {
    if (!name) return Object.freeze([]);
    getOrCreateQueue(name);
    enqueuePendingForQueue(name);
    const q = _queues.get(name);
    return q ? q.snapshot() : Object.freeze([]);
  },

  next(name) {
    if (!name) return null;
    getOrCreateQueue(name);
    enqueuePendingForQueue(name);
    const q = _queues.get(name);
    if (!q || q.length === 0) return null;
    return q.shift();
  },

  get pointer() {
    return getPointer();
  },

  get touch() {
    return getTouch();
  },

  get gamepad() {
    return getGamepad();
  },

  get gestures() {
    return _gestures;
  },

  // Callback sugar over the gesture recognizers. Both return an unsubscribe
  // function. For anything beyond tap and swipe, use Input.gestures.on(type)
  // or bind a GestureBinding through an ActionMap.
  onTap(cb) {
    return _gestures.on(GestureType.TAP, cb);
  },

  onSwipe(cb) {
    return _gestures.on(GestureType.SWIPE, cb);
  },

  removeTap(cb) {
    _gestures.off(GestureType.TAP, cb);
  },

  removeSwipe(cb) {
    _gestures.off(GestureType.SWIPE, cb);
  },

  get wheel() {
    const mouse = _system ? _system.devices.get(Mouse) : null;
    return mouse ? mouse.wheel : 0;
  },

  get wheelX() {
    const mouse = _system ? _system.devices.get(Mouse) : null;
    return mouse ? mouse.wheelHorizontal : 0;
  },
};
