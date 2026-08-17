// Defines the standard WebGPU enum constants on globalThis (browsers provide
// them natively; Node does not) and builds a mock GPU device/context that
// records every call for assertions. Mirrors the MockGL helper.
export function ensureGPUGlobals() {
  if (typeof globalThis.GPUBufferUsage === "undefined") {
    globalThis.GPUBufferUsage = {
      MAP_READ: 0x0001, MAP_WRITE: 0x0002, COPY_SRC: 0x0004, COPY_DST: 0x0008,
      INDEX: 0x0010, VERTEX: 0x0020, UNIFORM: 0x0040, STORAGE: 0x0080,
      INDIRECT: 0x0100, QUERY_RESOLVE: 0x0200,
    };
  }
  if (typeof globalThis.GPUTextureUsage === "undefined") {
    globalThis.GPUTextureUsage = {
      COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04,
      STORAGE_BINDING: 0x08, RENDER_ATTACHMENT: 0x10,
    };
  }
  if (typeof globalThis.GPUShaderStage === "undefined") {
    globalThis.GPUShaderStage = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 };
  }
}

function makeLog() {
  return {
    createBuffer: [],
    createBindGroupLayout: [],
    createPipelineLayout: [],
    createBindGroup: [],
    createRenderPipeline: [],
    createShaderModule: [],
    createSampler: [],
    createTexture: [],
    writeBuffer: [],
    writeTexture: [],
    copyExternalImageToTexture: [],
    configure: [],
    beginRenderPass: [],
    setPipeline: [],
    setBindGroup: [],
    setVertexBuffer: [],
    setIndexBuffer: [],
    draw: [],
    drawIndexed: [],
    finish: [],
    submit: [],
    createView: [],
  };
}

export function makeMockGPU({ preferredCanvasFormat = "bgra8unorm", width = 800, height = 600 } = {}) {
  ensureGPUGlobals();
  const log = makeLog();

  const mockBuffer = (size, usage) => ({
    size,
    usage,
    _data: new Uint8Array(0),
    _destroyed: false,
    destroy() { this._destroyed = true; },
  });

  const queue = {
    writeBuffer(buffer, bufferOffset, data, dataOffset = 0, size) {
      const src = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset + dataOffset)
        : new Uint8Array(data, dataOffset);
      const byteLength = size !== undefined ? size : src.byteLength;
      const copy = new Uint8Array(byteLength);
      copy.set(src.subarray(0, byteLength));
      buffer._data = copy;
      log.writeBuffer.push({ buffer, bufferOffset, data: copy, byteLength });
    },
    writeTexture: (...args) => log.writeTexture.push(args),
    copyExternalImageToTexture: (...args) => log.copyExternalImageToTexture.push(args),
    submit: (encoders) => { log.submit.push({ encoders, count: encoders.length }); },
  };

  const device = {
    queue,
    createBuffer: (desc) => {
      const buffer = mockBuffer(desc.size, desc.usage);
      log.createBuffer.push({ desc, buffer });
      return buffer;
    },
    createBindGroupLayout: (desc) => {
      const layout = { kind: "bind-group-layout", desc };
      log.createBindGroupLayout.push(layout);
      return layout;
    },
    createPipelineLayout: (desc) => {
      const layout = { kind: "pipeline-layout", desc };
      log.createPipelineLayout.push(layout);
      return layout;
    },
    createBindGroup: (desc) => {
      const group = { kind: "bind-group", desc };
      log.createBindGroup.push(group);
      return group;
    },
    createRenderPipeline: (desc) => {
      const pipeline = { kind: "render-pipeline", desc };
      log.createRenderPipeline.push(pipeline);
      return pipeline;
    },
    createShaderModule: (desc) => {
      const module = { kind: "shader-module", code: desc.code };
      log.createShaderModule.push(module);
      return module;
    },
    createSampler: (desc) => {
      const sampler = { kind: "sampler", desc };
      log.createSampler.push(sampler);
      return sampler;
    },
    createTexture: (desc) => {
      const texture = {
        kind: "texture",
        width: desc.size.width,
        height: desc.size.height,
        format: desc.format,
        usage: desc.usage,
        _destroyed: false,
        createView: () => {
          const view = { kind: "texture-view", texture };
          log.createView.push(view);
          return view;
        },
        destroy() { this._destroyed = true; },
      };
      log.createTexture.push(texture);
      return texture;
    },
    createCommandEncoder: () => makeEncoder(log),
    destroy: () => {},
  };

  function makeEncoder() {
    const pass = {
      setPipeline: (p) => log.setPipeline.push(p),
      setBindGroup: (index, group) => log.setBindGroup.push({ index, group }),
      setVertexBuffer: (slot, buffer) => log.setVertexBuffer.push({ slot, buffer }),
      setIndexBuffer: (buffer, format) => log.setIndexBuffer.push({ buffer, format }),
      draw: (vertexCount, instanceCount = 1) => log.draw.push({ vertexCount, instanceCount }),
      drawIndexed: (indexCount, instanceCount = 1) => log.drawIndexed.push({ indexCount, instanceCount }),
      end: () => {},
    };
    return {
      beginRenderPass: (desc) => {
        log.beginRenderPass.push(desc);
        return pass;
      },
      finish: () => {
        log.finish.push(true);
        return "encoder";
      },
    };
  }

  const currentTexture = {
    width,
    height,
    createView: () => {
      const view = { kind: "texture-view", texture: currentTexture };
      log.createView.push(view);
      return view;
    },
  };

  const context = {
    configure: (desc) => log.configure.push(desc),
    getCurrentTexture: () => currentTexture,
    canvas: { width, height },
  };

  const gpu = {
    getPreferredCanvasFormat: () => preferredCanvasFormat,
    requestAdapter: async () => null,
    requestDevice: async () => device,
  };

  return { device, context, gpu, log, currentTexture };
}
