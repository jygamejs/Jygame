import { Device } from "./Device.js";
import { EventType } from "./EventType.js";
import { MouseButton } from "./MouseButton.js";

const DOUBLE_CLICK_INTERVAL = 300;
const DOUBLE_CLICK_DISTANCE = 10;
const BUTTON_COUNT = 5;

export class Mouse extends Device {
  constructor() {
    super();
    this._buttons = new Uint8Array(BUTTON_COUNT);
    this._prevButtons = new Uint8Array(BUTTON_COUNT);
    this._position = { x: 0, y: 0 };
    this._hoverPosition = { x: 0, y: 0 };
    this._wheel = 0;
    this._wheelH = 0;
    this._doubleClicked = false;
    this._lastClickTime = 0;
    this._lastClickX = 0;
    this._lastClickY = 0;
    this._isHovering = false;
    this._pointerLocked = false;
  }

  get type() { return Mouse; }

  get position() { return { x: this._position.x, y: this._position.y }; }
  get delta() { return { x: this._deltaX, y: this._deltaY }; }
  get wheel() { return this._wheel; }
  get wheelHorizontal() { return this._wheelH; }
  get doubleClicked() { return this._doubleClicked; }
  get hoverPosition() { return { x: this._hoverPosition.x, y: this._hoverPosition.y }; }
  get isHovering() { return this._isHovering; }
  get isPointerLocked() { return this._pointerLocked; }

  requestPointerLock() {
    this._pointerLocked = true;
  }

  exitPointerLock() {
    this._pointerLocked = false;
  }

  isDown(button) {
    if (button < 0 || button >= BUTTON_COUNT) return false;
    return this._buttons[button] === 1;
  }

  justPressed(button) {
    if (button < 0 || button >= BUTTON_COUNT) return false;
    return this._buttons[button] === 1 && this._prevButtons[button] === 0;
  }

  justReleased(button) {
    if (button < 0 || button >= BUTTON_COUNT) return false;
    return this._buttons[button] === 0 && this._prevButtons[button] === 1;
  }

  update(queue) {
    this._snapshot();
    this._doubleClicked = false;
    this._deltaX = 0;
    this._deltaY = 0;

    queue.each(event => {
      switch (event.type) {
        case EventType.POINTER_DOWN:
          this._onPointerDown(event.data);
          break;
        case EventType.POINTER_UP:
          this._onPointerUp(event.data);
          break;
        case EventType.POINTER_MOVE:
          this._onPointerMove(event.data);
          break;
        case EventType.WHEEL:
          this._onWheel(event.data);
          break;
      }
    });
  }

  _snapshot() {
    this._prevButtons.set(this._buttons);
  }

  _onPointerDown(data) {
    this._isHovering = true;
    this._position.x = data.x;
    this._position.y = data.y;
    this._hoverPosition.x = data.x;
    this._hoverPosition.y = data.y;

    const btn = data.button ?? 0;
    if (btn >= 0 && btn < BUTTON_COUNT) {
      this._buttons[btn] = 1;
    }

    const now = performance.now();
    const dx = data.x - this._lastClickX;
    const dy = data.y - this._lastClickY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (now - this._lastClickTime < DOUBLE_CLICK_INTERVAL && dist < DOUBLE_CLICK_DISTANCE) {
      this._doubleClicked = true;
    }
    this._lastClickTime = now;
    this._lastClickX = data.x;
    this._lastClickY = data.y;
  }

  _onPointerUp(data) {
    const btn = data.button ?? 0;
    if (btn >= 0 && btn < BUTTON_COUNT) {
      this._buttons[btn] = 0;
    }
  }

  _onPointerMove(data) {
    this._isHovering = true;
    this._deltaX = data.x - this._position.x;
    this._deltaY = data.y - this._position.y;
    this._position.x = data.x;
    this._position.y = data.y;
    this._hoverPosition.x = data.x;
    this._hoverPosition.y = data.y;
  }

  _onWheel(data) {
    this._wheel += data.deltaY;
    this._wheelH += data.deltaX;
  }

  resetWheel() {
    this._wheel = 0;
    this._wheelH = 0;
  }
}
