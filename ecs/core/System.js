export class System {
  constructor() {
    this.enabled = true;
    this._priority = this.constructor.priority ?? 0;
    this._query = null;
    this._queryEngine = null;
  }

  get priority() {
    return this._priority;
  }

  get query() {
    return this._query;
  }

  onAdded(world) {}

  onRemoved(world) {}

  update(world, dt) {
    throw new Error(
      `System "${this.constructor.name}" must override the update() method.`
    );
  }
}
