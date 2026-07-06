import { CpuParticleBackend } from "./backends/CpuParticleBackend.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType }
  from "../debug/index.js";

export class ParticleSystem {
  constructor({ renderParticle, renderer, backend, storage } = {}) {
    this._backend = backend || new CpuParticleBackend({ renderParticle, renderer, system: this, storage });
    this._diagnostics = null;
  }

  // ---- Modifiers ----

  addModifier(modifier, priority) {
    this._backend.addModifier(modifier, priority);
  }

  removeModifier(modifier) {
    this._backend.removeModifier(modifier);
  }

  clearModifiers() {
    this._backend.clearModifiers();
  }

  // ---- Lifecycle ----

  _initDiag(diag) {
    if (this._diagInitDone) return;
    this._diagInitDone = true;
    this._diagSimId = diag.registerDynamicMetric({
      name: "particles.simulation",
      displayName: "Particle Simulation",
      category: MetricCategory.PARTICLES,
      group: "Particles",
      unit: MetricUnit.MILLISECONDS,
      type: MetricType.TIMER,
      tags: Object.freeze(["particles"]),
    });
    this._diagDrawId = diag.registerDynamicMetric({
      name: "particles.draw",
      displayName: "Particle Draw",
      category: MetricCategory.PARTICLES,
      group: "Particles",
      unit: MetricUnit.MILLISECONDS,
      type: MetricType.TIMER,
      tags: Object.freeze(["particles"]),
    });
    this._diagAliveId = diag.registerDynamicMetric({
      name: "particles.alive",
      displayName: "Alive Particles",
      category: MetricCategory.PARTICLES,
      group: "Particles",
      unit: MetricUnit.COUNT,
      type: MetricType.GAUGE,
      tags: Object.freeze(["particles"]),
    });
    this._diagEmittedId = diag.registerDynamicMetric({
      name: "particles.emitted",
      displayName: "Emitted This Frame",
      category: MetricCategory.PARTICLES,
      group: "Particles",
      unit: MetricUnit.COUNT,
      type: MetricType.COUNTER,
      tags: Object.freeze(["particles"]),
    });
    this._diagEmittersId = diag.registerDynamicMetric({
      name: "particles.emitters",
      displayName: "Active Emitters",
      category: MetricCategory.PARTICLES,
      group: "Particles",
      unit: MetricUnit.COUNT,
      type: MetricType.GAUGE,
      tags: Object.freeze(["particles"]),
    });
  }

  emit(count, initializer, emitter) {
    this._backend.emit(count, initializer, emitter);
    if (this._diagnostics) {
      this._initDiag(this._diagnostics);
      this._diagnostics.recordCounter(this._diagEmittedId, count);
    }
  }

  emitOne(initializer) {
    const emitted = this._backend.emitOne(initializer);
    if (this._diagnostics) {
      this._initDiag(this._diagnostics);
      this._diagnostics.recordCounter(this._diagEmittedId, 1);
    }
    return emitted;
  }

  update(dt) {
    if (this._diagnostics) {
      this._initDiag(this._diagnostics);
      this._diagnostics.scope(this._diagSimId, () => {
        this._backend.update(dt);
      });
      this._diagnostics.recordGauge(this._diagAliveId, this._backend.activeCount);
    } else {
      this._backend.update(dt);
    }
  }

  render(ctx) {
    if (this._diagnostics) {
      this._initDiag(this._diagnostics);
      this._diagnostics.scope(this._diagDrawId, () => {
        this._backend.render(ctx);
      });
    } else {
      this._backend.render(ctx);
    }
  }

  clear() {
    this._backend.clear();
  }

  destroy() {
    this._backend.destroy();
  }

  warmup(count) {
    this._backend.warmup(count);
  }

  // ---- Collision ----

  setCollisionProvider(provider) {
    this._backend.setCollisionProvider(provider);
  }

  // ---- Sorting ----

  get sortMode() {
    return this._backend.sortMode;
  }

  set sortMode(value) {
    this._backend.sortMode = value;
  }

  get sortFunction() {
    return this._backend.sortFunction;
  }

  set sortFunction(value) {
    this._backend.sortFunction = value;
  }

  get sortEveryFrame() {
    return this._backend.sortEveryFrame;
  }

  set sortEveryFrame(value) {
    this._backend.sortEveryFrame = value;
  }

  get sortedParticleCount() {
    return this._backend.sortedParticleCount;
  }

  // ---- Statistics ----

  get activeCount() {
    return this._backend.activeCount;
  }

  get freeCount() {
    return this._backend.freeCount;
  }

  get capacity() {
    return this._backend.capacity;
  }

  get maxCapacity() {
    return this._backend._storage.maxCapacity;
  }

  get peakActive() {
    return this._backend.peakActive;
  }

  get peakCapacity() {
    return this._backend.peakCapacity;
  }

  get peakFree() {
    return this._backend.peakFree;
  }

  get totalCreated() {
    return this._backend.totalCreated;
  }

  get isEmpty() {
    return this._backend.isEmpty;
  }

  get hasParticles() {
    return this._backend.hasParticles;
  }

  get particles() {
    return this._backend.particles;
  }

  get modifierCount() {
    return this._backend.modifierCount;
  }

  get diagnostics() {
    return this._diagnostics;
  }

  set diagnostics(diag) {
    this._diagnostics = diag;
  }

  // ---- Internal access (for tests / external inspection) ----

  get _renderParticle() {
    return this._backend._renderParticle;
  }

  set _renderParticle(value) {
    this._backend._renderParticle = value;
  }

  get _sortDirty() {
    return this._backend._sortManager._sortDirty;
  }

  set _sortDirty(value) {
    this._backend._sortManager._sortDirty = value;
  }

  get _sortFunction() {
    return this._backend._sortManager._sortFunction;
  }

  set _sortFunction(value) {
    this._backend._sortManager._sortFunction = value;
  }

  get _sortedIndices() {
    return this._backend._sortManager._sortedIndices;
  }

  get _collisionProvider() {
    return this._backend._collisionProvider;
  }

  set _collisionProvider(value) {
    this._backend._collisionProvider = value;
  }
}
