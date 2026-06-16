export class AudioEffect {
  connect(inputNode, context) {
    throw new Error("AudioEffect#connect must be overridden");
  }

  disconnect() {}

  update(params) {
    for (const key in params) {
      if (this["_" + key] !== undefined) {
        this["_" + key] = params[key];
        this._applyParam(key);
      }
    }
  }

  _applyParam(key) {}
}
