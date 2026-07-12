export class InputEvent {
  constructor(type, data = {}) {
    this._type = type;
    this._data = data;
    this._consumed = false;
  }

  get type() { return this._type; }
  get data() { return this._data; }
  get consumed() { return this._consumed; }

  consume() { this._consumed = true; }
}
