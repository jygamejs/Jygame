import { describe, it } from "node:test";
import * as assert from "node:assert";
import { RendererResolver, BackendResolver } from "../../../particles/EngineResolvers.js";
import { GpuParticleRenderer } from "../../../particles/renderers/GpuParticleRenderer.js";
import { CanvasParticleRenderer } from "../../../particles/renderers/CanvasParticleRenderer.js";
import { GpuParticleBackend } from "../../../particles/backends/GpuParticleBackend.js";
import { CpuParticleBackend } from "../../../particles/backends/CpuParticleBackend.js";
import { makeMockGL } from "../../ecs/tests/lib/MockGL.js";
import { makeMockGPU } from "../../ecs/tests/lib/MockGPU.js";

function withNavigatorGPU(gpuValue, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const hadNavigator = desc !== undefined;
  try {
    if (gpuValue === undefined) {
      if (hadNavigator) delete globalThis.navigator;
    } else {
      Object.defineProperty(globalThis, "navigator", { value: { gpu: gpuValue }, configurable: true });
    }
    return fn();
  } finally {
    if (hadNavigator) {
      Object.defineProperty(globalThis, "navigator", desc);
    } else {
      delete globalThis.navigator;
    }
  }
}

function wgpuCanvas() {
  const mock = makeMockGPU();
  return { canvas: { width: 800, height: 600, getContext: (kind) => (kind === "webgpu" ? mock.context : null) }, mock };
}

describe("particle RendererResolver (context source)", () => {
  it("resolves 'gpu' to a GpuParticleRenderer wired to a renderer-provided GL context", () => {
    const { gl } = makeMockGL();
    const renderer = { gl };
    const r = RendererResolver.resolve("gpu", { renderer });
    assert.ok(r instanceof GpuParticleRenderer);
    assert.strictEqual(r._gl, gl);
    r.destroy();
  });

  it("resolves 'gpu' from a raw WebGL2 context", () => {
    const { gl } = makeMockGL();
    const r = RendererResolver.resolve("gpu", { renderer: gl });
    assert.ok(r instanceof GpuParticleRenderer);
    assert.strictEqual(r._gl, gl);
    r.destroy();
  });

  it("throws for 'gpu' without a GL context", () => {
    assert.throws(() => RendererResolver.resolve("gpu"), /WebGL2 context/);
    assert.throws(() => RendererResolver.resolve("gpu", { renderer: {} }), /WebGL2 context/);
  });

  it("resolves 'cpu' to a CanvasParticleRenderer regardless of the context source", () => {
    const { gl } = makeMockGL();
    assert.ok(RendererResolver.resolve("cpu", { renderer: { gl } }) instanceof CanvasParticleRenderer);
  });
});

describe("particle BackendResolver (context source)", () => {
  it("constructs a GpuParticleBackend for backend 'gpu' with a renderer-provided GL context", () => {
    const { gl } = makeMockGL();
    const backend = BackendResolver.resolve({ backend: "gpu", renderer: { gl } });
    assert.ok(backend instanceof GpuParticleBackend);
    assert.ok(backend._renderer instanceof GpuParticleRenderer);
    assert.strictEqual(backend._renderer._gl, gl);
    backend.destroy();
  });

  it("constructs a compute-mode GpuParticleBackend for backend 'gpu' with a WebGPU canvas", () => {
    const { canvas } = wgpuCanvas();
    const backend = BackendResolver.resolve({ backend: "gpu", renderer: { canvas } });
    assert.ok(backend instanceof GpuParticleBackend);
    assert.strictEqual(backend._mode, "compute");
    assert.strictEqual(backend._canvas, canvas);
    backend.destroy();
  });

  it("auto-selects the GPU backend when a GL context is provided", () => {
    const { gl } = makeMockGL();
    const backend = BackendResolver.resolve({ renderer: { gl } });
    assert.ok(backend instanceof GpuParticleBackend);
    backend.destroy();
  });

  it("auto-selects the compute backend when a WebGPU canvas and WebGPU are available", () => {
    const { canvas } = wgpuCanvas();
    const backend = withNavigatorGPU({}, () => BackendResolver.resolve({ renderer: { canvas } }));
    assert.ok(backend instanceof GpuParticleBackend);
    assert.strictEqual(backend._mode, "compute");
    assert.strictEqual(backend._canvas, canvas);
    backend.destroy();
  });

  it("still throws for backend 'gpu' without a GL context", () => {
    assert.throws(() => BackendResolver.resolve({ backend: "gpu" }), /WebGL2 context/);
  });

  it("falls back to CPU when no context source is provided", () => {
    const backend = BackendResolver.resolve({});
    assert.ok(backend instanceof CpuParticleBackend);
    backend.destroy();
  });

  it("passes through a backend instance unchanged", () => {
    const inst = new CpuParticleBackend({});
    assert.strictEqual(BackendResolver.resolve({ backend: inst }), inst);
    inst.destroy();
  });
});
