import { ModifierCompiler } from "../gpu/ModifierCompiler.js";
import { GpuPassExecutor } from "../gpu/GpuPassExecutor.js";
import { GpuUniformLayout } from "../gpu/GpuUniformLayout.js";
import { WgslGenerator } from "../gpu/WgslGenerator.js";
import { SimulationBufferView } from "../gpu/SimulationBufferView.js";
import { StorageResolver } from "../storage/StorageResolver.js";
import { GpuParticleRenderer } from "../renderers/GpuParticleRenderer.js";
import { ParticleRenderCommandBuffer } from "../renderdata/ParticleRenderCommandBuffer.js";
import { ParticleRenderData } from "../renderdata/ParticleRenderData.js";
import { ParticleSortManager } from "../ParticleSortManager.js";
import { WebGpuDeviceManager } from "../gpu/webgpu/WebGpuDeviceManager.js";
import { GpuComputeDispatcher } from "../gpu/webgpu/GpuComputeDispatcher.js";
import { WebGpuParticleRenderer } from "../renderers/webgpu/WebGpuParticleRenderer.js";

export class GpuParticleBackend {
  constructor({ renderer, system, storage, mode, canvas, renderValidationMode } = {}) {
    this._system = system;
    this._mode = mode || "operator";
    this._canvas = canvas || null;
    this._renderValidationMode = renderValidationMode === true;
    this._storage = storage || StorageResolver.createDefault();
    this._useSoA = StorageResolver.isSoA(this._storage) && this._mode !== "object";
    this._accessor = StorageResolver.createAccessor(this._storage);
    this._renderer = renderer || new GpuParticleRenderer({});
    this._compiler = new ModifierCompiler();
    this._executor = this._mode === "compute" ? null : new GpuPassExecutor();
    this._computeDispatcher = null;
    this._uniforms = new GpuUniformLayout();
    this._modifiers = [];
    this._isDirty = true;
    this._program = null;
    this._gpuProgram = null;
    this._isUpdating = false;
    this._pendingRemove = null;
    this._pendingAdd = null;
    this._sortManager = new ParticleSortManager(this._storage);
    this._commandBuffer = new ParticleRenderCommandBuffer();
    this._activeSlots = [];
    this._webgpuInitialized = false;
    this._gpuRenderer = null;
  }

  get renderValidationMode() { return this._renderValidationMode; }
  set renderValidationMode(v) { this._renderValidationMode = v; }

  async _ensureWebGpu() {
    if (this._webgpuInitialized) return;
    if (!WebGpuDeviceManager.isAvailable()) {
      throw new Error("WebGPU not available — falling back to operator mode");
    }
    await WebGpuDeviceManager.initialize();
    this._computeDispatcher = new GpuComputeDispatcher();
    this._webgpuInitialized = true;

    if (this._canvas) {
      this._gpuRenderer = new WebGpuParticleRenderer({
        canvas: this._canvas,
      });
      await this._gpuRenderer.initialize();
    }
  }

  _rebuildProgram() {
    if (!this._isDirty) return;
    const descriptors = [];
    for (const entry of this._modifiers) {
      const mod = entry.modifier;
      if (typeof mod.toDescriptor === "function") {
        descriptors.push(mod.toDescriptor());
      }
    }
    this._program = descriptors.length > 0
      ? this._compiler.compile(descriptors)
      : null;
    this._gpuProgram = null;
    if (this._program && this._mode === "compute") {
      const gen = new WgslGenerator();
      this._gpuProgram = gen.generate(this._program);
    }
    this._isDirty = false;
  }

  addModifier(modifier, priority) {
    if (priority === undefined) priority = modifier.priority ?? 0;
    this._modifiers.push({ modifier, priority });
    this._modifiers.sort((a, b) => a.priority - b.priority);
    this._isDirty = true;
  }

