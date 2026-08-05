// `_prevX`/`_prevY` hold last tick's position for render interpolation.
// `_interpValid` is 0 until SavePrevPositionSystem has seeded them at least
// once, so freshly spawned entities are not blended in from a stale origin.
// It must be an explicit flag: (0, 0) is a legitimate position, so it cannot
// double as a "not yet initialized" sentinel.
export class Transform {
  static schema = { x: "f32", y: "f32", rotation: "f32", scaleX: "f32", scaleY: "f32", _prevX: "f32", _prevY: "f32", _interpValid: "u8" };
}
