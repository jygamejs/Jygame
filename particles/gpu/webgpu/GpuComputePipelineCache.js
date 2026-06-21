import { WebGpuDeviceManager } from "./WebGpuDeviceManager.js";

export class GpuComputePipelineCache {
  constructor() {
    this._device = WebGpuDeviceManager.device();
    this._modules = new Map();
    this._pipelines = new Map();
    this._bindGroupLayouts = new Map();
    this._bindGroups = new Map();
  }

  _key(program) {
    return program.hash || program.shaderSource;
  }

  getShaderModule(program) {
    const key = this._key(program);
    let module = this._modules.get(key);
    if (!module) {
      module = this._device.createShaderModule({ code: program.shaderSource });
      this._modules.set(key, module);
    }
    return module;
  }

  getBindGroupLayout(program) {
    const bindings = program.bindings || [];
    const key = bindings.join(",");
    let layout = this._bindGroupLayouts.get(key);
    if (!layout) {
      const entries = [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ];
      layout = this._device.createBindGroupLayout({ entries });
      this._bindGroupLayouts.set(key, layout);
    }
    return layout;
  }

  getPipeline(program, bindGroupLayout) {
    const key = this._key(program);
    let pipeline = this._pipelines.get(key);
    if (!pipeline) {
      const module = this.getShaderModule(program);
      const layout = this._device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      });
      pipeline = this._device.createComputePipeline({
        layout,
        compute: { module, entryPoint: "main" },
      });
      this._pipelines.set(key, pipeline);
    }
    return pipeline;
  }

  getBindGroup(bindGroupLayout, particleBuffer, uniformBuffer) {
    const key = `${particleBuffer._buffer}:${uniformBuffer._buffer}`;
    let bindGroup = this._bindGroups.get(key);
    if (!bindGroup) {
      bindGroup = this._device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: particleBuffer.buffer } },
          { binding: 1, resource: { buffer: uniformBuffer.buffer } },
        ],
      });
      this._bindGroups.set(key, bindGroup);
    }
    return bindGroup;
  }

  clear() {
    this._modules.clear();
    this._pipelines.clear();
    this._bindGroupLayouts.clear();
    this._bindGroups.clear();
  }

  destroy() {
    this.clear();
    this._device = null;
  }
}
