import { CpuParticleBackend } from "./backends/CpuParticleBackend.js";
import { GpuParticleBackend } from "./backends/GpuParticleBackend.js";
import { CanvasParticleRenderer } from "./renderers/CanvasParticleRenderer.js";
import { GpuParticleRenderer } from "./renderers/GpuParticleRenderer.js";
import { WebGpuDeviceManager } from "./gpu/webgpu/WebGpuDeviceManager.js";

// Extracts a WebGL2 context from a context source. Accepts a raw GL context, a
// renderer exposing a `gl` getter (e.g. `WebGLRenderer`), or nothing.
function resolveGL(source) {
  if (!source) return null;
  if (source.gl && typeof source.gl.enable === "function") {
    return source.gl;
  }
  if (typeof source.enable === "function" && typeof source.createShader === "function") {
    return source;
  }
  return null;
}

export class RendererResolver {
  static resolve(backend, { renderer } = {}) {
    if (backend === "gpu") {
      const gl = resolveGL(renderer);
      return new GpuParticleRenderer(gl ? { gl } : {});
    }
    return new CanvasParticleRenderer({});
  }
}

export class BackendResolver {
  static resolve({ backend, storage, renderer } = {}) {
    if (backend === "cpu") {
      return new CpuParticleBackend({ storage, renderer: RendererResolver.resolve("cpu") });
    }
    if (backend === "gpu") {
      const gl = resolveGL(renderer);
      return new GpuParticleBackend({ storage, renderer: new GpuParticleRenderer(gl ? { gl } : {}) });
    }
    if (backend != null && typeof backend !== "string") {
      return backend;
    }
    const gl = resolveGL(renderer);
    if (gl) {
      try {
        return new GpuParticleBackend({ storage, renderer: new GpuParticleRenderer({ gl }) });
      } catch (err) {
        // GPU renderer unavailable — fall back to the CPU backend
      }
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
