import { WebGpuDeviceManager } from "./WebGpuDeviceManager.js";
import { ParticleBufferLayout } from "../ParticleBufferLayout.js";

const FLOAT_FIELDS = ParticleBufferLayout.FIELD_NAMES.filter(n => n !== "r" && n !== "g" && n !== "b");
const UINT_FIELDS = ["r", "g", "b"];
const STRIDE = ParticleBufferLayout.STRIDE; // 17 floats per particle
const FLOAT_BYTES = 4;

export class GpuParticleBuffer {
  constructor(capacity = 1024) {
    this._capacity = capacity;
    this._device = WebGpuDeviceManager.device();
    this._buffer = null;
    this._stagingBuffer = null;
    this._byteSize = 0;
    this._allocate(capacity);
  }

  _allocate(capacity) {
    const device = this._device;
    const byteSize = STRIDE * capacity * FLOAT_BYTES;
    this._byteSize = byteSize;

    if (this._buffer) this._buffer.destroy();
    if (this._stagingBuffer) this._stagingBuffer.destroy();

    this._buffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    this._stagingBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this._capacity = capacity;
  }

  upload(storage) {
    const device = this._device;
    const capacity = this._capacity;
    const floatCount = STRIDE * capacity;

    const data = new Float32Array(floatCount);

    const count = storage.activeCount;

    for (let i = 0; i < count; i++) {
      for (let f = 0; f < STRIDE; f++) {
        const name = ParticleBufferLayout.FIELD_NAMES[f];
        let val = storage.getFieldValue(i, name);
        if (f >= 14 && f <= 16) val = Math.round(val);
        data[i * STRIDE + f] = val;
      }
    }

    device.queue.writeBuffer(this._buffer, 0, data.buffer, 0, floatCount * FLOAT_BYTES);
  }

  async download(storage) {
    const device = this._device;
    const capacity = this._capacity;
    const floatCount = STRIDE * capacity;
    const byteSize = this._byteSize;

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(this._buffer, 0, this._stagingBuffer, 0, byteSize);
    device.queue.submit([commandEncoder.finish()]);

    await this._stagingBuffer.mapAsync(GPUMapMode.READ);
    const mapped = new Float32Array(this._stagingBuffer.getMappedRange());
    const count = storage.activeCount;

    for (let i = 0; i < count; i++) {
      for (let f = 0; f < STRIDE; f++) {
        const name = ParticleBufferLayout.FIELD_NAMES[f];
        const val = mapped[i * STRIDE + f];
        storage.setFieldValue(i, name, name === "r" || name === "g" || name === "b" ? Math.round(val) : val);
      }
    }

    this._stagingBuffer.unmap();
  }

  resize(newCapacity) {
    if (newCapacity <= this._capacity) return;
    this._allocate(newCapacity);
  }

  get capacity() { return this._capacity; }
  get buffer() { return this._buffer; }
  get byteSize() { return this._byteSize; }

  destroy() {
    if (this._stagingBuffer) {
      try { this._stagingBuffer.unmap(); } catch {}
      this._stagingBuffer.destroy();
      this._stagingBuffer = null;
    }
    if (this._buffer) { this._buffer.destroy(); this._buffer = null; }
  }
}
