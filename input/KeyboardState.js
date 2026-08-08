import { KeyCode } from "./KeyCode.js";

export class KeyboardState {
  constructor() {
    this._keys = new Uint8Array(KeyCode.KEY_COUNT);
    this._prevKeys = new Uint8Array(KeyCode.KEY_COUNT);
    this._repeat = new Uint8Array(KeyCode.KEY_COUNT);
    this._modifiers = 0;

    // Logical key state, keyed by the KeyboardEvent.key value the browser
    // reports. Kept separate from the physical KeyCode arrays: the two
    // representations are independent (a French AZERTY "m" is event.code
    // "Semicolon" but event.key "m"). Counts, not booleans, so several
    // physical keys that produce the same logical value (e.g. Enter and
    // NumpadEnter → "Enter") collapse into one logical key that stays down
    // until every physical source is released.
    this._logicalCount = new Map();
    this._logicalPrev = new Map();
    this._logicalRepeat = new Map();
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
    this._logicalCount.clear();
    this._logicalPrev.clear();
    this._logicalRepeat.clear();
  }

  snapshot() {
    this._prevKeys.set(this._keys);
    this._repeat.fill(0);
    for (const [key, count] of this._logicalCount) {
      this._logicalPrev.set(key, count > 0);
    }
    // Released keys are removed from _logicalCount, so their prev entry would
    // otherwise stay stale (true) and mask a later re-press as held.
    for (const key of this._logicalPrev.keys()) {
      if (!this._logicalCount.has(key)) this._logicalPrev.set(key, false);
    }
    this._logicalRepeat.clear();
  }

  logicalPress(key, repeat = false) {
    if (!key) return;
    if (repeat) {
      this._logicalRepeat.set(key, true);
      return;
    }
    this._logicalCount.set(key, (this._logicalCount.get(key) || 0) + 1);
  }

  logicalRelease(key) {
    if (!key) return;
    const count = (this._logicalCount.get(key) || 0) - 1;
    if (count <= 0) {
      this._logicalCount.delete(key);
    } else {
      this._logicalCount.set(key, count);
    }
  }

  logicalIsDown(key) {
    return !!key && (this._logicalCount.get(key) || 0) > 0;
  }

  logicalJustPressed(key) {
    if (!key) return false;
    return this.logicalIsDown(key) && this._logicalPrev.get(key) !== true;
  }

  logicalJustReleased(key) {
    if (!key) return false;
    return !this.logicalIsDown(key) && this._logicalPrev.get(key) === true;
  }

  logicalRepeat(key) {
    return !!key && this._logicalRepeat.get(key) === true;
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
