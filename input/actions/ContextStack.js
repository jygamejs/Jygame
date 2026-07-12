import { ActionEvaluator } from "./ActionEvaluator.js";

export class ContextStack {
  constructor(evaluator) {
    this._contexts = [];
    this._evaluator = evaluator || new ActionEvaluator();
  }

  push(context) {
    this._contexts.push(context);
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
