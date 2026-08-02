import { CpuParticleBackend } from "./backends/CpuParticleBackend.js";
import { GpuParticleBackend } from "./backends/GpuParticleBackend.js";
import { CanvasParticleRenderer } from "./renderers/CanvasParticleRenderer.js";
import { GpuParticleRenderer } from "./renderers/GpuParticleRenderer.js";
import { WebGpuDeviceManager } from "./gpu/webgpu/WebGpuDeviceManager.js";

export class RendererResolver {
  static resolve(backend) {
    if (backend === "gpu") {
      return new GpuParticleRenderer({});
    }
    return new CanvasParticleRenderer({});
  }
}

export class BackendResolver {
  static resolve({ backend, storage } = {}) {
    if (backend === "cpu") {
      return new CpuParticleBackend({ storage, renderer: RendererResolver.resolve("cpu") });
    }
    if (backend === "gpu") {
      return new GpuParticleBackend({ storage, renderer: RendererResolver.resolve("gpu") });
    }
    if (backend != null && typeof backend !== "string") {
      return backend;
    }
    if (WebGpuDeviceManager.isAvailable()) {
      try {
        return new GpuParticleBackend({ storage, renderer: RendererResolver.resolve("gpu") });
      } catch (err) {
        // GPU renderer unavailable — fall back to the CPU backend
      }
    }
    return new CpuParticleBackend({ storage, renderer: RendererResolver.resolve("cpu") });
  }
}
