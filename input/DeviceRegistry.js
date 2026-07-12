export class DeviceRegistry {
  constructor() {
    this._devices = new Map();
  }

  register(device) {
    const key = device.type;
    const existing = this._devices.get(key);
    if (existing === undefined) {
      this._devices.set(key, device);
    } else if (Array.isArray(existing)) {
      existing.push(device);
    } else {
      this._devices.set(key, [existing, device]);
    }
  }

  unregister(device) {
    const key = device.type;
    const existing = this._devices.get(key);
    if (existing === undefined) return;
    if (Array.isArray(existing)) {
      const idx = existing.indexOf(device);
      if (idx !== -1) {
        existing.splice(idx, 1);
        if (existing.length === 1) {
          this._devices.set(key, existing[0]);
        }
      }
    } else if (existing === device) {
      this._devices.delete(key);
    }
  }

  get(ClassType) {
    const entry = this._devices.get(ClassType);
    if (Array.isArray(entry)) return entry[0];
    return entry || null;
  }

  getAll(ClassType) {
    const entry = this._devices.get(ClassType);
    if (!entry) return [];
    if (Array.isArray(entry)) return entry;
    return [entry];
  }

  forEach(fn) {
    for (const entry of this._devices.values()) {
      if (Array.isArray(entry)) {
        for (const device of entry) fn(device);
      } else {
        fn(entry);
      }
    }
  }

  update() {
    this.forEach(device => device.update());
  }
}
