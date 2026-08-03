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

// Extracts a canvas that can provide a WebGPU context from a context source
// (e.g. `WebGpuRenderer.canvas`). Returns null when the source is a WebGL
// source or has no usable canvas.
function resolveWebGpu(source) {
  if (!source) return null;
  if (source.gl) return null;
  const canvas = source.canvas || source;
  if (canvas && typeof canvas.getContext === "function") {
    try {
      return canvas.getContext("webgpu") ? canvas : null;
    } catch (err) {
      return null;
    }
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
      if (gl) {
        return new GpuParticleBackend({ storage, renderer: new GpuParticleRenderer({ gl }) });
      }
      const canvas = resolveWebGpu(renderer);
      if (canvas) {
        return new GpuParticleBackend({ storage, mode: "compute", canvas });
      }
      return new GpuParticleBackend({ storage, renderer: new GpuParticleRenderer({}) });
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
    const canvas = resolveWebGpu(renderer);
    if (canvas && WebGpuDeviceManager.isAvailable()) {
      try {
        return new GpuParticleBackend({ storage, mode: "compute", canvas });
      } catch (err) {
        // WebGPU compute unavailable — fall back to the CPU backend
      }
    }
    return new CpuParticleBackend({ storage, renderer: RendererResolver.resolve("cpu") });
  }
}
