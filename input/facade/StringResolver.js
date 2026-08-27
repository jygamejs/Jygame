import { Keyboard } from "../Keyboard.js";
import { Mouse } from "../Mouse.js";
import { Gamepad } from "../Gamepad.js";
import { GestureEngine } from "../GestureEngine.js";
import { GestureType } from "../GestureType.js";
import { ActionKind } from "../ActionKind.js";
import { ActionMap } from "../actions/ActionMap.js";
import { InputContext } from "../actions/InputContext.js";
import { BindingCompiler } from "./BindingCompiler.js";
import { resolveKeyboardIdentifier, resolveGamepadIdentifier, resolveMouseButton, resolveGesture } from "./KeyStrings.js";

export class StringResolver {
  constructor(inputSystem) {
    this._system = inputSystem;
    this._compiler = new BindingCompiler();
  }

  get _devices() {
    return this._system ? this._system.devices : null;
  }

  get _contextStack() {
    return this._system ? this._system.contextStack : null;
  }

  _findActionState(name) {
    const stack = this._contextStack;
    if (!stack) return null;

    const sorted = [...stack._contexts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const ctx of sorted) {
      const state = ctx.actionMap.getState(name);
      if (state) return state;
    }
    return null;
  }

  _queryKeyboard(keyCode, fn) {
    const kb = this._devices ? this._devices.get(Keyboard) : null;
    if (!kb) return false;
    return fn(kb, keyCode);
  }

  // Routes a resolved gamepad identifier ({ kind, gamepadIndex, ... }) to the
  // right query. Buttons are digital with full edges; sticks and scalar axes
  // answer down/value/axis and have no pressed/released edges.
  _queryGamepad(resolved, kind) {
    const gp = this._devices ? this._devices.get(Gamepad) : null;
    if (!gp) return kind === "value" ? 0 : kind === "axis" ? { x: 0, y: 0 } : false;
    const idx = resolved.gamepadIndex ?? 0;

    if (resolved.kind === "button") {
      if (kind === "down") return gp.isDown(idx, resolved.button);
      if (kind === "pressed") return gp.justPressed(idx, resolved.button);
      if (kind === "released") return gp.justReleased(idx, resolved.button);
      if (kind === "value") return gp.value(idx, resolved.button);
      return { x: 0, y: 0 };
    }

    if (resolved.kind === "stick") {
      const v = gp.stick(idx, resolved.side);
      const mag = Math.sqrt(v.x * v.x + v.y * v.y);
      if (kind === "down") return mag > 0;
      if (kind === "value") return Math.min(1, mag);
      if (kind === "axis") return v;
      return false;
    }

    if (resolved.kind === "axis") {
      const v = gp.axis(idx, resolved.axis);
      if (kind === "down") return Math.abs(v) > gp.deadZone;
      if (kind === "value") return Math.min(1, Math.abs(v));
      if (kind === "axis") return { x: v, y: 0 };
      return false;
    }

    return kind === "value" ? 0 : kind === "axis" ? { x: 0, y: 0 } : false;
  }

  _queryMouse(button, fn) {
    const mouse = this._devices ? this._devices.get(Mouse) : null;
    if (!mouse) return false;
    return fn(mouse, button);
  }

  _queryGesture(name, kind) {
    const ge = this._devices ? this._devices.get(GestureEngine) : null;
    if (!ge) return kind === "value" ? 0 : kind === "axis" ? { x: 0, y: 0 } : false;

    const gestureInfo = resolveGesture(name.toUpperCase());
    if (!gestureInfo) return kind === "value" ? 0 : kind === "axis" ? { x: 0, y: 0 } : false;

    const { type, options } = gestureInfo;
    let direction = options.direction || null;

    if (!direction) {
      if (type === GestureType.SWIPE_LEFT) { direction = "left"; }
      else if (type === GestureType.SWIPE_RIGHT) { direction = "right"; }
      else if (type === GestureType.SWIPE_UP) { direction = "up"; }
      else if (type === GestureType.SWIPE_DOWN) { direction = "down"; }
    }

    if (direction) {
      const result = ge.last(GestureType.SWIPE);
      if (!result || !result.delta) return kind === "value" ? 0 : kind === "axis" ? { x: 0, y: 0 } : false;
      const angle = Math.atan2(-result.delta.y, result.delta.x);
      const sectors = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 };
      const target = sectors[direction];
      let diff = Math.abs(angle - target);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      const active = diff < Math.PI / 3;
      if (kind === "pressed" || kind === "down") return active;
      if (kind === "value") return active ? (result.velocity || 1) : 0;
      if (kind === "axis") return active ? { x: result.delta?.x || 0, y: result.delta?.y || 0 } : { x: 0, y: 0 };
      return false;
    }

