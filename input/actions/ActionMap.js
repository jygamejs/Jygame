import { ActionKind } from "../ActionKind.js";
import { ActionState } from "./ActionState.js";

export class ActionMap {
  constructor() {
    this._actions = new Map();
  }

  bind(name, binding, kind = ActionKind.DIGITAL) {
    if (!this._actions.has(name)) {
      this._actions.set(name, { bindings: [], state: new ActionState(kind) });
    }
    this._actions.get(name).bindings.push(binding);
  }

  addBinding(name, binding) {
    const entry = this._actions.get(name);
    if (!entry) return false;
    entry.bindings.push(binding);
    return true;
  }

  removeBinding(name, binding) {
    const entry = this._actions.get(name);
    if (!entry) return false;
    const idx = entry.bindings.indexOf(binding);
    if (idx === -1) return false;
    entry.bindings.splice(idx, 1);
    return true;
  }

  getBindings(name) {
    const entry = this._actions.get(name);
    return entry ? [...entry.bindings] : [];
  }

  getState(name) {
    const entry = this._actions.get(name);
    return entry ? entry.state : null;
  }

  has(name) {
    return this._actions.has(name);
  }

  entries() {
    const result = [];
    for (const [name, entry] of this._actions) {
      result.push({ name, bindings: entry.bindings, state: entry.state });
    }
    return result;
  }

  get names() {
    return [...this._actions.keys()];
  }

  remove(name) {
    return this._actions.delete(name);
  }

  clear() {
    this._actions.clear();
  }
}
