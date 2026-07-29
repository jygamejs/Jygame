import { Keyboard } from "../Keyboard.js";
import { Mouse } from "../Mouse.js";
import { GestureEngine } from "../GestureEngine.js";
import { ActionKind } from "../ActionKind.js";
import { ActionMap } from "../actions/ActionMap.js";
import { InputContext } from "../actions/InputContext.js";
import { BindingCompiler } from "./BindingCompiler.js";
import { resolveKeyCode, resolveMouseButton } from "./KeyStrings.js";

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

    for (const ctx of stack._contexts) {
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

  _queryMouse(button, fn) {
    const mouse = this._devices ? this._devices.get(Mouse) : null;
    if (!mouse) return false;
    return fn(mouse, button);
  }

  down(name) {
    if (!name) return false;
    const upper = name.toUpperCase();

    const state = this._findActionState(name);
    if (state) return state.pressed;

    const kc = resolveKeyCode(upper);
    if (kc !== null) {
      return this._queryKeyboard(kc, (kb, code) => kb.isDown(code));
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      return this._queryMouse(mb, (mouse, btn) => mouse.isDown(btn));
    }

    return false;
  }

  pressed(name) {
    if (!name) return false;
    const upper = name.toUpperCase();

    const state = this._findActionState(name);
    if (state) return state.justPressed;

    const kc = resolveKeyCode(upper);
    if (kc !== null) {
      return this._queryKeyboard(kc, (kb, code) => kb.justPressed(code));
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      return this._queryMouse(mb, (mouse, btn) => mouse.justPressed(btn));
    }

    return false;
  }

  released(name) {
    if (!name) return false;
    const upper = name.toUpperCase();

    const state = this._findActionState(name);
    if (state) return state.justReleased;

    const kc = resolveKeyCode(upper);
    if (kc !== null) {
      return this._queryKeyboard(kc, (kb, code) => kb.justReleased(code));
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      return this._queryMouse(mb, (mouse, btn) => mouse.justReleased(btn));
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

    const kc = resolveKeyCode(upper);
    if (kc !== null) {
      return this._queryKeyboard(kc, (kb, code) => kb.isDown(code) ? 1 : 0);
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      return this._queryMouse(mb, (mouse, btn) => mouse.isDown(btn) ? 1 : 0);
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
      const kc = resolveKeyCode(binding.toUpperCase());
      if (kc === null) return;

      for (const ctx of this._system.contextStack._contexts) {
        const bindings = ctx.actionMap.getBindings(name);
        for (const b of bindings) {
          if (b.keyCode === kc) {
            ctx.actionMap.removeBinding(name, b);
            return;
          }
        }
      }
    }
  }

  buffer(name, ms) {
    if (!this._system || !this._system.contextStack) return;

    const state = this._findActionState(name);
    if (state) {
      state.buffer(ms);
    }
  }

  bindings() {
    const result = {};
    if (!this._system || !this._system.contextStack) return result;

    for (const ctx of this._system.contextStack._contexts) {
      for (const entry of ctx.actionMap.entries()) {
        result[entry.name] = entry.bindings.map(b => {
          if (b.type === "key") return { type: "key", keyCode: b.keyCode };
          if (b.type === "composite") return { type: "composite", kind: b.kind, subBindings: b.subBindings };
          if (b.type === "chord") return { type: "chord", keyCode: b.keyCode };
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
