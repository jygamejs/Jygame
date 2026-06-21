import { SimulationBufferView } from "./gpu/SimulationBufferView.js";

// SimulationContext — common abstraction over all particle access models
//
// SimulationBufferView  → slot-indexed typed-array access (GPU path)
// SoAParticleAccessor   → single-particle getter/setter delegation (CPU SoA path)
// ObjectParticleAccessor → single-particle object property delegation (CPU Object path)

const FIELD_ACCESSORS = [
  "x", "y", "vx", "vy", "ax", "ay",
  "life", "maxLife", "ageRatio",
  "rotation", "rotationSpeed",
  "size", "alpha", "depth",
];

const UINT8_FIELDS = ["r", "g", "b"];

class SimulationContextBase {
  constructor(storage) {
    this._storage = storage;
  }

  get storage() { return this._storage; }
}

// ── Slot-indexed context (for SimulationBufferView / GPU path) ──

export class SlotSimulationContext extends SimulationContextBase {
  constructor(view) {
    super(view);
    this._view = view;
  }

  read(i, field) { return this._view.get(i, field); }
  write(i, field, v) { this._view.set(i, field, v); }

  id(i) { return this._view.id(i); }
  integrate(i, dt) { this._view.integrate(i, dt); }
}

// Generate named accessors for SlotSimulationContext
for (const name of FIELD_ACCESSORS) {
  const cap = name[0].toUpperCase() + name.slice(1);
  SlotSimulationContext.prototype[name] = function (i) { return this._view[name](i); };
  SlotSimulationContext.prototype["set" + cap] = function (i, v) { this._view["set" + cap](i, v); };
}
for (const name of UINT8_FIELDS) {
  const cap = name[0].toUpperCase() + name.slice(1);
  SlotSimulationContext.prototype[name] = function (i) { return this._view[name](i); };
  SlotSimulationContext.prototype["set" + cap] = function (i, v) { this._view["set" + cap](i, v); };
}

// ── Single-particle context (for accessor-based CPU path) ──

export class AccessorSimulationContext extends SimulationContextBase {
  constructor(storage) {
    super(storage);
    this._acc = null;
  }

  bind(acc) { this._acc = acc; }

  read(i, field) { return this._acc[field]; }
  write(i, field, v) { this._acc[field] = v; }

  get _i() { return this._acc._i; }
  get __jygameId() { return this._acc.__jygameId; }
  set __jygameId(v) { this._acc.__jygameId = v; }
  get __jygameSortOrder() { return this._acc.__jygameSortOrder; }
  set __jygameSortOrder(v) { this._acc.__jygameSortOrder = v; }
}

// Generate named accessors for AccessorSimulationContext
for (const name of FIELD_ACCESSORS) {
  AccessorSimulationContext.prototype[name] = function () { return this._acc[name]; };
  const cap = name[0].toUpperCase() + name.slice(1);
  AccessorSimulationContext.prototype["set" + cap] = function (v) { this._acc[name] = v; };
}
for (const name of UINT8_FIELDS) {
  AccessorSimulationContext.prototype[name] = function () { return this._acc[name]; };
  const cap = name[0].toUpperCase() + name.slice(1);
  AccessorSimulationContext.prototype["set" + cap] = function (v) { this._acc[name] = v; };
}

// ── Factory ──

export function createSimulationContext(storage) {
  const isView = storage instanceof SimulationBufferView;
  if (isView) return new SlotSimulationContext(storage);
  return new AccessorSimulationContext(storage);
}

export function isSlotContext(ctx) {
  return ctx instanceof SlotSimulationContext;
}
