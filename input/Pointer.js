export class Pointer {
  constructor(storage, slot) {
    this._storage = storage;
    this._slot = slot;
  }

  get _data() {
    return this._storage.getPointerData(this._slot);
  }

  get id() { const d = this._data; return d ? d.pointerId : -1; }
  get type() { const d = this._data; return d ? d.type : "mouse"; }
  get isEraser() { const d = this._data; return d ? d.isEraser : false; }

  get position() {
    const d = this._data;
    return d ? { x: d.x, y: d.y } : { x: 0, y: 0 };
  }

  get delta() {
    const d = this._data;
    return d ? { x: d.deltaX, y: d.deltaY } : { x: 0, y: 0 };
  }

  get velocity() {
    const d = this._data;
    return d ? { x: d.velocityX, y: d.velocityY } : { x: 0, y: 0 };
  }

  get pressure() { const d = this._data; return d ? d.pressure : 0; }
  get tilt() { const d = this._data; return d ? { x: d.tiltX, y: d.tiltY } : { x: 0, y: 0 }; }
  get twist() { const d = this._data; return d ? d.twist : 0; }
  get radius() { const d = this._data; return d ? { x: d.width / 2, y: d.height / 2 } : { x: 0, y: 0 }; }

  get isDown() { const d = this._data; return d ? d.isDown : false; }

  get justDown() {
    const d = this._data;
    return d ? d.isDown && !d.wasDown : false;
  }

  get justUp() {
    const d = this._data;
    return d ? !d.isDown && d.wasDown : false;
  }

  get duration() {
    const d = this._data;
    if (!d || !d.active) return 0;
    return performance.now() - d.startTime;
  }

  get distance() { const d = this._data; return d ? d.distance : 0; }

  get startPosition() {
    const d = this._data;
    return d ? { x: d.startX, y: d.startY } : { x: 0, y: 0 };
  }
}
