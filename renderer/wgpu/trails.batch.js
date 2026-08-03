import { TRAIL_VERTEX_WGSL, TRAIL_FRAGMENT_WGSL } from "./index.js";

const FLOATS_PER_VERTEX = 5; // aPos(2) + aColor(3), 20 bytes

// Batches trail geometry as a single contiguous triangle strip with the same
// ribbon construction (per-point edge offsets along the segment normal) and
// degenerate bridge vertices between trails as the GL `TrailBatch`. Trails
// arrive pre-sorted by depth, preserving painter order in one draw call.
export class WgpuTrailBatch {
  constructor(device, { format, maxVertices = 16384 } = {}) {
    this._device = device;
    this._maxVertices = maxVertices;
    this._data = new Float32Array(maxVertices * FLOATS_PER_VERTEX);
    this._vertexCount = 0;
    this._pointScratch = new Float32Array(4096 * 2);
    this._lastNx = 0;
    this._lastNy = 0;

    this._vertexBuffer = device.createBuffer({
      size: this._data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this._uniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._bindGroupLayout],
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: TRAIL_VERTEX_WGSL }),
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: FLOATS_PER_VERTEX * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x3" },
            ],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code: TRAIL_FRAGMENT_WGSL }),
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
      primitive: { topology: "triangle-strip" },
    });

    this._cameraBindGroup = device.createBindGroup({
      layout: this._bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._uniformBuffer } }],
    });
  }

  get vertexCount() {
    return this._vertexCount;
  }

  reset() {
    this._vertexCount = 0;
    this._lastNx = 0;
    this._lastNy = 0;
  }

  setMatrix(matrix) {
    this._device.queue.writeBuffer(this._uniformBuffer, 0, matrix);
  }

  addTrail(buffer, color, width) {
    const n = buffer.count;
    if (n < 2) return;
    const halfWidth = width * 0.5;
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;

    if (n * 2 > this._pointScratch.length) {
      this._pointScratch = new Float32Array(n * 2);
    }
    const pts = this._pointScratch;
    let pi = 0;
    buffer.forEachPoint((x, y) => {
      pts[pi++] = x;
      pts[pi++] = y;
    });

    if (this._vertexCount > 0) {
      const off = (this._vertexCount - 1) * FLOATS_PER_VERTEX;
      const d = this._data;
      const lx = d[off];
      const ly = d[off + 1];
      const lr = d[off + 2];
      const lg = d[off + 3];
      const lb = d[off + 4];
      this._emit(lx, ly, lr, lg, lb);
      this._emit(lx, ly, lr, lg, lb);
    }

    for (let k = 0; k < n; k++) {
      const x = pts[k * 2];
      const y = pts[k * 2 + 1];
      let nx, ny;
      if (k < n - 1) {
        const dx = pts[k * 2 + 2] - x;
        const dy = pts[k * 2 + 3] - y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) {
          nx = 0;
          ny = 0;
        } else {
          nx = -dy / len;
          ny = dx / len;
        }
        this._lastNx = nx;
        this._lastNy = ny;
      } else {
        nx = this._lastNx;
        ny = this._lastNy;
      }
      this._emit(x - nx * halfWidth, y - ny * halfWidth, r, g, b);
      this._emit(x + nx * halfWidth, y + ny * halfWidth, r, g, b);
    }
  }

  _emit(x, y, r, g, b) {
    if (this._vertexCount >= this._maxVertices) this._grow();
    const off = this._vertexCount * FLOATS_PER_VERTEX;
    const d = this._data;
    d[off] = x;
    d[off + 1] = y;
    d[off + 2] = r;
    d[off + 3] = g;
    d[off + 4] = b;
    this._vertexCount++;
  }

  flush(pass) {
    if (this._vertexCount === 0) return;
    const device = this._device;
    device.queue.writeBuffer(
      this._vertexBuffer,
      0,
      this._data.subarray(0, this._vertexCount * FLOATS_PER_VERTEX),
    );
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._cameraBindGroup);
    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.draw(this._vertexCount);
    this._vertexCount = 0;
  }

  _grow() {
    this._maxVertices *= 2;
    const data = new Float32Array(this._maxVertices * FLOATS_PER_VERTEX);
    data.set(this._data);
    this._data = data;
    this._device.queue.writeBuffer(this._vertexBuffer, 0, data);
  }

  destroy() {
    const device = this._device;
    if (!device) return;
    if (this._vertexBuffer && this._vertexBuffer.destroy) this._vertexBuffer.destroy();
    if (this._uniformBuffer && this._uniformBuffer.destroy) this._uniformBuffer.destroy();
    this._vertexBuffer = null;
    this._uniformBuffer = null;
  }
}
