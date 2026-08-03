import { SPRITE_VERTEX_WGSL, SPRITE_FRAGMENT_WGSL } from "./index.js";

// Per-instance stride in floats. The WGSL struct pads the 17 used fields with
// 3 trailing floats so each instance is 80 bytes (a multiple of 16), keeping
// the storage-buffer array stride alignment legal.
const FLOATS_PER_INSTANCE = 20;
const USED_FLOATS = 17;

// Offsets of the used fields within the interleaved instance data.
const FIELD = {
  x: 0, y: 1, rotation: 2, scaleX: 3,
  scaleY: 4, width: 5, height: 6, u0: 7,
  v0: 8, u1: 9, v1: 10, r: 11,
  g: 12, b: 13, a: 14, depth: 15,
  shape: 16,
};

// Instanced-quad batch for WebGPU. Instance data is written to a storage
// buffer and consumed by the vertex shader through `instance_index`; the
// camera matrix lives in a uniform buffer. Mirrors the GL `QuadBatch` layout
// so both renderers produce identical geometry.
export class WgpuSpriteBatch {
  constructor(device, { format, maxInstances = 4096 } = {}) {
    this._device = device;
    this._format = format;
    this._maxInstances = maxInstances;
    this._data = new Float32Array(maxInstances * FLOATS_PER_INSTANCE);
    this._count = 0;

    this._instanceBuffer = device.createBuffer({
      size: this._data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._uniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._bindGroupLayout0 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });
    this._bindGroupLayout1 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._bindGroupLayout0, this._bindGroupLayout1],
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: SPRITE_VERTEX_WGSL }),
        entryPoint: "vs_main",
      },
      fragment: {
        module: device.createShaderModule({ code: SPRITE_FRAGMENT_WGSL }),
        entryPoint: "fs_main",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    this._cameraBindGroup = device.createBindGroup({
      layout: this._bindGroupLayout0,
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
        { binding: 1, resource: { buffer: this._instanceBuffer } },
      ],
    });
    this._textureBindGroup = null;
  }

  get count() {
    return this._count;
  }

  get data() {
    return this._data;
  }

  reset() {
    this._count = 0;
  }

  setMatrix(matrix) {
    this._device.queue.writeBuffer(this._uniformBuffer, 0, matrix);
  }

  setTexture(view, sampler) {
    this._textureBindGroup = this._device.createBindGroup({
      layout: this._bindGroupLayout1,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: view },
      ],
    });
  }

  add(inst) {
    if (this._count >= this._maxInstances) this._grow();
    const off = this._count * FLOATS_PER_INSTANCE;
    const d = this._data;
    d[off + FIELD.x] = inst.x;
    d[off + FIELD.y] = inst.y;
    d[off + FIELD.rotation] = inst.rotation;
    d[off + FIELD.scaleX] = inst.scaleX;
    d[off + FIELD.scaleY] = inst.scaleY;
    d[off + FIELD.width] = inst.width;
    d[off + FIELD.height] = inst.height;
    d[off + FIELD.u0] = inst.u0;
    d[off + FIELD.v0] = inst.v0;
    d[off + FIELD.u1] = inst.u1;
    d[off + FIELD.v1] = inst.v1;
    d[off + FIELD.r] = inst.r;
    d[off + FIELD.g] = inst.g;
    d[off + FIELD.b] = inst.b;
    d[off + FIELD.a] = inst.a;
    d[off + FIELD.depth] = Math.max(-0.99, Math.min(0.99, inst.depth || 0));
    d[off + FIELD.shape] = inst.shape;
    this._count++;
  }

  flush(pass) {
    if (this._count === 0) return;
    const device = this._device;
    device.queue.writeBuffer(
      this._instanceBuffer,
      0,
      this._data.subarray(0, this._count * FLOATS_PER_INSTANCE),
    );
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._cameraBindGroup);
    if (this._textureBindGroup) pass.setBindGroup(1, this._textureBindGroup);
    pass.draw(4, this._count);
    this._count = 0;
  }

  _grow() {
    this._maxInstances *= 2;
    const data = new Float32Array(this._maxInstances * FLOATS_PER_INSTANCE);
    data.set(this._data);
    this._data = data;
    this._device.queue.writeBuffer(this._instanceBuffer, 0, data);
  }

  destroy() {
    const device = this._device;
    if (!device) return;
    if (this._instanceBuffer && this._instanceBuffer.destroy) this._instanceBuffer.destroy();
    if (this._uniformBuffer && this._uniformBuffer.destroy) this._uniformBuffer.destroy();
    this._instanceBuffer = null;
    this._uniformBuffer = null;
  }
}
