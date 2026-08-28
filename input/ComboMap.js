export class ComboMap {
  constructor() {
    this._map = new Map();
  }

  set(name, def) {
    // def: { sequence: string[], within?: number, consume?: boolean }
    if (!name || typeof name !== "string") throw new TypeError("combo name must be non-empty string");
    if (!def || !Array.isArray(def.sequence) || def.sequence.length === 0) throw new TypeError("combo sequence must be non-empty array");
    const within = def.within;
    if (within !== undefined && within !== null) {
      if (typeof within !== "number" || !Number.isFinite(within) || within < 0) throw new TypeError("combo within must be a finite number >= 0");
    }
    const consume = def.consume;
    if (consume !== undefined && typeof consume !== "boolean") throw new TypeError("combo consume must be boolean");
    for (const s of def.sequence) {
      if (typeof s !== "string" || s.length === 0) throw new TypeError("combo sequence elements must be non-empty strings");
    }
    this._map.set(name, { sequence: [...def.sequence], within: within ?? null, consume: !!consume });
  }

  get(name) {
    return this._map.get(name) || null;
  }

  has(name) {
    return this._map.has(name);
  }

  delete(name) {
    return this._map.delete(name);
  }

  entries() {
    return this._map.entries();
  }

  keys() {
    return this._map.keys();
  }

  clear() {
    this._map.clear();
  }

  get size() { return this._map.size; }
}
