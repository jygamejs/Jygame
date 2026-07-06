import { MetricDescriptor } from "./MetricDescriptor.js";

export class MetricRegistry {
  constructor() {
    this._descriptors = [];
    this._nameMap = new Map();
    this._version = 0;
    this._locked = false;
  }

  register(descriptor, force = false) {
    if (this._locked && !force) {
      throw new Error("MetricRegistry is locked: cannot register new static metrics.");
    }

    const existing = this._nameMap.get(descriptor.name);
    if (existing !== undefined) {
      return existing.id;
    }

    const id = this._descriptors.length;
    const full = { ...descriptor, id };
    const wrapped = new MetricDescriptor(full);
    this._descriptors.push(wrapped);
    this._nameMap.set(descriptor.name, wrapped);
    this._version++;
    return id;
  }

  get(id) {
    return this._descriptors[id];
  }

  find(name) {
    return this._nameMap.get(name);
  }

  forEach(fn) {
    for (let i = 0; i < this._descriptors.length; i++) {
      fn(this._descriptors[i]);
    }
  }

  get count() {
    return this._descriptors.length;
  }

  get version() {
    return this._version;
  }

  get locked() {
    return this._locked;
  }

  lock() {
    this._locked = true;
  }
}