  removeModifier(modifier) {
    if (this._isUpdating) {
      if (!this._pendingRemove) this._pendingRemove = [];
      this._pendingRemove.push(modifier);
      return;
    }
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      if (mods[i].modifier === modifier) {
        mods[i].modifier.destroy?.();
        mods.splice(i, 1);
        this._isDirty = true;
        return;
      }
    }
  }

  clearModifiers() {
    const mods = this._modifiers;
    for (let i = 0; i < mods.length; i++) {
      mods[i].modifier.destroy?.();
    }
    this._modifiers.length = 0;
    this._isDirty = true;
  }

  _flushPendingRemovals() {
    if (!this._pendingRemove) return;
    const pending = this._pendingRemove;
    this._pendingRemove = null;
    for (let i = 0; i < pending.length; i++) {
      this.removeModifier(pending[i]);
    }
  }

  _buildRenderData(indices, count) {
    return new ParticleRenderData(this._storage, indices, count);
  }

  _refreshSlotIndices() {
    const accessors = this._storage.activeParticles;
    const count = accessors.length;
    for (let i = 0; i < count; i++) {
      this._activeSlots[i] = accessors[i]._i;
    }
    this._activeSlots.length = count;
  }

  get sortMode() { return this._sortManager.sortMode; }
  set sortMode(value) { this._sortManager.sortMode = value; }

  get sortFunction() { return this._sortManager.sortFunction; }
  set sortFunction(value) { this._sortManager.sortFunction = value; }

  get sortedParticleCount() { return this._sortManager.sortedParticleCount; }

  get sortEveryFrame() { return this._sortManager.sortEveryFrame; }
  set sortEveryFrame(value) { this._sortManager.sortEveryFrame = value; }

  setCollisionProvider(provider) {
    this._collisionProvider = provider;
  }

  destroy() {
    this.clear();
    this.clearModifiers();
    this._renderer.destroy();
    this._renderer = null;
    if (this._executor) this._executor.releaseAll();
    if (this._computeDispatcher) this._computeDispatcher.destroy();
    if (this._gpuRenderer) this._gpuRenderer.destroy();
    this._sortManager.destroy();
    this._storage = null;
    this._accessor = null;
    this._program = null;
    this._compiler = null;
    this._executor = null;
    this._computeDispatcher = null;
    this._gpuRenderer = null;
  }

  emit(count, initializer, emitter) {
    this._rebuildProgram();
    const acc = this._accessor;
    const executor = this._executor;

    for (let i = 0; i < count; i++) {
      const p = this._storage.acquire();
      p.__jygameSortOrder = this._sortManager.nextSortOrder();
      acc.wrap(p);
      if (initializer) initializer(p, i, emitter);

      if (executor) {
        const program = this._program;
        const passes = program
          ? [program.integrationPass, program.forcePass, program.visualPass]
          : [];
        const view = this._useSoA ? this._getOrCreateView() : null;
        const slot = this._useSoA ? p._i : null;
        for (let d = 0; d < passes.length; d++) {
          for (let m = 0; m < passes[d].length; m++) {
            executor.runOnEmit(passes[d][m], view, slot, p);
          }
        }
      }
    }
    if (this._sortManager.sortMode !== "none") this._sortManager.markDirty();
  }

  emitOne(initializer) {
    this._rebuildProgram();
    const p = this._storage.acquire();
    p.__jygameSortOrder = this._sortManager.nextSortOrder();
    const acc = this._accessor;
    acc.wrap(p);
    if (initializer) initializer(p, 0);

    const executor = this._executor;
    if (executor) {
      const program = this._program;
      if (program) {
        const view = this._useSoA ? this._getOrCreateView() : null;
        const slot = this._useSoA ? p._i : null;
        const passes = [program.integrationPass, program.forcePass, program.visualPass];
        for (let d = 0; d < passes.length; d++) {
          for (let m = 0; m < passes[d].length; m++) {
            executor.runOnEmit(passes[d][m], view, slot, p);
          }
        }
      }
    }

    if (this._sortManager.sortMode !== "none") this._sortManager.markDirty();
    return p;
  }

  _getOrCreateView() {
    if (!this._view) {
      this._view = new SimulationBufferView(this._storage);
    }
    return this._view;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    this._rebuildProgram();
    this._isUpdating = true;

    const storage = this._storage;
    const accessors = storage.activeParticles;

    if (this._mode === "compute") {
      this._updateCompute(dt, storage, accessors);
    } else {
      const program = this._program;
      const executor = this._executor;

      executor.updateTime(dt);
      const uniforms = { dt, elapsedTime: executor._elapsedTime };

      if (program) {
        executor.beginFrame(program.integrationPass, dt, uniforms);
        executor.beginFrame(program.forcePass, dt, uniforms);
        executor.beginFrame(program.visualPass, dt, uniforms);
      }

      if (this._useSoA) {
        this._updateSoA(dt, storage, accessors, program, executor, uniforms);
      } else {
        this._updateObject(dt, storage, accessors, program, executor);
      }
    }

    if (this._sortManager.sortMode !== "none") {
      this._sortManager.markDirty();
    }

    this._isUpdating = false;
    this._flushPendingRemovals();
  }

  _updateSoA(dt, storage, accessors, program, executor, uniforms) {
    const view = this._getOrCreateView();
    const count = accessors.length;
    this._refreshSlotIndices();

    for (let i = 0; i < count; i++) {
      view.integrate(this._activeSlots[i], dt);
    }

    if (program) {
      if (program.integrationPass.length > 0) {
        executor.runPass(program.integrationPass, view, dt, uniforms, this._activeSlots, count);
      }
      if (program.forcePass.length > 0) {
        executor.runPass(program.forcePass, view, dt, uniforms, this._activeSlots, count);
      }
      if (program.visualPass.length > 0) {
        executor.runPass(program.visualPass, view, dt, uniforms, this._activeSlots, count);
      }
    }

    let remaining = count;
    let idx = 0;
    while (idx < remaining) {
      const slot = this._activeSlots[idx];
      if (view.life(slot) <= 0) {
        executor.releaseStateById(view.id(slot));
        storage.release(accessors[idx]);
        remaining--;
        this._activeSlots.length = remaining;
        for (let j = idx; j < remaining; j++) {
          this._activeSlots[j] = accessors[j]._i;
        }
      } else {
        idx++;
      }
    }
  }

  _updateObject(dt, storage, active, program, executor) {
    const view = null;
    const count = active.length;
    const acc = this._accessor;

    for (let i = 0; i < count; i++) {
      storage.integrateParticle(active[i], dt);
    }

    if (program) {
      if (program.integrationPass.length > 0) {
        executor.runPassObject(program.integrationPass, acc, dt, active);
      }
      if (program.forcePass.length > 0) {
        executor.runPassObject(program.forcePass, acc, dt, active);
      }
      if (program.visualPass.length > 0) {
        executor.runPassObject(program.visualPass, acc, dt, active);
      }
    }

    let i = 0;
    while (i < active.length) {
      acc.wrap(active[i]);
      if (acc.life <= 0) {
        executor.releaseState(active[i]);
        storage.release(active[i]);
      } else {
        i++;
      }
    }
  }

  async _updateCompute(dt, storage, accessors) {
    if (!this._webgpuInitialized) {
      try {
        await this._ensureWebGpu();
      } catch (e) {
        this._mode = "operator";
        this._executor = new GpuPassExecutor();
        this.update(dt);
        return;
      }
    }

    const dispatcher = this._computeDispatcher;
    const program = this._gpuProgram;
    if (!program) {
      this._isUpdating = false;
      this._flushPendingRemovals();
      return;
    }

    if (!dispatcher._program) {
      dispatcher.setProgram(program);
    }

    const count = accessors.length;
    if (count === 0) {
      this._isUpdating = false;
      this._flushPendingRemovals();
      return;
    }

    this._elapsedTime = (this._elapsedTime || 0) + dt;
    const uniforms = { dt, elapsedTime: this._elapsedTime };

    if (this._gpuRenderer && !this._renderValidationMode) {
      // GPU-native path: dispatch without readback
      dispatcher.dispatchOnly(storage, uniforms);

      // Death sweep requires particle data. Without readback, we cannot
      // release dead particles on CPU. The renderer handles them via
      // life <= 0 check in the vertex shader. Storage reclamation is
      // deferred (handled in renderValidationMode or on demand).
    } else {
      // Readback path: dispatch + download for validation or fallback
      await dispatcher.dispatch(storage, uniforms);

      // Death sweep after readback
      let i = 0;
      while (i < accessors.length) {
        const p = accessors[i];
        const life = storage.getFieldValue(i, "life");
        if (life <= 0) {
          storage.release(p);
        } else {
          i++;
        }
      }
    }
  }

  _activeParticleCount() {
    return this._storage.activeCount;
  }

  render(ctx) {
    const count = this._activeParticleCount();
    if (count === 0) return;

    if (this._gpuRenderer && !this._renderValidationMode && this._mode === "compute") {
      // GPU-native render path: read directly from compute buffer
      const buffer = this._computeDispatcher.gpuBuffer;
      if (buffer) {
        this._gpuRenderer.setParticleBuffer(buffer);
        this._gpuRenderer.render(count, null);
      }
      return;
    }

    // Legacy render path: build render data, fill command buffer, render
    let renderData;
    if (this._sortManager.sortMode === "none") {
      renderData = this._buildRenderData(null, count);
    } else {
      this._sortManager.sort();
      renderData = this._buildRenderData(this._sortManager.sortedIndices, count);
    }

    const buf = this._commandBuffer;
    buf.clear();
    renderData.fillCommandBuffer(buf);
    this._renderer.render(buf, ctx);
  }

  clear() {
    this._storage.clear();
    if (this._executor) this._executor.releaseAll();
  }

  warmup(count) {
    this._storage.warmup(count);
  }

  get particles() {
    return this._storage.activeParticles;
  }

  get activeCount() {
    return this._storage.activeCount;
  }

  get freeCount() {
    return this._storage.freeCount;
  }

  get capacity() {
    return this._storage.capacity;
  }

  get peakActive() {
    return this._storage.peakActive;
  }

  get peakCapacity() {
    return this._storage.peakCapacity;
  }

  get peakFree() {
    return this._storage.peakFree;
  }

  get totalCreated() {
    return this._storage.totalCreated;
  }

  get isEmpty() {
    return this.activeCount === 0;
  }

  get hasParticles() {
    return this.activeCount > 0;
  }

  get modifierCount() {
    return this._modifiers.length;
  }
}
