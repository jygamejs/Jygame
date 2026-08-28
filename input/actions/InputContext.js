import { ComboMap } from "../ComboMap.js";

export class InputContext {
  constructor(name, actionMap, { priority = 0, consumePolicy = "block", comboMap = null } = {}) {
    this._name = name;
    this._actionMap = actionMap;
    this._priority = priority;
    this._consumePolicy = consumePolicy;
    this._comboMap = comboMap instanceof ComboMap ? comboMap : new ComboMap();
    // allow passing plain object map for backwards compat
    if (comboMap && !(comboMap instanceof ComboMap) && typeof comboMap === "object") {
      for (const [k, v] of Object.entries(comboMap)) {
        try { this._comboMap.set(k, v); } catch {}
      }
    }
  }

  get name() { return this._name; }
  get actionMap() { return this._actionMap; }
  get priority() { return this._priority; }
  get consumePolicy() { return this._consumePolicy; }
  get comboMap() { return this._comboMap; }

  serialize() {
    return {
      name: this._name,
      priority: this._priority,
      consumePolicy: this._consumePolicy,
      actionMap: this._actionMap.serialize(),
    };
  }
}
