import { describe, it } from "node:test";
import * as assert from "node:assert";
import { RendererResolver, BackendResolver } from "../../../particles/EngineResolvers.js";
import { GpuParticleRenderer } from "../../../particles/renderers/GpuParticleRenderer.js";
import { CanvasParticleRenderer } from "../../../particles/renderers/CanvasParticleRenderer.js";
import { GpuParticleBackend } from "../../../particles/backends/GpuParticleBackend.js";
import { CpuParticleBackend } from "../../../particles/backends/CpuParticleBackend.js";
import { makeMockGL } from "../../ecs/tests/lib/MockGL.js";

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

  it("auto-selects the GPU backend when a GL context is provided", () => {
    const { gl } = makeMockGL();
    const backend = BackendResolver.resolve({ renderer: { gl } });
    assert.ok(backend instanceof GpuParticleBackend);
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
