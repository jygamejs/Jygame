import { InputBackend } from "./InputBackend.js";
import { InputEvent } from "./InputEvent.js";
import { EventType } from "./EventType.js";
import { Tier } from "./Tier.js";

export class BrowserBackend extends InputBackend {
  constructor(target) {
    super();
    this._target = target;
    this._attached = false;

    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);
    this._boundPointerCancel = this._onPointerCancel.bind(this);
    this._boundWheel = this._onWheel.bind(this);
  }

  get name() { return "browser"; }

  start() {
    if (this._attached) return;
    const el = this._target;
    document.addEventListener("keydown", this._boundKeyDown);
    document.addEventListener("keyup", this._boundKeyUp);
    el.addEventListener("pointerdown", this._boundPointerDown, { passive: false });
    el.addEventListener("pointermove", this._boundPointerMove, { passive: false });
    el.addEventListener("pointerup", this._boundPointerUp, { passive: false });
    el.addEventListener("pointercancel", this._boundPointerCancel, { passive: false });
    el.addEventListener("wheel", this._boundWheel, { passive: false });
    el.style.touchAction = "none";
    this._attached = true;
  }

  stop() {
    if (!this._attached) return;
    const el = this._target;
    document.removeEventListener("keydown", this._boundKeyDown);
    document.removeEventListener("keyup", this._boundKeyUp);
    el.removeEventListener("pointerdown", this._boundPointerDown);
    el.removeEventListener("pointermove", this._boundPointerMove);
    el.removeEventListener("pointerup", this._boundPointerUp);
    el.removeEventListener("pointercancel", this._boundPointerCancel);
    el.removeEventListener("wheel", this._boundWheel);
    el.style.touchAction = "";
    this._attached = false;
  }

  poll(queue) {
    // BrowserBackend pushes events reactively in handlers, not on poll.
    // poll() is a no-op — events were already queued in real time.
  }

  _onKeyDown(e) {
    const raw = e.key;
    if (raw.startsWith("Arrow") || raw === " ") {
      e.preventDefault();
    }
    this._queue.push(new InputEvent(EventType.KEY_DOWN, {
      key: raw,
      code: e.code,
      repeat: e.repeat,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
      printable: raw.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey,
    }), Tier.HIGH);
  }

  _onKeyUp(e) {
    this._queue.push(new InputEvent(EventType.KEY_UP, {
      key: e.key,
      code: e.code,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
    }), Tier.HIGH);
  }

  _onPointerDown(e) {
    if (e.cancelable) e.preventDefault();
    this._queue.push(new InputEvent(EventType.POINTER_DOWN, {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      width: e.width,
      height: e.height,
      isPrimary: e.isPrimary,
    }), Tier.HIGH);
  }

  _onPointerMove(e) {
    if (e.cancelable) e.preventDefault();
    this._queue.push(new InputEvent(EventType.POINTER_MOVE, {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      width: e.width,
      height: e.height,
      isPrimary: e.isPrimary,
    }), Tier.LOW);
  }

  _onPointerUp(e) {
    if (e.cancelable) e.preventDefault();
    this._queue.push(new InputEvent(EventType.POINTER_UP, {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
      pressure: e.pressure,
      isPrimary: e.isPrimary,
    }), Tier.HIGH);
  }

  _onPointerCancel(e) {
    this._queue.push(new InputEvent(EventType.POINTER_UP, {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
      cancelled: true,
    }), Tier.HIGH);
  }

  _onWheel(e) {
    if (e.cancelable) e.preventDefault();
    this._queue.push(new InputEvent(EventType.WHEEL, {
      x: e.clientX,
      y: e.clientY,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaZ: e.deltaZ,
      deltaMode: e.deltaMode,
    }), Tier.NORMAL);
  }

  get _queue() {
    // Set by InputSystem.setBackend via poll() or externally.
    // We store a reference set on first poll() call.
    return this._eventQueue;
  }

  set _eventQueue(q) { this.__eventQueue = q; }
  get _eventQueue() { return this.__eventQueue; }

  // Override poll to stash the queue reference
  poll(queue) {
    if (!this.__eventQueue) {
      this.__eventQueue = queue;
    }
  }
}
