import { Mouse } from "./Mouse.js";
import { PointerManager } from "./PointerManager.js";

export class PointerLockManager {
  constructor(system, cursorManager = null) {
    this._system = system;
    this._cursor = cursorManager;
    this._isLocked = false;
    this._pending = null;
    this._element = null;
    this._host = null;
    this._onChange = this._onChange.bind(this);
    this._onError = this._onError.bind(this);
    this._attached = false;
    this._pendingResolve = null;
    this._pendingReject = null;
  }

  _getElement() {
    if (this._element) return this._element;
    if (this._system) {
      if (this._system.domElement) return this._system.domElement;
      if (this._system._domElement) return this._system._domElement;
      const backend = this._system.backend;
      if (backend && backend._target) return backend._target;
    }
    return null;
  }

  _getHost() {
    if (this._host) return this._host;
    if (this._system) return this._system.host || this._system._host || null;
    return null;
  }

  setElement(el) { this._element = el; }
  setHost(host) { this._host = host; }

  _attachSystem(system) {
    this._system = system;
  }

  get isLocked() {
    const host = this._getHost();
    const el = this._getElement();
    if (host && typeof host.pointerLockElement !== "undefined") {
      return host.pointerLockElement === el && !!el;
    }
    return this._isLocked;
  }

  async lock() {
    const el = this._getElement();
    const host = this._getHost();
    if (!el) return false;
    if (this.isLocked) return true;

    this._ensureAttached();

    try {
      let p;
      if (host && typeof host.requestPointerLock === "function") {
        p = host.requestPointerLock(el);
      } else if (typeof el.requestPointerLock === "function") {
        p = el.requestPointerLock();
      } else {
        return false;
      }
      if (p && typeof p.then === "function") await p;
      await Promise.resolve();
      // Sync internal flag to host state after attempt
      const locked = this.isLocked;
      if (locked) this._sync(locked);
      return locked;
    } catch (e) {
      this._isLocked = false;
      this._sync(false);
      return false;
    }
  }

  unlock() {
    const host = this._getHost();
    if (!this.isLocked) return;
    try {
      if (host && typeof host.exitPointerLock === "function") {
        host.exitPointerLock();
      } else if (typeof document !== "undefined" && typeof document.exitPointerLock === "function") {
        document.exitPointerLock();
      }
    } catch {}
  }

  _simulateExternalUnlock() {
    const host = this._getHost();
    if (host && typeof host.exitPointerLock === "function") {
      host.exitPointerLock();
    }
    this._onChange();
  }

  _ensureAttached() {
    if (this._attached) return;
    const host = this._getHost();
    if (host && typeof host.onDocument === "function") {
      host.onDocument("pointerlockchange", this._onChange);
      host.onDocument("pointerlockerror", this._onError);
      host.onWindow("blur", this._onChange);
      host.onDocument("visibilitychange", this._onChange);
      this._attached = true;
    } else if (typeof document !== "undefined") {
      document.addEventListener("pointerlockchange", this._onChange);
      document.addEventListener("pointerlockerror", this._onError);
      window.addEventListener("blur", this._onChange);
      document.addEventListener("visibilitychange", this._onChange);
      this._attached = true;
    }
  }

  _detach() {
    if (!this._attached) return;
    const host = this._getHost();
    if (host && typeof host.offDocument === "function") {
      host.offDocument("pointerlockchange", this._onChange);
      host.offDocument("pointerlockerror", this._onError);
      host.offWindow("blur", this._onChange);
      host.offDocument("visibilitychange", this._onChange);
    } else if (typeof document !== "undefined") {
      document.removeEventListener("pointerlockchange", this._onChange);
      document.removeEventListener("pointerlockerror", this._onError);
      window.removeEventListener("blur", this._onChange);
      document.removeEventListener("visibilitychange", this._onChange);
    }
    this._attached = false;
  }

  _onChange() {
    const host = this._getHost();
    const el = this._getElement();
    let isLockedNow = false;
    if (host && typeof host.pointerLockElement !== "undefined") {
      isLockedNow = host.pointerLockElement === el && !!el;
    } else if (typeof document !== "undefined") {
      isLockedNow = document.pointerLockElement === el;
    } else {
      isLockedNow = this._isLocked;
    }

    if (isLockedNow !== this._isLocked) {
      this._isLocked = isLockedNow;
      this._sync(isLockedNow);
      if (!isLockedNow && this._cursor) {
        this._cursor._restoreAfterUnlock();
      }
    } else if (isLockedNow) {
      this._isLocked = true;
      this._sync(true);
    } else if (!isLockedNow && this._isLocked) {
      this._isLocked = false;
      this._sync(false);
      if (this._cursor) this._cursor._restoreAfterUnlock();
    }
  }

  _onError(e) {
    this._isLocked = false;
    this._sync(false);
    if (this._pendingReject) {
      this._pendingReject(e);
      this._pendingReject = null;
      this._pendingResolve = null;
    }
  }

  _sync(locked) {
    if (!this._system) return;
    const m = this._system.devices.get(Mouse);
    if (m) m._setLocked(!!locked);
    const pm = this._system.devices.get(PointerManager);
    if (pm && typeof pm._setLocked === "function") pm._setLocked(!!locked);
  }

  destroy() {
    this._detach();
    if (this.isLocked) {
      try { this.unlock(); } catch {}
    }
    this._isLocked = false;
    this._sync(false);
    this._pending = null;
  }
}
