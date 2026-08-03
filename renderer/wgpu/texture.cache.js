// Uploads source images to WebGPU textures lazily, keyed by the image object,
// and owns the shared linear sampler. Accepts images with raw pixel data (used
// by tests) or anything `copyExternalImageToTexture` can consume.
export class WgpuTextureCache {
  constructor(device) {
    this._device = device;
    this._cache = new Map();
    this._white = null;
    this._sampler = null;
  }

  sampler() {
    if (this._sampler) return this._sampler;
    this._sampler = this._device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    return this._sampler;
  }

  get(sourceImage) {
    let entry = this._cache.get(sourceImage);
    if (entry) return entry;

    const device = this._device;
    const width = (sourceImage.width ?? sourceImage.naturalWidth) || 1;
    const height = (sourceImage.height ?? sourceImage.naturalHeight) || 1;
    const texture = device.createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    if (sourceImage.data) {
      device.queue.writeTexture(
        { texture },
        sourceImage.data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height, depthOrArrayLayers: 1 },
      );
    } else if (typeof device.queue.copyExternalImageToTexture === "function") {
      device.queue.copyExternalImageToTexture(
        { source: sourceImage },
        { texture },
        { width, height },
      );
    }

    const view = texture.createView();
    entry = { texture, view, width, height };
    this._cache.set(sourceImage, entry);
    return entry;
  }

  white() {
    if (this._white) return this._white;
    const device = this._device;
    const texture = device.createTexture({
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture },
      new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );
    const view = texture.createView();
    this._white = { texture, view, width: 1, height: 1 };
    return this._white;
  }

  destroy() {
    const device = this._device;
    for (const entry of this._cache.values()) {
      if (entry.texture && entry.texture.destroy) entry.texture.destroy();
    }
    this._cache.clear();
    if (this._white) {
      if (this._white.texture && this._white.texture.destroy) this._white.texture.destroy();
      this._white = null;
    }
    this._sampler = null;
  }
}
