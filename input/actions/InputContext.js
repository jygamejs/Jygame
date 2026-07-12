export class InputContext {
  constructor(name, actionMap, { priority = 0, consumePolicy = "block" } = {}) {
    this._name = name;
    this._actionMap = actionMap;
    this._priority = priority;
    this._consumePolicy = consumePolicy;
  }

  get name() { return this._name; }
  get actionMap() { return this._actionMap; }
  get priority() { return this._priority; }
  get consumePolicy() { return this._consumePolicy; }

  serialize() {
    return {
      name: this._name,
      priority: this._priority,
      consumePolicy: this._consumePolicy,
      actionMap: this._actionMap.serialize(),
    };
  }
}
