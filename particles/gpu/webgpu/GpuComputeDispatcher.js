import { WebGpuDeviceManager } from "./WebGpuDeviceManager.js";
import { GpuComputePipelineCache } from "./GpuComputePipelineCache.js";
import { GpuParticleBuffer } from "./GpuParticleBuffer.js";
import { GpuUniformBuffer } from "./GpuUniformBuffer.js";
import { toWebGpuWgsl } from "./WebGpuWgslConverter.js";

export class GpuComputeDispatcher {
  constructor() {
    this._device = WebGpuDeviceManager.device();
    this._pipelineCache = new GpuComputePipelineCache();
    this._particleBuffer = null;
    this._uniformBuffer = new GpuUniformBuffer();
    this._program = null;
    this._wgslSource = null;
  }

  setProgram(program) {
    const rawWgsl = program.shaderSource;
    const converted = toWebGpuWgsl(rawWgsl);
    this._wgslSource = converted;

    this._program = Object.assign(Object.create(Object.getPrototypeOf(program)), program);
    this._program.shaderSource = converted;
    this._program.hash = rawWgsl;

    const module = this._pipelineCache.getShaderModule(this._program);
    const bindGroupLayout = this._pipelineCache.getBindGroupLayout(this._program);
    const pipeline = this._pipelineCache.getPipeline(this._program, bindGroupLayout);
    this._pipeline = pipeline;
    this._bindGroupLayout = bindGroupLayout;
  }

  ensureParticleBuffer(capacity) {
    if (!this._particleBuffer) {
      this._particleBuffer = new GpuParticleBuffer(capacity);
    } else if (capacity > this._particleBuffer.capacity) {
      this._particleBuffer.resize(capacity);
    }
  }

  _submitCompute(count) {
    const workgroupSize = 64;
    const dispatchCount = Math.ceil(count / workgroupSize);
    const commandEncoder = this._device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._computeBindGroup);
    pass.dispatchWorkgroups(dispatchCount);
    pass.end();
    this._device.queue.submit([commandEncoder.finish()]);
  }

  _ensureComputeBindGroup() {
    if (this._computeBindGroup) return;
    this._computeBindGroup = this._pipelineCache.getBindGroup(
      this._bindGroupLayout,
      this._particleBuffer,
      this._uniformBuffer,
    );
  }

  // Upload + dispatch only (no readback). Returns particleCount for renderer use.
  dispatchOnly(storage, uniforms) {
    const count = storage.activeCount;
    if (count === 0) return 0;

    this.ensureParticleBuffer(Math.max(1024, storage.capacity));

    this._particleBuffer.upload(storage);
    this._uniformBuffer.write({ ...uniforms, particleCount: count });

    this._ensureComputeBindGroup();
    this._submitCompute(count);

    return count;
  }

  // Full path: upload → dispatch → readback. For validation mode.
  // Uses a serialization guard to prevent overlapping mapAsync calls.
  async dispatch(storage, uniforms) {
    // Wait for prior dispatch to finish before starting a new one
    if (this._pendingDispatch) {
      await this._pendingDispatch;
    }

    const count = storage.activeCount;
    if (count === 0) return 0;

    this.ensureParticleBuffer(Math.max(1024, storage.capacity));

    this._particleBuffer.upload(storage);
    this._uniformBuffer.write({ ...uniforms, particleCount: count });

    this._ensureComputeBindGroup();
    this._submitCompute(count);

    this._pendingDispatch = this._particleBuffer.download(storage);
    try {
      await this._pendingDispatch;
      return count;
    } finally {
      this._pendingDispatch = null;
    }
  }

  // Expose GPU buffer for WebGPU renderer (reads via storage binding)
  get gpuBuffer() {
    return this._particleBuffer ? this._particleBuffer.buffer : null;
  }

  get uniformBuffer() {
    return this._uniformBuffer;
  }

  releaseState(particle) {
    // WebGPU compute path has no CPU-side state to release
  }

  releaseStateById(id) {
    // WebGPU compute path has no CPU-side state to release
  }

  releaseAll() {
    // No CPU state to release
  }

  destroy() {
    if (this._particleBuffer) {
      this._particleBuffer.destroy();
      this._particleBuffer = null;
    }
    if (this._uniformBuffer) {
      this._uniformBuffer.destroy();
      this._uniformBuffer = null;
    }
    this._pipelineCache.destroy();
    this._pipeline = null;
    this._bindGroupLayout = null;
    this._computeBindGroup = null;
    this._program = null;
  }
}
