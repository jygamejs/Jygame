import { KeyCode } from "./KeyCode.js";

export class KeyboardState {
  constructor() {
    this._keys = new Uint8Array(KeyCode.KEY_COUNT);
    this._prevKeys = new Uint8Array(KeyCode.KEY_COUNT);
    this._repeat = new Uint8Array(KeyCode.KEY_COUNT);
    this._modifiers = 0;
  }

  press(code) {
    if (code < 0 || code >= this._keys.length) return;
    this._keys[code] = 1;
  }

  release(code) {
    if (code < 0 || code >= this._keys.length) return;
    this._keys[code] = 0;
  }

  setRepeat(code) {
    if (code < 0 || code >= this._keys.length) return;
    this._repeat[code] = 1;
  }

  reset() {
    this._keys.fill(0);
    this._prevKeys.fill(0);
    this._repeat.fill(0);
    this._modifiers = 0;
  }

  snapshot() {
    this._prevKeys.set(this._keys);
    this._repeat.fill(0);
  }

  isDown(code) {
    return code >= 0 && code < this._keys.length && this._keys[code] === 1;
  }

  justPressed(code) {
    return code >= 0 && code < this._keys.length
      && this._keys[code] === 1 && this._prevKeys[code] === 0;
  }

  justReleased(code) {
    return code >= 0 && code < this._keys.length
      && this._keys[code] === 0 && this._prevKeys[code] === 1;
  }

  repeat(code) {
    return code >= 0 && code < this._repeat.length && this._repeat[code] === 1;
  }

  anyDown() {
    for (let i = 0; i < this._keys.length; i++) {
      if (this._keys[i] === 1) return true;
    }
    return false;
  }

  get modifiers() { return this._modifiers; }
  set modifiers(val) { this._modifiers = val; }

  get pressedKeys() {
    const result = [];
    for (let i = 0; i < this._keys.length; i++) {
      if (this._keys[i] === 1) result.push(i);
    }
    return result;
  }
}
