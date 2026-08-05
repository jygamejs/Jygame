import { ActionEvaluator } from "./ActionEvaluator.js";

export class ContextStack {
  constructor(evaluator) {
    this._contexts = [];
    this._evaluator = evaluator || new ActionEvaluator();
    // Wired by InputSystem when the stack is attached. Only needed so that
    // push() can read the current device state; a standalone stack works
    // exactly as before.
    this._devices = null;
  }

  get devices() { return this._devices; }
  set devices(registry) { this._devices = registry; }

  // Newly pushed contexts are primed against the *current* device state so
  // that inputs already held at push time do not read as fresh presses on the
  // context's first evaluation — otherwise a pause menu opened with Escape
  // sees Escape as justPressed on its very first frame and closes itself.
  //
  // Priming evaluates the new context once and immediately snapshots it, so
  // prev matches what is actually held right now. With no device registry
  // attached there is nothing to read, and push stays a plain append.
  push(context) {
    this._contexts.push(context);
    if (!this._devices || !context || !context.actionMap) return;

    const entries = [];
    for (const entry of context.actionMap.entries()) entries.push(entry);
    if (entries.length === 0) return;

    this._evaluator.evaluate(entries, this._devices);
    for (const entry of entries) entry.state.snapshot();
  }

  pop(name) {
    const idx = this._contexts.findIndex(c => c.name === name);
    if (idx === -1) return false;
    this._contexts.splice(idx, 1);
    return true;
  }

  get(name) {
    return this._contexts.find(c => c.name === name) || null;
  }

  has(name) {
    return this._contexts.some(c => c.name === name);
  }

  get size() { return this._contexts.length; }

  get active() {
    if (this._contexts.length === 0) return null;
    return this._contexts.reduce((a, b) => a.priority >= b.priority ? a : b);
  }

  snapshot() {
    for (const ctx of this._contexts) {
      for (const entry of ctx.actionMap.entries()) {
        entry.state.snapshot();
      }
    }
  }

  evaluate(deviceRegistry) {
    const sorted = [...this._contexts].sort((a, b) => b.priority - a.priority);
    const consumed = new Set();

    for (const ctx of sorted) {
      const entries = [];
      for (const entry of ctx.actionMap.entries()) {
        if (!consumed.has(entry.name)) {
          entries.push(entry);
        }
      }

      if (entries.length > 0) {
        this._evaluator.evaluate(entries, deviceRegistry);
      }

      if (ctx.consumePolicy === "block") {
        for (const entry of ctx.actionMap.entries()) {
          consumed.add(entry.name);
        }
      }
    }
  }
}
