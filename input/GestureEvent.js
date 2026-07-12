export class GestureEvent {
  constructor(type, options = {}) {
    this._type = type;
    this._position = options.position ?? { x: 0, y: 0 };
    this._delta = options.delta ?? { x: 0, y: 0 };
    this._scale = options.scale ?? 1;
    this._rotation = options.rotation ?? 0;
    this._velocity = options.velocity ?? 0;
    this._duration = options.duration ?? 0;
    this._pointerIds = options.pointerIds ?? [];
  }

  get type() { return this._type; }
  get position() { return this._position; }
  get delta() { return this._delta; }
  get scale() { return this._scale; }
  get rotation() { return this._rotation; }
  get velocity() { return this._velocity; }
  get duration() { return this._duration; }
  get pointerIds() { return this._pointerIds; }
}
