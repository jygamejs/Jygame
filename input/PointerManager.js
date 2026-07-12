import { Device } from "./Device.js";
import { PointerStorage } from "./PointerStorage.js";
import { Pointer } from "./Pointer.js";
import { EventType } from "./EventType.js";

const VELOCITY_ALPHA = 0.3;

export class PointerManager extends Device {
  constructor(historyCapacity = 8) {
    super();
    this._storage = new PointerStorage(historyCapacity);
    this._pointers = new Map();
  }

  get type() { return PointerManager; }
  get storage() { return this._storage; }

  get count() { return this._storage.activeCount; }

  getPointer(id) {
    const slot = this._pointers.get(id);
    if (slot === undefined) return null;
    if (!this._storage.getPointerData(slot)) return null;
    return new Pointer(this._storage, slot);
  }

  getPointers() {
    const result = [];
    this._storage.forEachActive((data, slot) => {
      result.push(new Pointer(this._storage, slot));
    });
    return result;
  }

  update(queue, dt = 16.67) {
    this._snapshotState();
    queue.each(event => {
      this._processEvent(event, dt);
    });
  }

  _snapshotState() {
    this._storage.forEachActive((data) => {
      data.wasDown = data.isDown;
    });
  }

  _processEvent(event, dt) {
    switch (event.type) {
      case EventType.POINTER_DOWN:
        this._onPointerDown(event.data);
        break;
      case EventType.POINTER_MOVE:
        this._onPointerMove(event.data, dt);
        break;
      case EventType.POINTER_UP:
        this._onPointerUp(event.data);
        break;
    }
  }

  _onPointerDown(data) {
    const slot = this._storage.allocate();
    if (slot < 0) return;

    const pd = this._storage.getPointerData(slot);
    pd.active = true;
    pd.pointerId = data.pointerId;
    pd.type = data.type || "mouse";
    pd.isEraser = data.type === "pen" && !!data.isEraser;
    pd.x = data.x;
    pd.y = data.y;
    pd.prevX = data.x;
    pd.prevY = data.y;
    pd.startX = data.x;
    pd.startY = data.y;
    pd.deltaX = 0;
    pd.deltaY = 0;
    pd.velocityX = 0;
    pd.velocityY = 0;
    pd.pressure = data.pressure ?? 0.5;
    pd.tiltX = data.tiltX ?? 0;
    pd.tiltY = data.tiltY ?? 0;
    pd.twist = data.twist ?? 0;
    pd.width = data.width ?? 1;
    pd.height = data.height ?? 1;
    pd.isDown = true;
    pd.startTime = performance.now();
    pd.distance = 0;
    pd.history.push({ x: data.x, y: data.y });

    this._pointers.set(data.pointerId, slot);
  }

  _onPointerMove(data, dt) {
    const slot = this._pointers.get(data.pointerId);
    if (slot === undefined) return;
    const pd = this._storage.getPointerData(slot);
    if (!pd || !pd.isDown) return;

    pd.prevX = pd.x;
    pd.prevY = pd.y;
    pd.x = data.x;
    pd.y = data.y;
    pd.deltaX = pd.x - pd.prevX;
    pd.deltaY = pd.y - pd.prevY;
    pd.pressure = data.pressure ?? pd.pressure;

    const instantVx = dt > 0 ? (pd.deltaX / dt) * 1000 : 0;
    const instantVy = dt > 0 ? (pd.deltaY / dt) * 1000 : 0;
    pd.velocityX = VELOCITY_ALPHA * instantVx + (1 - VELOCITY_ALPHA) * pd.velocityX;
    pd.velocityY = VELOCITY_ALPHA * instantVy + (1 - VELOCITY_ALPHA) * pd.velocityY;

    pd.distance += Math.sqrt(pd.deltaX * pd.deltaX + pd.deltaY * pd.deltaY);
    pd.history.push({ x: data.x, y: data.y });
  }

  _onPointerUp(data) {
    const slot = this._pointers.get(data.pointerId);
    if (slot === undefined) return;
    const pd = this._storage.getPointerData(slot);
    if (!pd) return;

    pd.x = data.x ?? pd.x;
    pd.y = data.y ?? pd.y;
    pd.isDown = false;
    pd.history.push({ x: pd.x, y: pd.y });
    this._storage.release(slot);
    this._pointers.delete(data.pointerId);
  }
}