    const result = ge.last(type);
    if (kind === "pressed") return result !== null;
    if (kind === "down") return result !== null || ge.isActive(type);
    if (kind === "released") return false;
    if (kind === "value") return result ? (result.scale || 1) : 0;
    if (kind === "axis") return result ? { x: result.delta?.x || 0, y: result.delta?.y || 0 } : { x: 0, y: 0 };
    return false;
  }

  down(name) {
    if (!name) return false;
    const upper = name.toUpperCase();

    const state = this._findActionState(name);
    if (state) return state.pressed;

    const resolved = resolveKeyboardIdentifier(name);
    if (resolved && resolved.kind === "physical") {
      return this._queryKeyboard(resolved.keyCode, (kb, code) => kb.isDown(code));
    }

    const gpad = resolveGamepadIdentifier(upper);
    if (gpad) {
      return this._queryGamepad(gpad, "down");
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      return this._queryMouse(mb, (mouse, btn) => mouse.isDown(btn));
    }

    if (resolveGesture(upper)) {
      return this._queryGesture(name, "down");
    }

    if (resolved) {
      return this._queryKeyboard(resolved.key, (kb, key) => kb.isLogicalDown(key));
    }

    return false;
  }

  pressed(name) {
    if (!name) return false;
    const upper = name.toUpperCase();

    const state = this._findActionState(name);
    if (state) return state.justPressed;

    const resolved = resolveKeyboardIdentifier(name);
    if (resolved && resolved.kind === "physical") {
      return this._queryKeyboard(resolved.keyCode, (kb, code) => kb.justPressed(code));
    }

    const gpad = resolveGamepadIdentifier(upper);
    if (gpad) {
      return this._queryGamepad(gpad, "pressed");
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      return this._queryMouse(mb, (mouse, btn) => mouse.justPressed(btn));
    }

    if (resolveGesture(upper)) {
      return this._queryGesture(name, "pressed");
    }

    if (resolved) {
      return this._queryKeyboard(resolved.key, (kb, key) => kb.logicalJustPressed(key));
    }

    return false;
  }

  released(name) {
    if (!name) return false;
    const upper = name.toUpperCase();

    const state = this._findActionState(name);
    if (state) return state.justReleased;

    const resolved = resolveKeyboardIdentifier(name);
    if (resolved && resolved.kind === "physical") {
      return this._queryKeyboard(resolved.keyCode, (kb, code) => kb.justReleased(code));
    }

    const gpad = resolveGamepadIdentifier(upper);
    if (gpad) {
      return this._queryGamepad(gpad, "released");
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      return this._queryMouse(mb, (mouse, btn) => mouse.justReleased(btn));
    }

    if (resolveGesture(upper)) {
      return this._queryGesture(name, "released");
    }

    if (resolved) {
      return this._queryKeyboard(resolved.key, (kb, key) => kb.logicalJustReleased(key));
    }

    return false;
  }

  value(name) {
    if (!name) return 0;
    const upper = name.toUpperCase();

    const state = this._findActionState(name);
    if (state) return state.strength;

    if (upper === "WHEEL") {
      const mouse = this._devices ? this._devices.get(Mouse) : null;
      return mouse ? mouse.wheel : 0;
    }

    const resolved = resolveKeyboardIdentifier(name);
    if (resolved && resolved.kind === "physical") {
      return this._queryKeyboard(resolved.keyCode, (kb, code) => kb.isDown(code) ? 1 : 0);
    }

    const gpad = resolveGamepadIdentifier(upper);
    if (gpad) {
      return this._queryGamepad(gpad, "value");
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      return this._queryMouse(mb, (mouse, btn) => mouse.isDown(btn) ? 1 : 0);
    }

    if (resolveGesture(upper)) {
      return this._queryGesture(name, "value");
    }

    if (resolved) {
      return this._queryKeyboard(resolved.key, (kb, key) => kb.isLogicalDown(key) ? 1 : 0);
    }

    return 0;
  }

  axis(name) {
    if (!name) return { x: 0, y: 0 };

    const state = this._findActionState(name);
    if (state) {
      if (state.kind === ActionKind.VECTOR2) {
        return { x: state.vector.x, y: state.vector.y };
      }
      return { x: 0, y: 0 };
    }

    const gpad = resolveGamepadIdentifier(name.toUpperCase());
    if (gpad) {
      return this._queryGamepad(gpad, "axis");
    }

    const gestureResult = this._queryGesture(name, "axis");
    if (typeof gestureResult === "object" && gestureResult !== null) {
      return gestureResult;
    }

    return { x: 0, y: 0 };
  }

  bind(name, binding) {
    if (!this._system || !this._system.contextStack) return;

    this._compiler._compileOne(this._getOrCreateActionMap(), name, binding);
  }

  unbind(name) {
    if (!this._system || !this._system.contextStack) return;

    for (const ctx of this._system.contextStack._contexts) {
      ctx.actionMap.remove(name);
    }
  }

  addBinding(name, binding) {
    if (!this._system || !this._system.contextStack) return;

    for (const ctx of this._system.contextStack._contexts) {
      const existing = ctx.actionMap.getState(name);
      if (existing) {
        this._compiler._compileOne(ctx.actionMap, name, binding);
        return;
      }
    }

    this.bind(name, binding);
  }

  removeBinding(name, binding) {
    if (!this._system || !this._system.contextStack) return;

    if (typeof binding === "string") {
      const resolved = resolveKeyboardIdentifier(binding);
      if (!resolved) return;

      for (const ctx of this._system.contextStack._contexts) {
        const bindings = ctx.actionMap.getBindings(name);
        for (const b of bindings) {
          const matches = resolved.kind === "physical"
            ? b.keyCode === resolved.keyCode
            : b.key === resolved.key;
          if (matches) {
            ctx.actionMap.removeBinding(name, b);
            return;
          }
        }
      }
    }
  }

  buffer(name, ms) {
    if (!this._system || !this._system.contextStack) return;

    const stack = this._system.contextStack;
    const sorted = [...stack._contexts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const ctx of sorted) {
      const st = ctx.actionMap.getState(name);
      if (st) {
        st.buffer(ms);
        return;
      }
    }
  }

  buffered(name) {
    if (!this._system || !this._system.contextStack) return false;
    const state = this._findActionState(name);
    if (!state) return false;
    return state.isBuffered;
  }

  consumeBuffered(name) {
    if (!this._system || !this._system.contextStack) return false;
    const stack = this._system.contextStack;
    const sorted = [...stack._contexts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const ctx of sorted) {
      const st = ctx.actionMap.getState(name);
      if (st) return st.consumeBuffered();
    }
    return false;
  }

  bindings() {
    const result = {};
    if (!this._system || !this._system.contextStack) return result;

    for (const ctx of this._system.contextStack._contexts) {
      for (const entry of ctx.actionMap.entries()) {
        result[entry.name] = entry.bindings.map(b => {
          if (b.type === "key") return { type: "key", keyCode: b.keyCode, ...(b.key != null ? { key: b.key } : {}) };
          if (b.type === "composite") return { type: "composite", kind: b.kind, subBindings: b.subBindings };
          if (b.type === "chord") return { type: "chord", keyCode: b.keyCode, ...(b.key != null ? { key: b.key } : {}) };
          return { type: b.type };
        });
      }
    }

    return result;
  }

  _getOrCreateActionMap() {
    if (!this._system || !this._system.contextStack) return null;

    const stack = this._system.contextStack;
    const top = stack._contexts[stack._contexts.length - 1];
    if (top) return top.actionMap;

    const map = new ActionMap();
    const ctx = new InputContext("runtime", map, { priority: -50 });
    stack.push(ctx);
    return map;
  }
}
